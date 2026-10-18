// As notas da ordem de serviço, montadas a partir dos dados do Revisaí (funções puras, testadas):
// a NFS-e com a mão de obra e a NF-e com as peças. O desconto da ordem é dividido entre as duas
// na proporção de cada parte. Os códigos fiscais (NCM, CFOP, CSOSN) seguem o cadastro fiscal da
// oficina; o app pede para conferir com o contador antes de emitir em produção.

import { z } from 'zod';
import { totais, totalDaLinha, tituloDoDocumento } from '../documentos';
import { lerNumero } from '../formatos';
import { servico as infoServico, servicoExiste } from '../manutencao';
import type { Documento, ItemEstoque, Id } from '../tipos';
import { cnpjValido, lerCpfCnpj, limparDocumento } from './identificacao';
import { ErroFiscal, type AmbienteFiscal, type Endereco, type ItemNfe, type NomeProvedorFiscal, type NovaNfe, type NovaNfse, type PadraoNfse, type RegimeFiscal, type Tomador } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'] as const;

export const REGIMES: { id: RegimeFiscal; nome: string; descricao: string }[] = [
  { id: 'mei', nome: 'MEI', descricao: 'Microempreendedor individual' },
  { id: 'simples', nome: 'Simples Nacional', descricao: 'Microempresa ou empresa de pequeno porte' },
  { id: 'normal', nome: 'Regime normal', descricao: 'Lucro presumido ou real' }
];

/** Conserto e manutenção de veículos: item 14.01 da LC 116, código nacional 140101. */
export const SERVICO_PADRAO = { codigoServico: '14.01', codigoTributacaoNacional: '140101', cnae: '4520001' } as const;

// ---------------------------------------------------------------- cadastro fiscal da oficina

export interface OpcoesFiscais {
  /** Autopeça costuma ter ICMS por substituição tributária: a venda sai com CFOP 5405. */
  pecasComSubstituicao: boolean;
  /** CST do PIS e da COFINS das peças. */
  pisCofins: string;
  /** Alíquota do ICMS (regime normal, peça sem substituição). */
  aliquotaIcms: number | null;
  /** IBS/CBS da NFS-e (regime normal), como o contador passou. */
  ibsCbs: { situacao: string; classificacao: string } | null;
}

export const OPCOES_PADRAO: OpcoesFiscais = { pecasComSubstituicao: true, pisCofins: '49', aliquotaIcms: null, ibsCbs: null };

export interface ConfigFiscal {
  provedor: NomeProvedorFiscal;
  provedorEmpresaId: string | null;
  cnpj: string;
  razaoSocial: string;
  regime: RegimeFiscal;
  inscricaoMunicipal: string | null;
  inscricaoEstadual: string | null;
  codigoMunicipio: string | null;
  padraoNfse: PadraoNfse;
  codigoServico: string;
  codigoTributacaoNacional: string;
  codigoTributacaoMunicipal: string | null;
  aliquotaIss: number | null;
  cnae: string | null;
  opcoes: OpcoesFiscais & { endereco?: Endereco | null; email?: string | null };
  ambiente: AmbienteFiscal;
  certificadoValidoAte: string | null;
  atualizadoEm: string | null;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function numeroOuNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function lerOpcoes(v: unknown): ConfigFiscal['opcoes'] {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const ibs = o.ibsCbs && typeof o.ibsCbs === 'object' ? (o.ibsCbs as Record<string, unknown>) : null;
  const end = o.endereco && typeof o.endereco === 'object' ? (o.endereco as Record<string, unknown>) : null;
  return {
    pecasComSubstituicao: o.pecasComSubstituicao !== false,
    pisCofins: typeof o.pisCofins === 'string' && /^\d{2}$/.test(o.pisCofins) ? o.pisCofins : OPCOES_PADRAO.pisCofins,
    aliquotaIcms: numeroOuNull(o.aliquotaIcms),
    ibsCbs: ibs && texto(ibs.situacao) && texto(ibs.classificacao) ? { situacao: String(ibs.situacao), classificacao: String(ibs.classificacao) } : null,
    endereco: end
      ? {
          logradouro: texto(end.logradouro) ?? '',
          numero: texto(end.numero) ?? '',
          complemento: texto(end.complemento),
          bairro: texto(end.bairro) ?? '',
          municipio: texto(end.municipio) ?? '',
          uf: texto(end.uf) ?? '',
          cep: texto(end.cep) ?? '',
          codigoMunicipio: texto(end.codigoMunicipio)
        }
      : null,
    email: texto(o.email)
  };
}

/** A linha de public.oficinas_fiscal no jeito do app (null quando não é um cadastro). */
export function lerConfigFiscal(v: unknown): ConfigFiscal | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const provedor = r.provedor === 'focus' || r.provedor === 'teste' ? r.provedor : null;
  const regime = r.regime === 'mei' || r.regime === 'simples' || r.regime === 'normal' ? r.regime : null;
  if (!provedor || !regime || typeof r.cnpj !== 'string') return null;
  return {
    provedor,
    provedorEmpresaId: texto(r.provedor_empresa_id),
    cnpj: r.cnpj,
    razaoSocial: String(r.razao_social ?? ''),
    regime,
    inscricaoMunicipal: texto(r.inscricao_municipal),
    inscricaoEstadual: texto(r.inscricao_estadual),
    codigoMunicipio: texto(r.codigo_municipio),
    padraoNfse: r.padrao_nfse === 'municipal' ? 'municipal' : 'nacional',
    codigoServico: texto(r.codigo_servico) ?? SERVICO_PADRAO.codigoServico,
    codigoTributacaoNacional: texto(r.codigo_tributacao_nacional) ?? SERVICO_PADRAO.codigoTributacaoNacional,
    codigoTributacaoMunicipal: texto(r.codigo_tributacao_municipal),
    aliquotaIss: numeroOuNull(r.aliquota_iss),
    cnae: texto(r.cnae),
    opcoes: lerOpcoes(r.opcoes),
    ambiente: r.ambiente === 'producao' ? 'producao' : 'homologacao',
    certificadoValidoAte: texto(r.certificado_valido_ate),
    atualizadoEm: texto(r.atualizado_em)
  };
}

