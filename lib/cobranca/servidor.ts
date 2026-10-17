import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mensagemDoBanco } from '@/lib/conta-dados';
import { clienteSistema } from '@/lib/supabase-servidor';
import { aplicarEvento, DESCRICAO_PRO, precisaEmitirNota, type BancoCobranca } from './aplicar';
import { bancoSupabase, gravarNota, lerAssinatura, lerPagamento, registrarPagamento } from './banco';
import { hojeEmBrasilia, maisDias } from './documento';
import { configAsaas, NOME_DO_SERVICO, provedorAvulso, provedorDeNota, provedorPara, provedorPorNome } from './index';
import {
  COLUNAS_ASSINATURA,
  COLUNAS_PAGAMENTO,
  ErroDoGateway,
  type Cobranca,
  type Evento,
  type LinhaAssinatura,
  type LinhaPagamento,
  type Metodo,
  type NomeProvedor,
  type Pagador,
  type Provedor
} from './tipos';

// O que o app faz com a cobrança: assinar e cancelar o Pro, conferir um pagamento, cobrar uma
// loja, emitir a nota, agendar o Pix Automático do mês e aplicar os avisos dos gateways.
// Quem chama confere antes quem é a pessoa (dono ou gerente da oficina; financeiro da equipe);
// aqui o banco é escrito com a chave do sistema, só depois de falar com o gateway.

export type Res<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const SEM_SISTEMA = 'A cobrança não está configurada neste servidor (falta a chave do sistema).';

export function mensagemDoGateway(e: unknown): string {
  if (e instanceof ErroDoGateway) {
    if (e.status === 401 || e.status === 403) return 'O banco que cobra recusou a conexão. Avise a equipe do Revisaí.';
    return `O banco que cobra não aceitou: ${e.message}`;
  }
  console.error('[cobranca]', e);
  return 'Não deu para falar com o banco que cobra agora. Tente de novo em alguns minutos.';
}

function sistemaOuErro(): SupabaseClient | null {
  return clienteSistema();
}

export async function assinaturaViva(sb: SupabaseClient, oficinaId: string): Promise<LinhaAssinatura | null> {
  const { data, error } = await sb
    .from('assinaturas_pro')
    .select(COLUNAS_ASSINATURA)
    .eq('oficina_id', oficinaId)
    .neq('situacao', 'cancelada')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`[cobranca] assinatura viva: ${error.message}`);
  return data ? lerAssinatura(data as Record<string, unknown>) : null;
}

/** Cancela no gateway (já cancelada lá conta como cancelada). */
async function cancelarNoGateway(a: LinhaAssinatura): Promise<Res> {
  const provedor = provedorPorNome(a.provedor);
  if (!provedor || !a.assinatura_externa) return { ok: true };
  try {
    await provedor.cancelarAssinatura(a.assinatura_externa);
    return { ok: true };
  } catch (e) {
    if (e instanceof ErroDoGateway && (e.status === 404 || e.status === 410)) return { ok: true };
    return { ok: false, erro: mensagemDoGateway(e) };
  }
}

// ------------------------------------------------------------------ assinatura do Pro

export interface DadosDaAssinatura {
  metodo: Metodo;
  documento: string;
  nome: string;
  email: string;
  telefone: string | null;
}

export interface OficinaQueAssina {
  id: string;
  nome: string;
  whatsapp: string | null;
}

