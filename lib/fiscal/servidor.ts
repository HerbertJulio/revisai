import 'server-only';

// As notas fiscais no servidor: confere que quem pede é dono ou gerente da oficina (acessoDaOficina),
// fala com o emissor e grava no banco com a chave do sistema (as funções do banco conferem de novo
// o papel e o plano). O certificado e a senha passam direto para o emissor: nada é guardado.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { acessoDaOficina } from '../conta';
import { mensagemDoBanco } from '../conta-dados';
import { clienteSistema } from '../supabase-servidor';
import type { Documento, Id, ItemEstoque } from '../tipos';
import { credenciaisGuardadas, credenciaisParaGuardar } from './cripto';
import { COLUNAS_DA_NOTA, lerNotaFiscal, podeCancelar, type NotaFiscal } from './dados';
import { chaveFiscal, provedorFiscal, provedorFiscalPorNome } from './index';
import { configParaSalvar, esquemaAjustesFiscais, lerConfigFiscal, montarNfe, montarNfse, novaReferencia, type AjustesFiscais, type ConfigFiscal } from './payload';
import { ErroFiscal, type CredenciaisFiscais, type EmpresaFiscal, type NomeProvedorFiscal, type ProvedorFiscal, type ResultadoNota, type TipoNota } from './tipos';

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const DESLIGADO = 'As notas fiscais ainda não estão ligadas no Revisaí. Assim que estiverem, é só voltar aqui.';
const SO_GESTAO = 'Só o dono e o gerente cuidam das notas fiscais.';
const SO_PRO = 'As notas fiscais são do Pro. Assine (ou comece o teste) para emitir.';

interface Gestao {
  sys: SupabaseClient;
  oficinaId: string;
  userId: string;
  oficina: { nome: string; whatsapp: string | null; cidade: string | null; uf: string | null; plano: string };
}

async function gestao(): Promise<{ ok: true; g: Gestao } | { ok: false; erro: string }> {
  const a = await acessoDaOficina();
  if (!a.ok) return a;
  if (a.oficina.papel === 'mecanico') return { ok: false, erro: SO_GESTAO };
  const sys = clienteSistema();
  if (!sys) return { ok: false, erro: DESLIGADO };
  return {
    ok: true,
    g: { sys, oficinaId: a.oficina.id, userId: a.conta.usuario.id, oficina: { nome: a.oficina.nome, whatsapp: a.oficina.whatsapp, cidade: a.oficina.cidade, uf: a.oficina.uf, plano: a.oficina.plano } }
  };
}

function erroDe(e: unknown, padrao = 'Não deu para falar com o emissor de notas agora. Tente de novo.'): string {
  if (e instanceof ErroFiscal) return e.message;
  console.error('[fiscal]', e);
  return padrao;
}

/** O que a tela precisa saber do servidor: se há emissor e qual. */
export function estadoDoEmissor(): { ligado: boolean; provedor: NomeProvedorFiscal | null } {
  const p = provedorFiscal();
  return { ligado: !!p, provedor: p?.nome ?? null };
}

async function lerConfig(g: Gestao): Promise<ConfigFiscal | null> {
  const { data, error } = await g.sys.from('oficinas_fiscal').select('*').eq('oficina_id', g.oficinaId).maybeSingle();
  if (error) throw new Error(`oficinas_fiscal: ${error.message}`);
  return lerConfigFiscal(data);
}

async function lerCredenciais(g: Gestao): Promise<{ provedor: string; credenciais: CredenciaisFiscais } | null> {
  const { data, error } = await g.sys.rpc('fiscal_credenciais', { p_oficina: g.oficinaId });
  if (error) throw new Error(`fiscal_credenciais: ${error.message}`);
  if (!data || typeof data !== 'object') return null;
  const d = data as { provedor?: string; dados?: unknown };
  const credenciais = credenciaisGuardadas(d.dados, chaveFiscal());
  return credenciais && d.provedor ? { provedor: d.provedor, credenciais } : null;
}

function empresaDe(a: AjustesFiscais, g: Gestao): EmpresaFiscal {
  return {
    cnpj: a.cnpj,
    razaoSocial: a.razaoSocial,
    nomeFantasia: g.oficina.nome,
    regime: a.regime,
    inscricaoMunicipal: a.inscricaoMunicipal,
    inscricaoEstadual: a.inscricaoEstadual,
    email: a.email,
    telefone: g.oficina.whatsapp ? g.oficina.whatsapp.replace(/^55/, '') : null,
    endereco: a.endereco,
    padraoNfse: a.padraoNfse,
    ambiente: a.ambiente
  };
}