const vazioParaNull = (v: string) => (v ? v : null);

const esquemaEndereco = z.object({
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v.length === 8, 'O CEP tem 8 números.'),
  logradouro: z.string().trim().min(2, 'Escreva a rua.').max(120),
  numero: z.string().trim().min(1, 'Escreva o número (ou S/N).').max(20),
  complemento: z.string().trim().max(60).default('').transform(vazioParaNull),
  bairro: z.string().trim().min(2, 'Escreva o bairro.').max(60),
  municipio: z.string().trim().min(2, 'Escreva a cidade.').max(60),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => (UFS as readonly string[]).includes(v), 'Escolha o estado.'),
  codigoMunicipio: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || /^\d{7}$/.test(v), 'O código IBGE da cidade tem 7 números.')
    .transform(vazioParaNull)
});

const inscricao = (erro: string) =>
  z
    .string()
    .trim()
    .max(20, erro)
    .regex(/^[0-9A-Za-z./-]*$/, erro)
    .default('')
    .transform(vazioParaNull);

const percentual = (max: number, erro: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .default(null)
    .transform((v, ctx) => {
      if (v === null || v === '') return null;
      const n = lerNumero(v);
      if (n == null || n < 0 || n > max) {
        ctx.addIssue({ code: 'custom', message: erro });
        return z.NEVER;
      }
      return r2(n);
    });

/** O formulário do cadastro fiscal (a tela /oficina/fiscal), conferido no servidor. */
export const esquemaAjustesFiscais = z
  .object({
    cnpj: z
      .string()
      .transform(limparDocumento)
      .refine((v) => cnpjValido(v), 'Confira o CNPJ (os dígitos do final não batem).'),
    razaoSocial: z.string().trim().min(2, 'Escreva a razão social, como no cartão do CNPJ.').max(150),
    regime: z.enum(['mei', 'simples', 'normal'], { error: 'Escolha o regime.' }),
    inscricaoMunicipal: inscricao('Confira a inscrição municipal.'),
    inscricaoEstadual: inscricao('Confira a inscrição estadual.'),
    email: z
      .string()
      .trim()
      .max(160)
      .default('')
      .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Confira o e-mail.')
      .transform(vazioParaNull),
    endereco: esquemaEndereco,
    padraoNfse: z.enum(['nacional', 'municipal']).default('nacional'),
    codigoServico: z.string().trim().regex(/^\d{2}\.\d{2}$/, 'O item da lista de serviços é como 14.01.').default(SERVICO_PADRAO.codigoServico),
    codigoTributacaoNacional: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'O código de tributação nacional tem 6 números (140101 para o item 14.01).')
      .default(SERVICO_PADRAO.codigoTributacaoNacional),
    codigoTributacaoMunicipal: z.string().trim().max(20).default('').transform(vazioParaNull),
    aliquotaIss: percentual(5, 'A alíquota do ISS vai de 0 a 5%.'),
    cnae: z
      .string()
      .default('')
      .transform((v) => v.replace(/\D/g, ''))
      .refine((v) => v === '' || v.length === 7, 'O CNAE tem 7 números (4520-0/01 para manutenção de veículos).')
      .transform(vazioParaNull),
    ambiente: z.enum(['homologacao', 'producao']).default('homologacao'),
    pecasComSubstituicao: z.boolean().default(true),
    pisCofins: z.string().trim().regex(/^\d{2}$/, 'O CST do PIS e da COFINS tem 2 números.').default(OPCOES_PADRAO.pisCofins),
    aliquotaIcms: percentual(40, 'A alíquota do ICMS vai de 0 a 40%.'),
    ibsCbsSituacao: z
      .string()
      .trim()
      .default('')
      .refine((v) => v === '' || /^\d{3}$/.test(v), 'A situação tributária do IBS/CBS tem 3 números.'),
    ibsCbsClassificacao: z
      .string()
      .trim()
      .default('')
      .refine((v) => v === '' || /^\d{6}$/.test(v), 'A classificação tributária do IBS/CBS tem 6 números.')
  })
  .superRefine((d, ctx) => {
    if (d.padraoNfse === 'municipal' && !d.inscricaoMunicipal) ctx.addIssue({ code: 'custom', path: ['inscricaoMunicipal'], message: 'No sistema da prefeitura a inscrição municipal é obrigatória.' });
    if (!d.endereco.codigoMunicipio) ctx.addIssue({ code: 'custom', path: ['endereco', 'codigoMunicipio'], message: 'Escreva o código IBGE da cidade da oficina (7 números).' });
    if (!!d.ibsCbsSituacao !== !!d.ibsCbsClassificacao) ctx.addIssue({ code: 'custom', path: ['ibsCbsClassificacao'], message: 'Preencha a situação e a classificação do IBS/CBS, ou deixe as duas em branco.' });
  });