/** Cria a assinatura no gateway e guarda; a assinatura anterior (se houver) é cancelada depois. */
export async function assinarPro(sbUsuario: SupabaseClient, oficina: OficinaQueAssina, userId: string, d: DadosDaAssinatura, ip: string | null): Promise<Res> {
  const provedor = provedorPara(d.metodo);
  if (!provedor || !provedor.metodos.includes(d.metodo)) return { ok: false, erro: 'Esse jeito de pagar não está disponível agora.' };
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };

  // o preço, como a pessoa (o banco confere que ela é desta oficina)
  const { data: preco, error: erroPreco } = await sbUsuario.rpc('cobranca_preco', { p_oficina: oficina.id });
  if (erroPreco) return { ok: false, erro: mensagemDoBanco(erroPreco) };
  const valor = Number((preco as { valor?: number } | null)?.valor);
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: 'Não deu para calcular o preço agora.' };

  const anterior = await assinaturaViva(sistema, oficina.id);
  const pagador: Pagador = { nome: d.nome, documento: d.documento, email: d.email, telefone: d.telefone ?? oficina.whatsapp, referencia: oficina.id };
  const hoje = hojeEmBrasilia();
  const primeiroVencimento = d.metodo === 'boleto' ? maisDias(hoje, 3) : hoje;

  let criada;
  try {
    const cliente = await provedor.criarCliente(pagador);
    criada = await provedor.criarAssinatura({ cliente, pagador, metodo: d.metodo, valor, descricao: DESCRICAO_PRO, primeiroVencimento, ip });
  } catch (e) {
    return { ok: false, erro: mensagemDoGateway(e) };
  }

  const { data: id, error } = await sistema.rpc('cobranca_registrar_assinatura', {
    p_oficina: oficina.id,
    p_provedor: provedor.nome,
    p_metodo: d.metodo,
    p_cliente: criada.clienteExterno,
    p_assinatura: criada.assinaturaExterna,
    p_valor: valor,
    p_documento: d.documento,
    p_nome: d.nome,
    p_email: d.email,
    p_vencimento: criada.proximoVencimento ?? primeiroVencimento,
    p_autorizacao: criada.autorizacao,
    p_user: userId
  });
  if (error || !id) {
    // não ficou guardada: desfaz no gateway para não cobrar sem o Revisaí saber
    await provedor.cancelarAssinatura(criada.assinaturaExterna).catch(() => undefined);
    console.error('[cobranca] registrar assinatura', error);
    return { ok: false, erro: 'Não deu para guardar a assinatura. Nada foi cobrado; tente de novo.' };
  }

  if (criada.primeira) {
    const p = criada.primeira;
    try {
      await registrarPagamento(sistema, {
        provedor: provedor.nome,
        externo: p.externo,
        tipo: 'pro',
        oficinaId: oficina.id,
        fornecedorId: null,
        assinaturaId: String(id),
        valor: p.valor > 0 ? p.valor : valor,
        vencimento: p.vencimento ?? primeiroVencimento,
        metodo: d.metodo,
        descricao: DESCRICAO_PRO,
        link: p.link,
        pix: p.pixCopiaECola,
        boleto: p.boletoLinha,
        userId
      });
      if (p.situacao === 'pago') await aplicarEProcessar(provedor.nome, { id: `assinar:${p.externo}`, tipo: 'pago', externo: p.externo, pagoEm: p.pagoEm, assinatura: null, cobranca: null });
    } catch (e) {
      // a assinatura ficou guardada; a cobrança chega pelo aviso do gateway ou pela conferência da tela
      console.error('[cobranca] guardar a primeira cobrança', e instanceof Error ? e.message : e);
    }
  }

  // as que esta trocou (a anterior, e alguma criada ao mesmo tempo) saem do gateway
  const trocadas = new Map<string, LinhaAssinatura>();
  if (anterior) trocadas.set(anterior.id, anterior);
  const { data: recentes } = await sistema
    .from('assinaturas_pro')
    .select(COLUNAS_ASSINATURA)
    .eq('oficina_id', oficina.id)
    .eq('situacao', 'cancelada')
    .neq('id', String(id))
    .gte('cancelada_em', new Date(Date.now() - 5 * 60_000).toISOString());
  for (const l of recentes ?? []) {
    const a = lerAssinatura(l as Record<string, unknown>);
    trocadas.set(a.id, a);
  }
  for (const a of trocadas.values()) {
    if (a.assinatura_externa === criada.assinaturaExterna && a.provedor === provedor.nome) continue;
    const r = await cancelarNoGateway(a);
    if (!r.ok) console.error('[cobranca] cancelar a assinatura trocada', a.id, r.erro);
    // as cobranças em aberto da assinatura trocada não valem mais
    else if (a.assinatura_externa) await sistema.rpc('cobranca_assinatura_cancelada', { p_provedor: a.provedor, p_externa: a.assinatura_externa });
  }
  return { ok: true };
}

