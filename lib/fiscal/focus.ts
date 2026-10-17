// Focus NFe (https://doc.focusnfe.com.br): REST/JSON, HTTP Basic com o token como usuário e a
// senha vazia. Produção em https://api.focusnfe.com.br e homologação em
// https://homologacao.focusnfe.com.br, sempre com o prefixo /v2. O token da conta (Token Master)
// cadastra as empresas (/v2/empresas, só em produção); cada empresa ganha um token de produção e
// um de homologação, que emitem as notas dela. A emissão é assíncrona pela referência (ref):
// /v2/nfsen (NFS-e Nacional), /v2/nfse (NFS-e da prefeitura) e /v2/nfe (NF-e modelo 55). O
// resultado chega pelos gatilhos (/v2/hooks, com um cabeçalho de autorização combinado) e pela
// consulta (GET /v2/<rota>/<ref>).

import { timingSafeEqual } from 'node:crypto';
import { lerCpfCnpj } from './identificacao';
import { rotaDaReferencia } from './payload';
import {
  ErroFiscal,
  type AmbienteFiscal,
  type CredenciaisFiscais,
  type EmpresaFiscal,
  type EventoFiscal,
  type NovaNfe,
  type NovaNfse,
  type PedidoWebhook,
  type ProvedorFiscal,
  type RegimeFiscal,
  type ResultadoNota,
  type SituacaoNota,
  type TipoNota
} from './tipos';

export const BASES_FOCUS: Record<AmbienteFiscal, string> = {
  producao: 'https://api.focusnfe.com.br',
  homologacao: 'https://homologacao.focusnfe.com.br'
};

/** O cabeçalho em que a Focus manda o segredo combinado em cada aviso. */
export const CABECALHO_AVISO = 'X-Revisai-Fiscal';

export interface ConfigFocus {
  /** Token da conta (Token Master): cadastra as empresas. */
  tokenConta: string;
  /** O segredo que a Focus manda no cabeçalho dos avisos (gatilhos). */
  segredoWebhook: string | null;
  /** O endereço dos avisos: https://<site>/api/fiscal/focus */
  urlWebhook: string;
  fetch?: typeof fetch;
}

const REGIME_EMPRESA: Record<RegimeFiscal, number> = { simples: 1, normal: 3, mei: 4 };
/** NFS-e Nacional: 1 não optante, 2 MEI, 3 ME/EPP do Simples. */
const OPCAO_SIMPLES: Record<RegimeFiscal, number> = { normal: 1, mei: 2, simples: 3 };
/** NFS-e da prefeitura (ABRASF): 5 MEI do Simples, 6 ME/EPP do Simples. */
const REGIME_ESPECIAL_MUNICIPAL: Partial<Record<RegimeFiscal, string>> = { mei: '5', simples: '6' };

const r2 = (n: number) => Math.round(n * 100) / 100;