export type AjustesFiscais = z.output<typeof esquemaAjustesFiscais>;

/** O que vai para fiscal_salvar_config (o banco confere de novo os formatos). */
export function configParaSalvar(a: AjustesFiscais, provedor: NomeProvedorFiscal, empresaId: string | null): Record<string, unknown> {
  return {
    provedor,
    provedorEmpresaId: empresaId,
    cnpj: a.cnpj,
    razaoSocial: a.razaoSocial,
    regime: a.regime,
    inscricaoMunicipal: a.inscricaoMunicipal,
    inscricaoEstadual: a.inscricaoEstadual,
    codigoMunicipio: a.endereco.codigoMunicipio,
    padraoNfse: a.padraoNfse,
    codigoServico: a.codigoServico,
    codigoTributacaoNacional: a.codigoTributacaoNacional,
    codigoTributacaoMunicipal: a.codigoTributacaoMunicipal,
    aliquotaIss: a.aliquotaIss,
    cnae: a.cnae,
    ambiente: a.ambiente,
    opcoes: {
      pecasComSubstituicao: a.pecasComSubstituicao,
      pisCofins: a.pisCofins,
      aliquotaIcms: a.aliquotaIcms,
      ibsCbs: a.ibsCbsSituacao && a.ibsCbsClassificacao ? { situacao: a.ibsCbsSituacao, classificacao: a.ibsCbsClassificacao } : null,
      endereco: a.endereco,
      email: a.email
    }
  };
}

// ---------------------------------------------------------------- endereço do cliente

/** "Rua A, 10, fundos - Centro, Rio de Janeiro/RJ, CEP 20000-000" (o jeito que o app guarda no cliente). */
export function formatarEndereco(e: Partial<Endereco>): string {
  const rua = [e.logradouro?.trim(), e.numero?.trim(), e.complemento?.trim()].filter(Boolean).join(', ');
  const cidade = [e.municipio?.trim(), e.uf?.trim()].filter(Boolean).join('/');
  const cep = (e.cep ?? '').replace(/\D/g, '');
  const resto = [cidade, cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : ''].filter(Boolean).join(', ');
  return [rua, [e.bairro?.trim(), resto].filter(Boolean).join(', ')].filter(Boolean).join(' - ');
}