/** Cancela a assinatura: nada mais é cobrado; o Pro já pago vale até o fim. */
export async function cancelarPro(oficinaId: string): Promise<Res> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  const viva = await assinaturaViva(sistema, oficinaId);
  if (!viva) return { ok: false, erro: 'Não há assinatura para cancelar.' };
  const r = await cancelarNoGateway(viva);
  if (!r.ok) return r;
  const { error } = viva.assinatura_externa
    ? await sistema.rpc('cobranca_assinatura_cancelada', { p_provedor: viva.provedor, p_externa: viva.assinatura_externa })
    : await sistema.rpc('cobranca_atualizar_assinatura', { p_id: viva.id, p_situacao: 'cancelada' });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  return { ok: true };
}

function eventoDaSituacao(c: Cobranca, assinatura: string | null): Evento | null {
  const id = `conferido:${c.externo}:${c.situacao}`;
  switch (c.situacao) {
    case 'pago':
      return { id, tipo: 'pago', externo: c.externo, pagoEm: c.pagoEm, assinatura, cobranca: c };
    case 'atrasado':
      return { id, tipo: 'atrasado', externo: c.externo };
    case 'cancelado':
    case 'estornado':
      return { id, tipo: c.situacao, externo: c.externo };
    default:
      return { id, tipo: 'cobranca', cobranca: c, assinatura };
  }
}

/**
 * Pergunta ao gateway pelas cobranças em aberto da oficina (para quando o aviso ainda não chegou)
 * e pelas cobranças novas da assinatura. Devolve se alguma coisa mudou.
 */
export async function conferirPagamentos(oficinaId: string): Promise<Res<{ mudou: boolean }>> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  const { data, error } = await sistema
    .from('pagamentos')
    .select(COLUNAS_PAGAMENTO)
    .eq('oficina_id', oficinaId)
    .eq('tipo', 'pro')
    .in('situacao', ['pendente', 'atrasado'])
    .neq('provedor', 'manual')
    .order('criado_em', { ascending: false })
    .limit(3);
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  let mudou = false;
  const viva = await assinaturaViva(sistema, oficinaId);
  for (const linha of (data ?? []).map((l) => lerPagamento(l as Record<string, unknown>))) {
    const provedor = provedorPorNome(linha.provedor);
    if (!provedor || !linha.externo) continue;
    try {
      const c = await provedor.consultarPagamento(linha.externo);
      if (!c) continue;
      const pixNovo = c.situacao === 'pendente' && !!c.pixCopiaECola && c.pixCopiaECola !== linha.pix_copia_cola;
      if (c.situacao === linha.situacao && !pixNovo) continue;
      const assinatura = viva && viva.id === linha.assinatura_id ? viva.assinatura_externa : null;
      const e = eventoDaSituacao(c, assinatura);
      if (e && (await aplicarEProcessar(provedor.nome, e)).ok) mudou = mudou || c.situacao !== linha.situacao;
    } catch (e) {
      console.error('[cobranca] conferir', linha.id, e instanceof Error ? e.message : e);
    }
  }
  // cobranças da assinatura que o aviso não trouxe (a renovação do mês, ou a primeira que não
  // ficou guardada)
  const linhas = (data ?? []) as { assinatura_id?: string | null }[];
  if (viva?.assinatura_externa && !linhas.some((l) => l.assinatura_id === viva.id)) {
    const provedor = provedorPorNome(viva.provedor);
    try {
      for (const c of provedor ? await provedor.cobrancasDaAssinatura(viva.assinatura_externa) : []) {
        const ja = await bancoSupabase(sistema).pagamentoPorExterno(viva.provedor, c.externo);
        if (ja) continue;
        const e = eventoDaSituacao(c, viva.assinatura_externa);
        if (e && (await aplicarEProcessar(viva.provedor, e)).ok) mudou = true;
      }
    } catch (e) {
      console.error('[cobranca] cobranças da assinatura', viva.id, e instanceof Error ? e.message : e);
    }
  }
  return { ok: true, mudou };
}