// ---------------------------------------------------------------- cadastro fiscal

/** Salva o cadastro fiscal: cadastra (ou atualiza) a empresa no emissor e grava no banco. */
export async function salvarAjustesFiscais(entrada: unknown): Promise<Resultado<{ config: ConfigFiscal }>> {
  const r = await gestao();
  if (!r.ok) return r;
  const { g } = r;
  const provedor = provedorFiscal();
  if (!provedor) return { ok: false, erro: DESLIGADO };
  if (g.oficina.plano === 'gratis') return { ok: false, erro: SO_PRO };
  const p = esquemaAjustesFiscais.safeParse(entrada);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? 'Confira os dados fiscais.' };
  const a = p.data;
  try {
    const anterior = await lerConfig(g);
    const guardadas = await lerCredenciais(g);
    // outro CNPJ ou outro emissor é outra empresa no emissor
    const atual = guardadas && guardadas.provedor === provedor.nome && anterior?.cnpj === a.cnpj ? guardadas.credenciais : null;
    const cadastrada = await provedor.cadastrarEmpresa(empresaDe(a, g), atual);
    const cred = await g.sys.rpc('fiscal_guardar_credenciais', {
      p_oficina: g.oficinaId,
      p_user: g.userId,
      p_provedor: provedor.nome,
      p_dados: credenciaisParaGuardar(cadastrada.credenciais, chaveFiscal())
    });
    if (cred.error) return { ok: false, erro: mensagemDoBanco(cred.error) };
    const salvo = await g.sys.rpc('fiscal_salvar_config', { p_oficina: g.oficinaId, p_user: g.userId, p_config: configParaSalvar(a, provedor.nome, cadastrada.credenciais.empresaId) });
    if (salvo.error) return { ok: false, erro: mensagemDoBanco(salvo.error) };
    if (cadastrada.certificadoValidoAte) {
      await g.sys.rpc('fiscal_certificado', { p_oficina: g.oficinaId, p_user: g.userId, p_valido_ate: cadastrada.certificadoValidoAte });
    }
    const config = lerConfigFiscal(salvo.data);
    if (!config) return { ok: false, erro: 'Não deu para ler o cadastro salvo. Recarregue a página.' };
    return { ok: true, config: cadastrada.certificadoValidoAte ? { ...config, certificadoValidoAte: cadastrada.certificadoValidoAte } : config };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

const TAMANHO_MAXIMO_CERTIFICADO = 64 * 1024;

/** Manda o certificado A1 direto para o emissor (o arquivo e a senha não ficam no Revisaí). */
export async function enviarCertificadoFiscal(form: FormData): Promise<Resultado<{ validoAte: string | null }>> {
  const r = await gestao();
  if (!r.ok) return r;
  const { g } = r;
  const provedor = provedorFiscal();
  if (!provedor) return { ok: false, erro: DESLIGADO };
  const arquivo = form.get('certificado');
  const senha = String(form.get('senha') ?? '');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: 'Escolha o arquivo do certificado A1 (.pfx ou .p12).' };
  if (!/\.(pfx|p12)$/i.test(arquivo.name)) return { ok: false, erro: 'O certificado A1 é um arquivo .pfx ou .p12.' };
  if (arquivo.size > TAMANHO_MAXIMO_CERTIFICADO) return { ok: false, erro: 'Este arquivo é grande demais para um certificado A1.' };
  if (!senha || senha.length > 200) return { ok: false, erro: 'Escreva a senha do certificado.' };
  try {
    const config = await lerConfig(g);
    const guardadas = await lerCredenciais(g);
    if (!config || !guardadas || guardadas.provedor !== provedor.nome) return { ok: false, erro: 'Salve o cadastro fiscal antes de mandar o certificado.' };
    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString('base64');
    const { validoAte } = await provedor.enviarCertificado(guardadas.credenciais, config.cnpj, base64, senha);
    const { error } = await g.sys.rpc('fiscal_certificado', { p_oficina: g.oficinaId, p_user: g.userId, p_valido_ate: validoAte });
    if (error) return { ok: false, erro: mensagemDoBanco(error) };
    return { ok: true, validoAte };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

// ---------------------------------------------------------------- emissão

const esquemaLinha = z.object({
  id: z.string().min(1).max(100),
  tipo: z.enum(['peca', 'servico', 'outro']),
  servico: z.string().max(40).optional(),
  descricao: z.string().max(300),
  quantidade: z.number().finite().min(0).max(100_000),
  unidade: z.enum(['un', 'L', 'h']),
  valorUnitario: z.number().finite().min(-1_000_000).max(1_000_000).nullable(),
  estoqueId: z.string().max(100).optional(),
  recusada: z.boolean().optional()
});

const esquemaEndereco = z.object({
  logradouro: z.string().trim().max(120),
  numero: z.string().trim().max(20),
  complemento: z.string().trim().max(60).nullish(),
  bairro: z.string().trim().max(60),
  municipio: z.string().trim().max(60),
  uf: z.string().trim().max(2),
  cep: z.string().transform((v) => v.replace(/\D/g, '')),
  codigoMunicipio: z.string().trim().max(7).nullish()
});

export const esquemaEmissao = z.object({
  tipo: z.enum(['nfse', 'nfe']),
  documento: z.object({
    id: z.string().min(1).max(100),
    numero: z.number().int().min(0),
    tipo: z.literal('ordem'),
    situacao: z.enum(['aberta', 'concluida']),
    linhas: z.array(esquemaLinha).min(1).max(300),
    desconto: z.number().finite().min(0).nullable(),
    carro: z.object({ modelo: z.string().max(80).optional(), placa: z.string().max(10).optional() }).nullish()
  }),
  tomador: z.object({
    nome: z.string().trim().max(150),
    documento: z.string().trim().max(20),
    email: z.string().trim().max(160).nullish(),
    telefone: z.string().trim().max(20).nullish(),
    endereco: esquemaEndereco.nullish()
  }),
  descricao: z.string().max(1000).default(''),
  escolhas: z.array(z.object({ linhaId: z.string().max(100), ncm: z.string().max(10), cfop: z.enum(['5102', '5405']) })).max(300).default([]),
  estoque: z.record(z.string().max(100), z.object({ ncm: z.string().max(10).optional(), codigo: z.string().max(60).optional(), ean: z.string().max(20).optional() })).default({})
});
export type PedidoDeEmissao = z.input<typeof esquemaEmissao>;

/** O resultado do emissor no formato da função do banco. */
function dadosDaNota(n: Partial<ResultadoNota>): Record<string, unknown> {
  return { situacao: n.situacao ?? null, numero: n.numero ?? null, serie: n.serie ?? null, chave: n.chave ?? null, urlPdf: n.urlPdf ?? null, urlXml: n.urlXml ?? null, mensagem: n.mensagem ?? null };
}

async function atualizar(sys: SupabaseClient, provedor: string, externo: string, n: Partial<ResultadoNota>): Promise<NotaFiscal | null> {
  const { data, error } = await sys.rpc('fiscal_atualizar_nota', { p_provedor: provedor, p_externo: externo, p_dados: dadosDaNota(n) });
  if (error) throw new Error(`fiscal_atualizar_nota: ${error.message}`);
  return lerNotaFiscal(data);
}

/** Emite a NFS-e (mão de obra) ou a NF-e (peças) da ordem. A nota nasce processando no banco antes de ir ao emissor. */
export async function emitirNotaDaOrdem(entrada: unknown): Promise<Resultado<{ nota: NotaFiscal }>> {
  const r = await gestao();
  if (!r.ok) return r;
  const { g } = r;
  const provedor = provedorFiscal();
  if (!provedor) return { ok: false, erro: DESLIGADO };
  if (g.oficina.plano === 'gratis') return { ok: false, erro: SO_PRO };
  const p = esquemaEmissao.safeParse(entrada);
  if (!p.success) return { ok: false, erro: 'Confira os dados da nota.' };
  const e = p.data;
  let config: ConfigFiscal | null;
  let credenciais: CredenciaisFiscais;
  try {
    config = await lerConfig(g);
    const guardadas = await lerCredenciais(g);
    if (!config || !guardadas || config.provedor !== provedor.nome || guardadas.provedor !== provedor.nome) {
      return { ok: false, erro: 'Configure as notas fiscais da oficina primeiro (Mais, Notas fiscais).' };
    }
    credenciais = guardadas.credenciais;
  } catch (err) {
    return { ok: false, erro: erroDe(err) };
  }
  const doc = { ...e.documento, veiculoId: null, km: null, data: '', criadoEm: '', atualizadoEm: '' } as unknown as Documento;
  const estoque = Object.fromEntries(Object.entries(e.estoque).map(([id, i]) => [id, { id, ...i } as unknown as ItemEstoque])) as Record<Id, ItemEstoque>;
  const tomador = { ...e.tomador, email: e.tomador.email || null, telefone: e.tomador.telefone || null, endereco: e.tomador.endereco ?? null };
  const agora = new Date();
  let nova: { tipo: TipoNota; valor: number; emitir: () => Promise<ResultadoNota>; referencia: string };
  try {
    if (e.tipo === 'nfse') {
      const referencia = novaReferencia(config.padraoNfse === 'nacional' ? 'nfsen' : 'nfse', g.oficinaId);
      const n = montarNfse({ config, doc, tomador, referencia, agora, descricao: e.descricao });
      nova = { tipo: 'nfse', valor: n.servico.valor, referencia, emitir: () => provedor.emitirNfse(n, credenciais) };
    } else {
      const referencia = novaReferencia('nfe', g.oficinaId);
      const n = montarNfe({ config, doc, tomador, escolhas: e.escolhas, estoque, referencia, agora });
      nova = { tipo: 'nfe', valor: n.valorTotal, referencia, emitir: () => provedor.emitirNfe(n, credenciais) };
    }
  } catch (err) {
    return { ok: false, erro: erroDe(err, 'Confira os dados da nota.') };
  }

  const registro = await g.sys.rpc('fiscal_registrar_nota', {
    p_oficina: g.oficinaId,
    p_user: g.userId,
    p_documento: e.documento.id,
    p_tipo: nova.tipo,
    p_provedor: provedor.nome,
    p_externo: nova.referencia,
    p_ambiente: config.ambiente,
    p_valor: nova.valor,
    p_tomador: { nome: tomador.nome.trim(), documento: tomador.documento.replace(/[^0-9A-Za-z]/g, '').toUpperCase(), email: tomador.email },
    p_situacao: 'processando',
    p_mensagem: null
  });
  if (registro.error) return { ok: false, erro: mensagemDoBanco(registro.error) };
  const registrada = lerNotaFiscal(registro.data);
  if (!registrada) return { ok: false, erro: 'Não deu para registrar a nota. Tente de novo.' };

  try {
    const resultado = await nova.emitir();
    const nota = await atualizar(g.sys, provedor.nome, nova.referencia, { ...resultado, externo: nova.referencia });
    return { ok: true, nota: nota ?? registrada };
  } catch (err) {
    if (err instanceof ErroFiscal && err.status != null && err.status >= 400 && err.status < 500) {
      // o emissor recusou o pedido: a nota fica recusada, com o motivo, e dá para emitir de novo
      const nota = await atualizar(g.sys, provedor.nome, nova.referencia, { situacao: 'erro', mensagem: err.message }).catch(() => null);
      return { ok: true, nota: nota ?? { ...registrada, situacao: 'erro', mensagem: err.message } };
    }
    // sem resposta: a nota fica processando e a consulta mostra o que o emissor recebeu
    console.warn('[fiscal] emitir sem resposta', nova.referencia, err instanceof Error ? err.message : err);
    return { ok: true, nota: registrada };
  }
}

async function notaDaOficina(g: Gestao, id: string): Promise<NotaFiscal | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await g.sys.from('notas_fiscais').select(COLUNAS_DA_NOTA).eq('oficina_id', g.oficinaId).eq('id', id).maybeSingle();
  if (error) throw new Error(`notas_fiscais: ${error.message}`);
  return lerNotaFiscal(data);
}

async function credenciaisDo(g: Gestao, provedor: ProvedorFiscal): Promise<CredenciaisFiscais> {
  const guardadas = await lerCredenciais(g);
  if (!guardadas || guardadas.provedor !== provedor.nome) throw new ErroFiscal('O cadastro da oficina no emissor de notas mudou. Salve o cadastro fiscal de novo.');
  return guardadas.credenciais;
}

/** Quanto tempo a nota pode ficar sem existir no emissor antes de ser dada como perdida. */
const PERDIDA_DEPOIS_MS = 2 * 60_000;

/** Pergunta ao emissor como está a nota que ainda processa (as outras voltam como estão). */
export async function consultarNotaFiscal(id: string): Promise<Resultado<{ nota: NotaFiscal }>> {
  const r = await gestao();
  if (!r.ok) return r;
  const { g } = r;
  try {
    const nota = await notaDaOficina(g, id);
    if (!nota) return { ok: false, erro: 'Nota não encontrada.' };
    if (nota.situacao !== 'processando') return { ok: true, nota };
    const provedor = provedorFiscalPorNome(nota.provedor);
    if (!provedor) return { ok: true, nota };
    const resultado = await provedor.consultar(nota.tipo, nota.externo, nota.ambiente, await credenciaisDo(g, provedor));
    if (!resultado) {
      if (Date.now() - new Date(nota.criadoEm).getTime() < PERDIDA_DEPOIS_MS) return { ok: true, nota };
      const perdida = await atualizar(g.sys, nota.provedor, nota.externo, { situacao: 'erro', mensagem: 'A nota não chegou ao emissor. Emita de novo.' });
      return { ok: true, nota: perdida ?? nota };
    }
    return { ok: true, nota: (await atualizar(g.sys, nota.provedor, nota.externo, resultado)) ?? nota };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

/** Cancela a nota autorizada (a NF-e em até 24 horas; a NFS-e, no prazo da prefeitura). */
export async function cancelarNotaFiscal(id: string, justificativa: string): Promise<Resultado<{ nota: NotaFiscal }>> {
  const r = await gestao();
  if (!r.ok) return r;
  const { g } = r;
  const motivo = (justificativa ?? '').trim().replace(/\s+/g, ' ');
  if (motivo.length < 15 || motivo.length > 255) return { ok: false, erro: 'Escreva o motivo do cancelamento com 15 a 255 letras.' };
  try {
    const nota = await notaDaOficina(g, id);
    if (!nota) return { ok: false, erro: 'Nota não encontrada.' };
    if (nota.situacao === 'cancelada') return { ok: true, nota };
    if (!podeCancelar(nota)) {
      return { ok: false, erro: nota.situacao !== 'autorizada' ? 'Só a nota autorizada pode ser cancelada.' : 'Passou o prazo para cancelar esta NF-e (24 horas). Fale com o seu contador.' };
    }
    const provedor = provedorFiscalPorNome(nota.provedor);
    if (!provedor) return { ok: false, erro: DESLIGADO };
    const resultado = await provedor.cancelar(nota.tipo, nota.externo, nota.ambiente, motivo, await credenciaisDo(g, provedor));
    return { ok: true, nota: (await atualizar(g.sys, nota.provedor, nota.externo, resultado)) ?? nota };
  } catch (e) {
    return { ok: false, erro: erroDe(e, 'Não deu para cancelar agora. Tente de novo.') };
  }
}

/** Consulta as notas que ainda processam (as de mais de meio minuto), para o resumo das ordens. */
export async function atualizarNotasProcessando(): Promise<Resultado<{ notas: NotaFiscal[] }>> {
  const r = await gestao();
  if (!r.ok) return r;
  const { g } = r;
  try {
    const { data, error } = await g.sys
      .from('notas_fiscais')
      .select(COLUNAS_DA_NOTA)
      .eq('oficina_id', g.oficinaId)
      .eq('situacao', 'processando')
      .lt('criado_em', new Date(Date.now() - 30_000).toISOString())
      .order('criado_em')
      .limit(10);
    if (error) throw new Error(error.message);
    const notas: NotaFiscal[] = [];
    for (const linha of data ?? []) {
      const n = lerNotaFiscal(linha);
      if (!n) continue;
      const c = await consultarNotaFiscal(n.id);
      if (c.ok) notas.push(c.nota);
    }
    return { ok: true, notas };
  } catch (e) {
    return { ok: false, erro: erroDe(e) };
  }
}

// ---------------------------------------------------------------- avisos do emissor

/** Guarda e aplica o aviso do emissor (uma vez só). Devolve false quando o banco falhou (o emissor manda de novo). */
export async function aplicarAvisoFiscal(provedor: string, eventoId: string, nota: ResultadoNota): Promise<{ ok: boolean; novo: boolean }> {
  const sys = clienteSistema();
  if (!sys) return { ok: false, novo: false };
  const { data, error } = await sys.rpc('fiscal_webhook', { p_provedor: provedor, p_evento: eventoId, p_externo: nota.externo, p_dados: dadosDaNota(nota) });
  if (error) {
    console.error('[fiscal] aviso', provedor, eventoId, error.message);
    return { ok: false, novo: false };
  }
  return { ok: true, novo: !!(data as { novo?: boolean } | null)?.novo };
}