/** Lê de volta o endereço escrito por formatarEndereco (o que der para reconhecer). */
export function lerEndereco(texto: string | null | undefined): Partial<Endereco> {
  const t = (texto ?? '').trim();
  if (!t) return {};
  const r: Partial<Endereco> = {};
  const cep = t.match(/CEP\s*(\d{5})-?(\d{3})/i);
  if (cep) r.cep = cep[1] + cep[2];
  const cidade = t.match(/([^,\-]+)\/([A-Z]{2})\b/);
  if (cidade) {
    r.municipio = cidade[1].trim();
    r.uf = cidade[2];
  }
  const [rua, depois] = t.split(' - ');
  const partes = (rua ?? '').split(',').map((p) => p.trim());
  if (partes[0]) r.logradouro = partes[0];
  if (partes[1]) r.numero = partes[1];
  if (partes[2]) r.complemento = partes[2];
  const bairro = (depois ?? '').split(',')[0]?.trim();
  if (bairro && !/\/[A-Z]{2}$/.test(bairro) && !/^CEP/i.test(bairro)) r.bairro = bairro;
  return r;
}

// ---------------------------------------------------------------- tomador

/** Confere quem recebe a nota. Na NF-e o endereço completo é obrigatório. */
export function problemaDoTomador(t: Tomador, paraNfe: boolean): string | null {
  if (t.nome.trim().length < 2) return 'Escreva o nome do cliente.';
  if (!lerCpfCnpj(t.documento)) return 'Confira o CPF ou o CNPJ do cliente.';
  if (t.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t.email)) return 'Confira o e-mail do cliente.';
  if (paraNfe) {
    const e = t.endereco;
    if (!e || !e.logradouro || !e.numero || !e.bairro || !e.municipio || !e.uf || !/^\d{8}$/.test(e.cep)) return 'Na nota das peças o endereço do cliente é obrigatório: rua, número, bairro, cidade, estado e CEP.';
  }
  return null;
}

// ---------------------------------------------------------------- datas e referência

/** 'AAAA-MM-DDTHH:MM:SS-03:00' (horário de Brasília, sem horário de verão desde 2019). */
export function dataEmissaoBrasilia(agora: Date): string {
  return `${new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`;
}

/** A referência da nota no emissor: o tipo (que diz a rota), parte da oficina e letras sorteadas. */
export function novaReferencia(rota: 'nfsen' | 'nfse' | 'nfe', oficinaId: string, sortear: () => number = Math.random): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  let aleatorio = '';
  for (let i = 0; i < 12; i++) aleatorio += alfabeto[Math.floor(sortear() * alfabeto.length) % alfabeto.length];
  return `rv-${rota}-${oficinaId.replace(/[^0-9a-z]/gi, '').slice(0, 8).toLowerCase()}-${aleatorio}`;
}

/** A rota da nota pela referência (as do Revisaí começam pelo tipo). */
export function rotaDaReferencia(ref: string): 'nfsen' | 'nfse' | 'nfe' | null {
  const m = ref.match(/^rv-(nfsen|nfse|nfe)-/);
  return m ? (m[1] as 'nfsen' | 'nfse' | 'nfe') : null;
}

// ---------------------------------------------------------------- partes da ordem

export interface PartesDaOrdem {
  pecas: number;
  /** Mão de obra e outros itens (taxas, abatimentos). */
  servicos: number;
  desconto: number;
  descontoPecas: number;
  descontoServicos: number;
  /** O que vai na NFS-e: mão de obra menos a parte dela no desconto. */
  valorNfse: number;
  /** O que vai na NF-e: peças menos a parte delas no desconto. */
  valorNfe: number;
}

/** Divide a ordem entre a nota de serviço e a nota das peças (o desconto na proporção). */
export function partesDaOrdem(doc: Pick<Documento, 'linhas' | 'desconto'>): PartesDaOrdem {
  const t = totais(doc);
  const pecas = t.pecas;
  const servicos = r2(t.servicos + t.outros);
  const base = Math.max(0, pecas) + Math.max(0, servicos);
  const descontoPecas = base > 0 ? r2((t.desconto * Math.max(0, pecas)) / base) : 0;
  const descontoServicos = r2(t.desconto - descontoPecas);
  return {
    pecas,
    servicos,
    desconto: t.desconto,
    descontoPecas,
    descontoServicos,
    valorNfse: Math.max(0, r2(servicos - descontoServicos)),
    valorNfe: Math.max(0, r2(pecas - descontoPecas))
  };
}