// ------------------------------------------------------------------ avisos dos gateways

/** Aplica um evento e, se um pagamento foi confirmado, emite a nota quando o gateway não emite sozinho. */
export async function aplicarEProcessar(provedor: NomeProvedor, e: Evento, banco?: BancoCobranca): Promise<Res> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  try {
    const r = await aplicarEvento(provedor, e, banco ?? bancoSupabase(sistema));
    if (!r.ok) return r;
    if (r.pago) await notaDepoisDoPagamento(sistema, r.pago);
    return { ok: true };
  } catch (x) {
    return { ok: false, erro: x instanceof Error ? x.message.slice(0, 400) : 'Erro ao aplicar o aviso' };
  }
}

/** Processa os avisos novos (depois de responder ao gateway) e anota o resultado de cada um. */
export async function processarAvisos(provedor: NomeProvedor, eventos: Evento[]): Promise<void> {
  const sistema = sistemaOuErro();
  if (!sistema) return;
  for (const e of eventos) {
    const r = await aplicarEProcessar(provedor, e);
    const { error } = await sistema.rpc('cobranca_webhook_resultado', { p_provedor: provedor, p_evento: e.id, p_erro: r.ok ? null : r.erro });
    if (error) console.error('[cobranca] resultado do aviso', provedor, e.id, error.message);
    if (!r.ok) console.error('[cobranca] aviso não aplicado', provedor, e.id, r.erro);
  }
}

interface AvisoPendente {
  provedor: string;
  evento: string;
  tentativas: number;
  corpo: { evento?: Evento } | null;
}

/** Tenta de novo os avisos que falharam (até 10 tentativas cada). */
export async function reprocessarAvisos(limite = 50): Promise<Res<{ aplicados: number; falharam: number }>> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  const { data, error } = await sistema.rpc('cobranca_webhooks_pendentes', { p_limite: limite });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  let aplicados = 0;
  let falharam = 0;
  for (const w of (data ?? []) as AvisoPendente[]) {
    if (w.tentativas >= 10 || (w.provedor !== 'asaas' && w.provedor !== 'efi' && w.provedor !== 'teste')) continue;
    const e = w.corpo?.evento;
    const r: Res = e?.tipo ? await aplicarEProcessar(w.provedor, e) : { ok: false, erro: 'Aviso sem evento' };
    await sistema.rpc('cobranca_webhook_resultado', { p_provedor: w.provedor, p_evento: w.evento, p_erro: r.ok ? null : r.erro });
    if (r.ok) aplicados++;
    else falharam++;
  }
  return { ok: true, aplicados, falharam };
}

// ------------------------------------------------------------------ nota fiscal

function nomeDoMes(referencia: string | null): string {
  if (!referencia || !/^\d{4}-\d{2}$/.test(referencia)) return '';
  const [a, m] = referencia.split('-').map(Number);
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 15)));
  return `${nome} de ${a}`;
}

export function descricaoDaNota(p: Pick<LinhaPagamento, 'tipo' | 'referencia'>): string {
  const mes = nomeDoMes(p.referencia);
  return p.tipo === 'pro'
    ? `${NOME_DO_SERVICO}${mes ? `, ${mes}` : ''}`
    : `Revisaí: comissão sobre vendas e mensalidade da vitrine${mes ? `, ${mes}` : ''}`;
}