function basic(token: string): string {
  return `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
}

function texto(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Inscrição como número quando dá para mandar sem perder nada (a Focus descreve como inteiro). */
function inscricao(v: string | null | undefined): number | string | undefined {
  const t = (v ?? '').trim();
  if (!t) return undefined;
  return /^[1-9]\d{0,14}$/.test(t) ? Number(t) : t;
}

function semVazios<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

/** A mensagem de erro da Focus: {codigo, mensagem}, {erros: [...]}, ou os dois. */
export function mensagemDaFocus(json: unknown, padrao = 'O emissor de notas recusou o pedido.'): string {
  if (!json || typeof json !== 'object') return padrao;
  const j = json as Record<string, unknown>;
  const erros = Array.isArray(j.erros) ? (j.erros as Record<string, unknown>[]).map((e) => texto(e?.mensagem)).filter((m): m is string => !!m) : [];
  const principal = texto(j.mensagem);
  const partes = [principal && !(erros.length && principal === 'Erro de validação') ? principal : null, ...erros].filter((m): m is string => !!m);
  const unicas = [...new Set(partes)];
  return unicas.length ? unicas.join(' ').slice(0, 900) : (texto(j.mensagem_sefaz) ?? padrao);
}

function situacaoFocus(status: unknown): SituacaoNota | null {
  switch (status) {
    case 'processando_autorizacao':
      return 'processando';
    case 'autorizado':
      return 'autorizada';
    case 'cancelado':
      return 'cancelada';
    case 'erro_autorizacao':
    case 'negado':
    case 'denegado':
      return 'erro';
    default:
      return null;
  }
}

function absoluta(caminho: unknown, ambiente: AmbienteFiscal | null): string | null {
  const c = texto(caminho);
  if (!c) return null;
  if (c.startsWith('https://')) return c;
  if (c.startsWith('/') && ambiente) return `${BASES_FOCUS[ambiente]}${c}`;
  return null;
}

/** A nota como a Focus devolve na consulta e manda nos gatilhos (NFS-e Nacional, municipal ou NF-e). */
export function notaDaFocus(json: unknown, ambiente: AmbienteFiscal | null): ResultadoNota | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const externo = texto(j.ref);
  const situacao = situacaoFocus(j.status);
  if (!externo || !situacao) return null;
  const chaveNfe = texto(j.chave_nfe)?.replace(/^NFe/, '') ?? null;
  const urlPublica = texto(j.url);
  const chaveNfse = urlPublica?.match(/[?&]chave=(\d{20,60})/)?.[1] ?? null;
  return {
    externo,
    situacao,
    numero: texto(j.numero),
    serie: texto(j.serie) ?? texto(j.serie_rps),
    chave: chaveNfe ?? chaveNfse ?? texto(j.codigo_verificacao),
    urlPdf: absoluta(j.url_danfse, ambiente) ?? absoluta(j.caminho_danfe, ambiente) ?? (urlPublica?.startsWith('https://') ? urlPublica : null),
    urlXml: absoluta(j.caminho_xml_nota_fiscal, ambiente),
    mensagem: situacao === 'erro' ? mensagemDaFocus(j, 'A nota foi recusada.') : situacao === 'autorizada' || situacao === 'cancelada' ? texto(j.mensagem_sefaz) : null
  };
}

// ---------------------------------------------------------------- corpos dos pedidos

export function corpoDaEmpresa(e: EmpresaFiscal): Record<string, unknown> {
  const end = e.endereco;
  return semVazios({
    nome: e.razaoSocial,
    nome_fantasia: e.nomeFantasia ?? undefined,
    cnpj: e.cnpj,
    inscricao_municipal: inscricao(e.inscricaoMunicipal),
    inscricao_estadual: inscricao(e.inscricaoEstadual),
    regime_tributario: REGIME_EMPRESA[e.regime],
    email: e.email ?? undefined,
    telefone: e.telefone ?? undefined,
    logradouro: end?.logradouro,
    numero: end?.numero,
    complemento: end?.complemento ?? undefined,
    bairro: end?.bairro,
    municipio: end?.municipio,
    uf: end?.uf,
    cep: end?.cep,
    habilita_nfe: true,
    // a NFS-e da prefeitura e a Nacional não ficam ligadas juntas
    habilita_nfse: e.padraoNfse === 'municipal',
    habilita_nfsen_producao: e.padraoNfse === 'nacional',
    habilita_nfsen_homologacao: e.padraoNfse === 'nacional',
    enviar_email_destinatario: true
  });
}

function tomadorDaDps(n: NovaNfse): Record<string, unknown> {
  const pessoa = lerCpfCnpj(n.tomador.documento);
  const e = n.tomador.endereco;
  return semVazios({
    cpf_tomador: pessoa?.tipo === 'cpf' ? pessoa.numero : undefined,
    cnpj_tomador: pessoa?.tipo === 'cnpj' ? pessoa.numero : undefined,
    razao_social_tomador: n.tomador.nome,
    email_tomador: n.tomador.email ?? undefined,
    telefone_tomador: n.tomador.telefone?.replace(/\D/g, '') || undefined,
    logradouro_tomador: e?.logradouro,
    numero_tomador: e?.numero,
    complemento_tomador: e?.complemento ?? undefined,
    bairro_tomador: e?.bairro,
    codigo_municipio_tomador: e?.codigoMunicipio ?? undefined,
    cep_tomador: e?.cep
  });
}

/** DPS da NFS-e Nacional (POST /v2/nfsen). */
export function corpoDaNfsen(n: NovaNfse): Record<string, unknown> {
  const municipio = Number(n.prestador.codigoMunicipio);
  return semVazios({
    data_emissao: n.dataEmissao,
    data_competencia: n.competencia,
    codigo_municipio_emissora: municipio,
    cnpj_prestador: n.prestador.cnpj,
    codigo_opcao_simples_nacional: OPCAO_SIMPLES[n.prestador.regime],
    regime_tributario_simples_nacional: n.prestador.regime === 'simples' ? 1 : undefined,
    regime_especial_tributacao: 0,
    ...tomadorDaDps(n),
    codigo_municipio_prestacao: municipio,
    codigo_tributacao_nacional_iss: n.servico.codigoTributacaoNacional,
    codigo_tributacao_municipal_iss: /^\d{3}$/.test(n.servico.codigoTributacaoMunicipal ?? '') ? n.servico.codigoTributacaoMunicipal : undefined,
    descricao_servico: n.servico.descricao,
    valor_servico: r2(n.servico.valor),
    tributacao_iss: 1,
    tipo_retencao_iss: 1,
    percentual_aliquota_relativa_municipio: n.servico.aliquotaIss ?? undefined,
    ibs_cbs_situacao_tributaria: n.ibsCbs?.situacao,
    ibs_cbs_classificacao_tributaria: n.ibsCbs?.classificacao
  });
}

/** NFS-e no sistema da prefeitura (POST /v2/nfse, layout ABRASF). */
export function corpoDaNfseMunicipal(n: NovaNfse): Record<string, unknown> {
  const pessoa = lerCpfCnpj(n.tomador.documento);
  const e = n.tomador.endereco;
  return semVazios({
    data_emissao: n.dataEmissao,
    natureza_operacao: '1',
    optante_simples_nacional: n.prestador.regime !== 'normal',
    regime_especial_tributacao: REGIME_ESPECIAL_MUNICIPAL[n.prestador.regime],
    prestador: semVazios({ cnpj: n.prestador.cnpj, inscricao_municipal: n.prestador.inscricaoMunicipal ?? undefined, codigo_municipio: n.prestador.codigoMunicipio }),
    tomador: semVazios({
      cpf: pessoa?.tipo === 'cpf' ? pessoa.numero : undefined,
      cnpj: pessoa?.tipo === 'cnpj' ? pessoa.numero : undefined,
      razao_social: n.tomador.nome,
      email: n.tomador.email ?? undefined,
      telefone: n.tomador.telefone?.replace(/\D/g, '') || undefined,
      endereco: e
        ? semVazios({ logradouro: e.logradouro, numero: e.numero, complemento: e.complemento ?? undefined, bairro: e.bairro, codigo_municipio: e.codigoMunicipio ?? undefined, uf: e.uf, cep: e.cep })
        : undefined
    }),
    servico: semVazios({
      aliquota: n.servico.aliquotaIss ?? undefined,
      discriminacao: n.servico.descricao,
      iss_retido: false,
      item_lista_servico: n.servico.itemListaServico.replace(/\D/g, ''),
      codigo_cnae: n.servico.cnae ?? undefined,
      codigo_tributario_municipio: n.servico.codigoTributacaoMunicipal ?? undefined,
      valor_servicos: r2(n.servico.valor),
      codigo_municipio: n.prestador.codigoMunicipio
    })
  });
}

/** NF-e modelo 55 (POST /v2/nfe): venda de peças ao consumidor final, dentro do estado. */
export function corpoDaNfe(n: NovaNfe): Record<string, unknown> {
  const pessoa = lerCpfCnpj(n.destinatario.documento);
  const e = n.destinatario.endereco;
  return semVazios({
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: n.dataEmissao,
    data_entrada_saida: n.dataEmissao,
    tipo_documento: 1,
    finalidade_emissao: 1,
    cnpj_emitente: n.emitente.cnpj,
    regime_tributario_emitente: REGIME_EMPRESA[n.emitente.regime],
    inscricao_estadual_emitente: n.emitente.inscricaoEstadual ?? undefined,
    local_destino: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    modalidade_frete: 9,
    nome_destinatario: n.destinatario.nome,
    cpf_destinatario: pessoa?.tipo === 'cpf' ? pessoa.numero : undefined,
    cnpj_destinatario: pessoa?.tipo === 'cnpj' ? pessoa.numero : undefined,
    indicador_inscricao_estadual_destinatario: 9,
    email_destinatario: n.destinatario.email ?? undefined,
    telefone_destinatario: n.destinatario.telefone?.replace(/\D/g, '') || undefined,
    logradouro_destinatario: e?.logradouro,
    numero_destinatario: e?.numero,
    complemento_destinatario: e?.complemento ?? undefined,
    bairro_destinatario: e?.bairro,
    municipio_destinatario: e?.municipio,
    uf_destinatario: e?.uf,
    cep_destinatario: e?.cep,
    pais_destinatario: 'Brasil',
    valor_produtos: r2(n.valorProdutos),
    valor_desconto: r2(n.valorDesconto),
    valor_total: r2(n.valorTotal),
    items: n.itens.map((i) =>
      semVazios({
        numero_item: i.numero,
        codigo_produto: i.codigo,
        descricao: i.descricao,
        cfop: i.cfop,
        codigo_ncm: i.ncm,
        unidade_comercial: i.unidade,
        quantidade_comercial: i.quantidade,
        valor_unitario_comercial: r2(i.valorUnitario),
        valor_bruto: r2(i.valorBruto),
        unidade_tributavel: i.unidade,
        quantidade_tributavel: i.quantidade,
        valor_unitario_tributavel: r2(i.valorUnitario),
        valor_desconto: i.valorDesconto > 0 ? r2(i.valorDesconto) : undefined,
        icms_origem: i.icms.origem,
        icms_situacao_tributaria: i.icms.situacao,
        icms_modalidade_base_calculo: i.icms.base != null ? 3 : undefined,
        icms_base_calculo: i.icms.base ?? undefined,
        icms_aliquota: i.icms.aliquota ?? undefined,
        icms_valor: i.icms.valor ?? undefined,
        pis_situacao_tributaria: i.pis,
        cofins_situacao_tributaria: i.cofins
      })
    ),
    formas_pagamento: [{ forma_pagamento: n.formaPagamento, valor_pagamento: r2(n.valorTotal) }]
  });
}

// ---------------------------------------------------------------- o adaptador

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function rotaDe(tipo: TipoNota, ref: string): 'nfsen' | 'nfse' | 'nfe' {
  return rotaDaReferencia(ref) ?? (tipo === 'nfe' ? 'nfe' : 'nfsen');
}

export function criarFocus(cfg: ConfigFocus): ProvedorFiscal {
  const f = cfg.fetch ?? fetch;

  async function chamar(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, corpo?: unknown): Promise<{ status: number; json: unknown }> {
    let r: Response;
    try {
      r = await f(url, {
        method: metodo,
        headers: { authorization: basic(token), accept: 'application/json', ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(25_000)
      });
    } catch {
      throw new ErroFiscal('O emissor de notas não respondeu. Tente de novo em instantes.', 'sem_resposta', null);
    }
    const bruto = await r.text().catch(() => '');
    let json: unknown = null;
    try {
      json = bruto ? JSON.parse(bruto) : null;
    } catch {
      json = null;
    }
    if (r.status === 401 || r.status === 403) throw new ErroFiscal('O emissor de notas não aceitou a chave de acesso do Revisaí. Fale com o suporte.', 'acesso_negado', r.status);
    return { status: r.status, json };
  }

  function tokenDe(c: CredenciaisFiscais, ambiente: AmbienteFiscal): string {
    const t = c.tokens?.[ambiente];
    if (!t) throw new ErroFiscal('A oficina ainda não está pronta para emitir neste ambiente. Salve o cadastro fiscal de novo.', 'sem_token');
    return t;
  }

  function urlDoAviso(ambiente: AmbienteFiscal): string {
    return `${cfg.urlWebhook}?ambiente=${ambiente}`;
  }

  /** Liga os gatilhos da empresa no ambiente (sem repetir os que já existem). */
  async function ligarAvisos(token: string, ambiente: AmbienteFiscal, cnpj: string, eventos: string[]): Promise<void> {
    if (!cfg.segredoWebhook) return;
    const base = `${BASES_FOCUS[ambiente]}/v2/hooks`;
    const lista = await chamar('GET', base, token);
    const existentes = Array.isArray(lista.json) ? (lista.json as Record<string, unknown>[]) : [];
    const url = urlDoAviso(ambiente);
    for (const event of eventos) {
      if (existentes.some((h) => h.event === event && h.url === url)) continue;
      const r = await chamar('POST', base, token, { cnpj, event, url, authorization: cfg.segredoWebhook, authorization_header: CABECALHO_AVISO });
      if (r.status >= 300) console.warn('[fiscal] gatilho da Focus', event, r.status, mensagemDaFocus(r.json));
    }
  }

  async function emitir(rota: 'nfsen' | 'nfse' | 'nfe', ref: string, ambiente: AmbienteFiscal, token: string, corpo: unknown): Promise<ResultadoNota> {
    const r = await chamar('POST', `${BASES_FOCUS[ambiente]}/v2/${rota}?ref=${encodeURIComponent(ref)}`, token, corpo);
    if (r.status >= 500) throw new ErroFiscal('O emissor de notas está com problema agora. Tente de novo em instantes.', 'indisponivel', r.status);
    if (r.status >= 400) throw new ErroFiscal(mensagemDaFocus(r.json), texto((r.json as Record<string, unknown> | null)?.codigo), r.status);
    return notaDaFocus(r.json, ambiente) ?? { externo: ref, situacao: 'processando' };
  }

  return {
    nome: 'focus',

    async cadastrarEmpresa(e, atual) {
      const corpo = corpoDaEmpresa(e);
      const id = atual?.empresaId;
      const r = id
        ? await chamar('PUT', `${BASES_FOCUS.producao}/v2/empresas/${encodeURIComponent(id)}`, cfg.tokenConta, corpo)
        : await chamar('POST', `${BASES_FOCUS.producao}/v2/empresas`, cfg.tokenConta, corpo);
      if (r.status >= 400) throw new ErroFiscal(mensagemDaFocus(r.json, 'O emissor de notas não aceitou o cadastro da empresa.'), null, r.status);
      const j = (r.json ?? {}) as Record<string, unknown>;
      const empresaId = texto(j.id) ?? id ?? null;
      if (!empresaId) throw new ErroFiscal('O emissor de notas não devolveu o cadastro da empresa. Tente de novo.');
      // a resposta da alteração pode vir sem os tokens: valem os que já estavam guardados
      const tokens = {
        producao: texto(j.token_producao) ?? atual?.tokens?.producao ?? null,
        homologacao: texto(j.token_homologacao) ?? atual?.tokens?.homologacao ?? null
      };
      const token = tokens[e.ambiente];
      if (token) {
        try {
          await ligarAvisos(token, e.ambiente, e.cnpj, [e.padraoNfse === 'nacional' ? 'nfsen' : 'nfse', 'nfe']);
        } catch (erro) {
          // sem os avisos, a consulta mostra o resultado: a empresa fica cadastrada mesmo assim
          console.warn('[fiscal] gatilhos da Focus', erro instanceof Error ? erro.message : erro);
        }
      }
      return { credenciais: { empresaId, tokens }, certificadoValidoAte: texto(j.certificado_valido_ate) };
    },

    async enviarCertificado(c, _cnpj, arquivoBase64, senha) {
      if (!c.empresaId) throw new ErroFiscal('Salve o cadastro fiscal antes de mandar o certificado.');
      const r = await chamar('PUT', `${BASES_FOCUS.producao}/v2/empresas/${encodeURIComponent(c.empresaId)}`, cfg.tokenConta, {
        arquivo_certificado_base64: arquivoBase64,
        senha_certificado: senha
      });
      if (r.status >= 400) throw new ErroFiscal(mensagemDaFocus(r.json, 'O emissor de notas não aceitou o certificado. Confira o arquivo e a senha.'), null, r.status);
      return { validoAte: texto((r.json as Record<string, unknown> | null)?.certificado_valido_ate) };
    },

    async emitirNfse(n, c) {
      const rota = n.padrao === 'nacional' ? 'nfsen' : 'nfse';
      return emitir(rota, n.referencia, n.ambiente, tokenDe(c, n.ambiente), rota === 'nfsen' ? corpoDaNfsen(n) : corpoDaNfseMunicipal(n));
    },

    async emitirNfe(n, c) {
      return emitir('nfe', n.referencia, n.ambiente, tokenDe(c, n.ambiente), corpoDaNfe(n));
    },

    async consultar(tipo, externo, ambiente, c) {
      const r = await chamar('GET', `${BASES_FOCUS[ambiente]}/v2/${rotaDe(tipo, externo)}/${encodeURIComponent(externo)}`, tokenDe(c, ambiente));
      if (r.status === 404) return null;
      if (r.status >= 400) throw new ErroFiscal(mensagemDaFocus(r.json, 'Não deu para consultar a nota agora.'), null, r.status);
      return notaDaFocus(r.json, ambiente);
    },

    async cancelar(tipo, externo, ambiente, justificativa, c) {
      const r = await chamar('DELETE', `${BASES_FOCUS[ambiente]}/v2/${rotaDe(tipo, externo)}/${encodeURIComponent(externo)}`, tokenDe(c, ambiente), { justificativa });
      if (r.status >= 400) throw new ErroFiscal(mensagemDaFocus(r.json, 'O emissor de notas não cancelou a nota.'), null, r.status);
      const j = (r.json ?? {}) as Record<string, unknown>;
      if (j.status === 'erro_cancelamento') throw new ErroFiscal(mensagemDaFocus(j, 'A nota não pôde ser cancelada.'), 'erro_cancelamento', r.status);
      if (j.status !== 'cancelado') throw new ErroFiscal('O emissor de notas não confirmou o cancelamento. Confira a nota em instantes.');
      return {
        externo,
        situacao: 'cancelada',
        mensagem: texto(j.mensagem_sefaz),
        urlXml: null
      };
    },

    validarWebhook(p: PedidoWebhook) {
      if (!cfg.segredoWebhook) return false;
      const recebido = p.cabecalhos.get(CABECALHO_AVISO) ?? p.cabecalhos.get('authorization') ?? '';
      return iguais(recebido.replace(/^Bearer\s+/i, ''), cfg.segredoWebhook);
    },

    lerEvento(corpo: unknown, url?: URL): EventoFiscal | null {
      const a = url?.searchParams.get('ambiente');
      const ambiente: AmbienteFiscal | null = a === 'producao' || a === 'homologacao' ? a : null;
      const nota = notaDaFocus(corpo, ambiente);
      if (!nota) return null;
      const rota = rotaDaReferencia(nota.externo);
      const c = (corpo ?? {}) as Record<string, unknown>;
      return {
        id: ['focus', nota.externo, String(c.status ?? ''), nota.numero ?? '', texto(c.caminho_xml_cancelamento) ? 'cancelamento' : ''].join(':').slice(0, 200),
        tipo: rota === 'nfe' ? 'nfe' : rota ? 'nfse' : c.chave_nfe ? 'nfe' : 'nfse',
        nota
      };
    }
  };
}