/** "Mão de obra da OS nº 12: troca de óleo e alinhamento. Veículo Gol, placa ABC1D23." */
export function descricaoDoServico(doc: Pick<Documento, 'tipo' | 'numero' | 'linhas'>, carro?: { modelo?: string; placa?: string } | null): string {
  const nomes: string[] = [];
  for (const l of doc.linhas) {
    if (l.recusada || (l.tipo !== 'servico' && l.tipo !== 'outro') || totalDaLinha(l) <= 0) continue;
    const nome = l.servico && servicoExiste(l.servico) && l.descricao.trim() === '' ? infoServico(l.servico).nome : l.descricao.trim();
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? 'serviços de manutenção do veículo');
  const veiculo = [carro?.modelo?.trim(), carro?.placa ? `placa ${carro.placa}` : ''].filter(Boolean).join(', ');
  return `Mão de obra da ${tituloDoDocumento(doc)}: ${lista}.${veiculo ? ` Veículo ${veiculo}.` : ''}`.slice(0, 1000);
}

// ---------------------------------------------------------------- NFS-e

export function montarNfse(ctx: { config: ConfigFiscal; doc: Documento; tomador: Tomador; referencia: string; agora: Date; descricao: string }): NovaNfse {
  const { config: c, doc } = ctx;
  const problema = problemaDoTomador(ctx.tomador, false);
  if (problema) throw new ErroFiscal(problema);
  if (!c.codigoMunicipio) throw new ErroFiscal('Falta o código IBGE da cidade da oficina no cadastro fiscal.');
  const valor = partesDaOrdem(doc).valorNfse;
  if (!(valor > 0)) throw new ErroFiscal('Esta ordem não tem mão de obra com valor para a nota de serviço.');
  const dataEmissao = dataEmissaoBrasilia(ctx.agora);
  const pessoa = lerCpfCnpj(ctx.tomador.documento)!;
  return {
    referencia: ctx.referencia,
    ambiente: c.ambiente,
    padrao: c.padraoNfse,
    dataEmissao,
    competencia: dataEmissao.slice(0, 10),
    prestador: { cnpj: c.cnpj, regime: c.regime, inscricaoMunicipal: c.inscricaoMunicipal, codigoMunicipio: c.codigoMunicipio },
    tomador: { ...ctx.tomador, nome: ctx.tomador.nome.trim().slice(0, 150), documento: pessoa.numero, email: ctx.tomador.email?.trim() || null },
    servico: {
      descricao: ctx.descricao.trim().slice(0, 1000) || 'Serviços de manutenção do veículo.',
      valor,
      itemListaServico: c.codigoServico,
      codigoTributacaoNacional: c.codigoTributacaoNacional,
      codigoTributacaoMunicipal: c.codigoTributacaoMunicipal,
      aliquotaIss: c.aliquotaIss,
      cnae: c.cnae
    },
    ibsCbs: c.opcoes.ibsCbs
  };
}

// ---------------------------------------------------------------- NF-e

export interface EscolhaDaPeca {
  linhaId: Id;
  ncm: string;
  cfop: '5102' | '5405';
}

/** O CSOSN (Simples e MEI) ou o CST do ICMS (regime normal) para o CFOP da peça. */
export function situacaoDoIcms(regime: RegimeFiscal, cfop: '5102' | '5405'): string {
  if (regime === 'normal') return cfop === '5405' ? '60' : '00';
  return cfop === '5405' ? '500' : '102';
}

export function ncmValido(v: string | null | undefined): boolean {
  return /^\d{8}$/.test((v ?? '').replace(/\D/g, '')) && (v ?? '').replace(/\D/g, '') !== '00000000';
}

/** As peças da ordem (as que o cliente aprovou e têm preço), com o NCM do estoque quando houver. */
export function pecasDaOrdem(doc: Pick<Documento, 'linhas'>, estoque: Record<Id, ItemEstoque>): { linhaId: Id; descricao: string; quantidade: number; valor: number; ncm: string; estoqueId: Id | null }[] {
  return doc.linhas
    .filter((l) => l.tipo === 'peca' && !l.recusada && l.valorUnitario != null && l.valorUnitario > 0 && l.quantidade > 0)
    .map((l) => ({
      linhaId: l.id,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valor: totalDaLinha(l),
      ncm: (l.estoqueId ? estoque[l.estoqueId]?.ncm : undefined)?.replace(/\D/g, '') ?? '',
      estoqueId: l.estoqueId ?? null
    }));
}