async function pagadorDoPagamento(sb: SupabaseClient, p: LinhaPagamento): Promise<Pagador | null> {
  if (p.tipo === 'loja' && p.fornecedor_id != null) {
    const { data } = await sb.from('fornecedores').select('id, nome, cnpj, email, whatsapp').eq('id', p.fornecedor_id).maybeSingle();
    const l = data as { nome: string; cnpj: string | null; email: string | null; whatsapp: string | null } | null;
    if (!l?.cnpj) return null;
    return { nome: l.nome, documento: l.cnpj, email: l.email ?? '', telefone: l.whatsapp, referencia: `loja-${p.fornecedor_id}` };
  }
  if (!p.oficina_id) return null;
  const base = () => sb.from('assinaturas_pro').select(COLUNAS_ASSINATURA).not('documento', 'is', null);
  const { data } = p.assinatura_id
    ? await base().eq('id', p.assinatura_id).maybeSingle()
    : await base().eq('oficina_id', p.oficina_id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const a = lerAssinatura(data as Record<string, unknown>);
  if (!a.documento) return null;
  return { nome: a.nome_nota ?? 'Oficina', documento: a.documento, email: a.email_nota ?? '', telefone: null, referencia: a.oficina_id };
}

/** Emite (ou emite de novo) a nota de um pagamento pago. O resultado fica no pagamento. */
export async function emitirNotaDoPagamento(sb: SupabaseClient, p: LinhaPagamento, emissor: Provedor | null = provedorDeNota()): Promise<Res> {
  if (!emissor) return { ok: false, erro: 'A nota fiscal não está configurada (NFSE_CODIGO_SERVICO no Asaas).' };
  if (p.situacao !== 'pago') return { ok: false, erro: 'A nota sai depois do pagamento.' };
  if (!p.externo) return { ok: false, erro: 'Pagamento sem identificação no gateway.' };
  const descricao = descricaoDaNota(p);
  try {
    let nota;
    if (p.provedor === emissor.nome) {
      nota = await emissor.emitirNota({ pagamentoExterno: p.externo, cliente: null, valor: p.valor, descricao });
    } else {
      const pagador = await pagadorDoPagamento(sb, p);
      if (!pagador) {
        await gravarNota(sb, p.provedor, p.externo, { externa: '', situacao: 'erro', numero: null, url: null, erro: 'Sem CPF ou CNPJ de quem pagou' });
        return { ok: false, erro: 'Sem CPF ou CNPJ de quem pagou: a nota não sai.' };
      }
      const cliente = await emissor.criarCliente(pagador);
      nota = await emissor.emitirNota({ pagamentoExterno: null, cliente, valor: p.valor, descricao });
    }
    await gravarNota(sb, p.provedor, p.externo, nota);
    return nota.situacao === 'erro' ? { ok: false, erro: nota.erro ?? 'A prefeitura recusou a nota.' } : { ok: true };
  } catch (e) {
    const erro = mensagemDoGateway(e);
    await gravarNota(sb, p.provedor, p.externo, { externa: '', situacao: 'erro', numero: null, url: null, erro: erro.slice(0, 300) }).catch(() => false);
    return { ok: false, erro };
  }
}

async function notaDepoisDoPagamento(sb: SupabaseClient, p: LinhaPagamento): Promise<void> {
  const emissor = provedorDeNota();
  const asaasEmiteNaAssinatura = !!configAsaas()?.nota;
  if (!precisaEmitirNota(p, emissor?.nome ?? null, asaasEmiteNaAssinatura)) return;
  const r = await emitirNotaDoPagamento(sb, p, emissor);
  if (!r.ok) console.error('[cobranca] nota', p.id, r.erro);
}

/** Depois de o financeiro marcar como pago, a nota sai como num pagamento pelo gateway. */
export async function notaDoPagamentoMarcado(pagamentoId: string): Promise<void> {
  const sistema = sistemaOuErro();
  if (!sistema) return;
  const p = await pagamentoPorId(sistema, pagamentoId);
  if (p) await notaDepoisDoPagamento(sistema, p);
}

export async function pagamentoPorId(sb: SupabaseClient, id: string): Promise<LinhaPagamento | null> {
  const { data, error } = await sb.from('pagamentos').select(COLUNAS_PAGAMENTO).eq('id', id).maybeSingle();
  if (error) throw new Error(`[cobranca] pagamento: ${error.message}`);
  return data ? lerPagamento(data as Record<string, unknown>) : null;
}

/** O financeiro pede a nota de novo (ou pela primeira vez). */
export async function reemitirNota(pagamentoId: string): Promise<Res> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  const p = await pagamentoPorId(sistema, pagamentoId);
  if (!p) return { ok: false, erro: 'Cobrança não encontrada.' };
  return emitirNotaDoPagamento(sistema, p);
}

// ------------------------------------------------------------------ lojas

/** O dia 10 do mês seguinte ao da referência, ou daqui a 3 dias se já passou. */
export function vencimentoDaLoja(mes: string, hoje = hojeEmBrasilia()): string {
  const [a, m] = mes.split('-').map(Number);
  const dez = new Date(Date.UTC(a, m, 10)).toISOString().slice(0, 10);
  const minimo = maisDias(hoje, 3);
  return dez < minimo ? minimo : dez;
}

/** Gera o Pix da mensalidade e da comissão de uma loja no gateway e guarda a cobrança. */
export async function cobrarLoja(sbEquipe: SupabaseClient, fornecedorId: number, mes: string, valor: number, userId: string): Promise<Res<{ id: string }>> {
  const provedor = provedorAvulso();
  if (!provedor) return { ok: false, erro: 'Nenhum gateway ligado: lance à mão e mande o Pix pelo WhatsApp.' };
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || !Number.isFinite(valor) || valor < 1) return { ok: false, erro: 'Confira o mês e o valor (a partir de R$ 1,00).' };

  const { data: loja, error } = await sbEquipe.from('fornecedores').select('id, nome, cnpj, email, whatsapp').eq('id', fornecedorId).maybeSingle();
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  const l = loja as { nome: string; cnpj: string | null; email: string | null; whatsapp: string | null } | null;
  if (!l) return { ok: false, erro: 'Loja não encontrada.' };
  if (!l.cnpj) return { ok: false, erro: 'A loja não tem CNPJ no cadastro; o Pix e a nota pedem o CNPJ.' };
  const { data: contrato } = await sbEquipe.from('fornecedores_contrato').select('email').eq('fornecedor_id', fornecedorId).maybeSingle();
  const pagador: Pagador = {
    nome: l.nome,
    documento: l.cnpj,
    email: l.email ?? (contrato as { email?: string | null } | null)?.email ?? '',
    telefone: l.whatsapp,
    referencia: `loja-${fornecedorId}`
  };
  const vencimento = vencimentoDaLoja(mes);
  const descricao = descricaoDaNota({ tipo: 'loja', referencia: mes });
  let c: Cobranca;
  try {
    const cliente = await provedor.criarCliente(pagador);
    c = await provedor.gerarCobrancaAvulsa({ cliente, pagador, valor, vencimento, descricao, referencia: `loja-${fornecedorId}-${mes}` });
  } catch (e) {
    return { ok: false, erro: mensagemDoGateway(e) };
  }
  const id = await registrarPagamento(sistema, {
    provedor: provedor.nome,
    externo: c.externo,
    tipo: 'loja',
    oficinaId: null,
    fornecedorId,
    assinaturaId: null,
    valor,
    vencimento: c.vencimento ?? vencimento,
    metodo: 'pix',
    descricao,
    link: c.link,
    pix: c.pixCopiaECola,
    boleto: null,
    referencia: mes,
    userId
  });
  // o lançamento à mão do mesmo mês, ainda em aberto, dá lugar ao Pix
  const { data: manuais } = await sbEquipe
    .from('pagamentos')
    .select('id')
    .eq('fornecedor_id', fornecedorId)
    .eq('referencia', mes)
    .eq('provedor', 'manual')
    .in('situacao', ['pendente', 'atrasado']);
  for (const m of (manuais ?? []) as { id: string }[]) await sbEquipe.rpc('cobranca_cancelar_pagamento', { p_pagamento: m.id });
  return { ok: true, id };
}