export function montarNfe(ctx: {
  config: ConfigFiscal;
  doc: Documento;
  tomador: Tomador;
  escolhas: EscolhaDaPeca[];
  estoque: Record<Id, ItemEstoque>;
  referencia: string;
  agora: Date;
  formaPagamento?: string;
}): NovaNfe {
  const { config: c, doc } = ctx;
  const problema = problemaDoTomador(ctx.tomador, true);
  if (problema) throw new ErroFiscal(problema);
  const porLinha = new Map(ctx.escolhas.map((e) => [e.linhaId, e]));
  const linhas = doc.linhas.filter((l) => l.tipo === 'peca' && !l.recusada && l.valorUnitario != null && l.valorUnitario > 0 && l.quantidade > 0);
  if (!linhas.length) throw new ErroFiscal('Esta ordem não tem peças com preço para a nota das peças.');
  if (doc.linhas.some((l) => l.tipo === 'peca' && !l.recusada && (l.valorUnitario == null || l.valorUnitario <= 0))) {
    throw new ErroFiscal('Há peça sem preço na ordem. Ponha o preço antes de emitir a nota.');
  }
  const partes = partesDaOrdem(doc);
  const bruto = r2(linhas.reduce((s, l) => s + totalDaLinha(l), 0));
  let descontoRestante = Math.min(partes.descontoPecas, bruto);
  const itens: ItemNfe[] = linhas.map((l, i) => {
    const escolha = porLinha.get(l.id);
    const ncm = (escolha?.ncm || (l.estoqueId ? ctx.estoque[l.estoqueId]?.ncm : '') || '').replace(/\D/g, '');
    if (!ncmValido(ncm)) throw new ErroFiscal(`Falta o NCM (8 números) de "${l.descricao}".`);
    const cfop = escolha?.cfop ?? (c.opcoes.pecasComSubstituicao ? '5405' : '5102');
    const valorBruto = totalDaLinha(l);
    const valorDesconto = i === linhas.length - 1 ? r2(descontoRestante) : r2((partes.descontoPecas * valorBruto) / bruto);
    descontoRestante = r2(descontoRestante - valorDesconto);
    const situacao = situacaoDoIcms(c.regime, cfop);
    const icms: ItemNfe['icms'] = { situacao, origem: 0 };
    if (situacao === '00') {
      if (c.opcoes.aliquotaIcms == null) throw new ErroFiscal('Informe a alíquota do ICMS no cadastro fiscal (regime normal, peça sem substituição).');
      const base = r2(valorBruto - valorDesconto);
      icms.base = base;
      icms.aliquota = c.opcoes.aliquotaIcms;
      icms.valor = r2((base * c.opcoes.aliquotaIcms) / 100);
    }
    const item = l.estoqueId ? ctx.estoque[l.estoqueId] : undefined;
    return {
      numero: i + 1,
      codigo: (item?.codigo || item?.ean || l.estoqueId || l.id).replace(/[^0-9A-Za-z._-]/g, '').slice(0, 60) || String(i + 1),
      descricao: l.descricao.trim().slice(0, 120) || 'Peça',
      ncm,
      cfop,
      unidade: l.unidade === 'L' ? 'L' : 'UN',
      quantidade: l.quantidade,
      valorUnitario: l.valorUnitario!,
      valorBruto,
      valorDesconto,
      icms,
      pis: c.opcoes.pisCofins,
      cofins: c.opcoes.pisCofins
    };
  });
  const valorDesconto = r2(itens.reduce((s, i) => s + i.valorDesconto, 0));
  const pessoa = lerCpfCnpj(ctx.tomador.documento)!;
  return {
    referencia: ctx.referencia,
    ambiente: c.ambiente,
    dataEmissao: dataEmissaoBrasilia(ctx.agora),
    emitente: { cnpj: c.cnpj, regime: c.regime, inscricaoEstadual: c.inscricaoEstadual },
    destinatario: { ...ctx.tomador, nome: ctx.tomador.nome.trim().slice(0, 60), documento: pessoa.numero, email: ctx.tomador.email?.trim() || null },
    itens,
    valorProdutos: bruto,
    valorDesconto,
    valorTotal: r2(bruto - valorDesconto),
    formaPagamento: ctx.formaPagamento ?? '17',
    informacoesAdicionais: `Peças da ${tituloDoDocumento(doc)}.`
  };
}