/**
 * A oficina que pediu para ser apagada (ou foi desativada pela equipe) não é mais cobrada: a
 * assinatura viva é cancelada no gateway. Roda na rotina diária, antes de a oficina sumir.
 */
export async function cancelarDeOficinasSaindo(): Promise<Res<{ canceladas: number; falharam: number }>> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  const { data: saindo, error } = await sistema.from('oficinas').select('id').or('excluir_em.not.is.null,ativa.eq.false').limit(1000);
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  const ids = ((saindo ?? []) as { id: string }[]).map((o) => o.id);
  if (!ids.length) return { ok: true, canceladas: 0, falharam: 0 };
  const { data: vivas, error: e2 } = await sistema.from('assinaturas_pro').select('oficina_id').in('oficina_id', ids).neq('situacao', 'cancelada');
  if (e2) return { ok: false, erro: mensagemDoBanco(e2) };
  let canceladas = 0;
  let falharam = 0;
  for (const v of (vivas ?? []) as { oficina_id: string }[]) {
    const r = await cancelarPro(v.oficina_id);
    if (r.ok) canceladas++;
    else {
      falharam++;
      console.error('[cobranca] cancelar a assinatura da oficina que sai', v.oficina_id, r.erro);
    }
  }
  return { ok: true, canceladas, falharam };
}

// ------------------------------------------------------------------ Pix Automático do mês

/**
 * Agenda no gateway a cobrança do mês de cada assinatura por Pix Automático que vence entre 2 e
 * 10 dias (a regra do Pix Automático: o pedido chega ao banco do pagador antes do vencimento).
 * Rodar mais de uma vez no dia não agenda de novo. Para chamar uma vez por dia.
 */
export async function agendarCobrancasRecorrentes(hoje = hojeEmBrasilia()): Promise<Res<{ agendadas: number; falharam: number }>> {
  const sistema = sistemaOuErro();
  if (!sistema) return { ok: false, erro: SEM_SISTEMA };
  const { data, error } = await sistema
    .from('assinaturas_pro')
    .select(COLUNAS_ASSINATURA)
    .eq('metodo', 'pix_automatico')
    .in('situacao', ['ativa', 'atrasada'])
    .gte('proximo_vencimento', maisDias(hoje, 2))
    .lte('proximo_vencimento', maisDias(hoje, 10))
    .limit(500);
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  let agendadas = 0;
  let falharam = 0;
  for (const a of (data ?? []).map((l) => lerAssinatura(l as Record<string, unknown>))) {
    const provedor = provedorPorNome(a.provedor);
    if (!provedor?.agendarCobrancaRecorrente || !a.assinatura_externa || !a.proximo_vencimento) continue;
    const { data: ja } = await sistema.from('pagamentos').select('id').eq('assinatura_id', a.id).eq('vencimento', a.proximo_vencimento).neq('situacao', 'cancelado').limit(1);
    if (ja?.length) continue;
    try {
      const c = await provedor.agendarCobrancaRecorrente(a.assinatura_externa, a.valor, a.proximo_vencimento, DESCRICAO_PRO);
      await registrarPagamento(sistema, {
        provedor: provedor.nome,
        externo: c.externo,
        tipo: 'pro',
        oficinaId: a.oficina_id,
        fornecedorId: null,
        assinaturaId: a.id,
        valor: a.valor,
        vencimento: a.proximo_vencimento,
        metodo: 'pix_automatico',
        descricao: DESCRICAO_PRO,
        link: null,
        pix: null,
        boleto: null
      });
      agendadas++;
    } catch (e) {
      falharam++;
      console.error('[cobranca] agendar Pix Automático', a.id, e instanceof Error ? e.message : e);
    }
  }
  return { ok: true, agendadas, falharam };
}
