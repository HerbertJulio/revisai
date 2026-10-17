// Os links que a oficina manda para o cliente dela (orçamento, andamento do serviço, checklist,
// garantia e histórico do carro), guardados no banco (public.links_publicos). O banco guarda só o
// hash do token: o endereço completo volta uma vez, na criação, e fica guardado junto do documento
// (documento.links[tipo]), do carro (veiculo.links.historico) ou do checklist (checklist.link).
// Republicar atualiza o que o cliente vê e mantém o mesmo endereço.
// Sem nada de servidor aqui: o navegador publica e as páginas do cliente leem com os mesmos esquemas.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mensagemDoBanco } from './conta-dados';
import { validoAte } from './documentos';
import { primeiroNome } from './formatos';
import { servico as infoServico, servicoExiste } from './manutencao';
import type { Cliente, Documento, Veiculo } from './tipos';

export const TIPOS_LINK = ['orcamento', 'andamento', 'garantia', 'historico', 'checklist', 'pagamento', 'clube'] as const;
export type TipoLink = (typeof TIPOS_LINK)[number];

/** O que o app guarda de cada link: o código curto (para mostrar) e o endereço (o token só existe na criação). */
export interface LinkGuardado {
  codigo: string;
  url?: string | null;
  publicadoEm?: string | null;
}

export const TOKEN_LINK = /^[A-Za-z0-9_-]{43}$/;

export function tokenValido(token: string | null | undefined): token is string {
  return !!token && TOKEN_LINK.test(token);
}

export function urlDoLink(origem: string, token: string): string {
  return `${origem.replace(/\/$/, '')}/l/${token}`;
}

/** O token de um endereço /l/<token> (ou null). */
export function tokenDaUrl(url: string | null | undefined): string | null {
  const m = (url ?? '').match(/\/l\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/** Por quantos dias cada link vale (renovado a cada publicação). */
export const DIAS_DO_LINK: Record<TipoLink, number> = {
  orcamento: 30,
  andamento: 90,
  checklist: 180,
  garantia: 400,
  historico: 1095,
  pagamento: 30,
  clube: 365
};

export interface PedidoDePublicacao {
  oficinaId: string;
  tipo: TipoLink;
  ref: string;
  dados: object;
  dias?: number;
  placa?: string | null;
  /** Gera um endereço novo (o antigo para de valer). */
  novo?: boolean;
}

export type ResultadoDaPublicacao = { ok: true; link: LinkGuardado; criado: boolean } | { ok: false; erro: string };

/**
 * Publica (ou atualiza) o link pelo navegador. O token volta só quando o link é criado; depois,
 * o endereço guardado continua valendo. Se o link já existia e o endereço não está guardado
 * (outro aparelho criou e ainda não sincronizou, ou se perdeu), gera um endereço novo.
 */
export async function publicarLink(sb: SupabaseClient, origem: string, p: PedidoDePublicacao, anterior?: LinkGuardado | null): Promise<ResultadoDaPublicacao> {
  const chamar = async (novo: boolean): Promise<{ erro: string } | { token: string | null; codigo: string }> => {
    const { data, error } = await sb.rpc('publicar_link', {
      p_oficina: p.oficinaId,
      p_tipo: p.tipo,
      p_ref: p.ref,
      p_dados: p.dados,
      p_dias: Math.max(1, Math.min(3650, Math.round(p.dias ?? DIAS_DO_LINK[p.tipo]))),
      p_placa: p.placa ?? null,
      p_novo: novo
    });
    if (error) return { erro: mensagemDoBanco(error, 'Não deu para publicar o link agora. Tente de novo.') };
    const r = (data ?? {}) as { token?: string | null; codigo?: string | null };
    return { token: r.token ?? null, codigo: r.codigo ?? '' };
  };
  let r = await chamar(!!p.novo);
  if ('erro' in r) return { ok: false, erro: r.erro };
  let url = r.token ? urlDoLink(origem, r.token) : (anterior?.url ?? null);
  if (!url) {
    r = await chamar(true);
    if ('erro' in r) return { ok: false, erro: r.erro };
    url = r.token ? urlDoLink(origem, r.token) : null;
  }
  if (!url) return { ok: false, erro: 'Não deu para criar o link agora. Tente de novo.' };
  return { ok: true, criado: !!r.token, link: { codigo: r.codigo, url, publicadoEm: new Date().toISOString() } };
}

// ---------------------------------------------------------------- o que o cliente vê (ver_link)

const textoOpcional = z.string().nullish().transform((v) => v ?? null);

export const esquemaOficinaDoLink = z.object({
  nome: z.string().nullish().transform((v) => v || 'Oficina'),
  whatsapp: textoOpcional,
  cidade: textoOpcional,
  uf: textoOpcional,
  endereco: textoOpcional,
  linkAvaliacao: textoOpcional,
  cnpj: textoOpcional
});
export type OficinaDoLink = z.infer<typeof esquemaOficinaDoLink>;

export const esquemaLinkVisto = z.object({
  tipo: z.enum(TIPOS_LINK),
  dados: z.record(z.string(), z.unknown()),
  codigo: textoOpcional,
  resposta: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? null),
  respondidoEm: textoOpcional,
  atualizadoEm: z.string(),
  expiraEm: z.string(),
  oficina: esquemaOficinaDoLink
});
export type LinkVisto = z.infer<typeof esquemaLinkVisto>;

/** O que o banco guarda na resposta (o cliente manda a ação; o banco junta data, IP e aparelho). */
export const esquemaRespostaDoLink = z.object({
  acao: z.enum(['aprovar', 'recusar', 'assinar']),
  recusadas: z.array(z.string()).nullish().transform((v) => v ?? []),
  nome: z.string().nullish().transform((v) => (v ?? '').trim()),
  /** Resumo do que foi aprovado (lib/aprovacao), o mesmo que o cliente viu na tela. */
  hashAprovado: textoOpcional,
  total: z.number().nullish().transform((v) => v ?? null),
  /** Assinatura do checklist (PNG em data URL). */
  imagem: textoOpcional,
  quando: z.string(),
  ip: textoOpcional,
  agente: textoOpcional
});
export type RespostaDoLink = z.infer<typeof esquemaRespostaDoLink>;

export function lerResposta(v: unknown): RespostaDoLink | null {
  const r = esquemaRespostaDoLink.safeParse(v);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- orçamento

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dinheiro = z.number().min(-1_000_000).max(1_000_000);

export const esquemaOrcamentoLink = z.object({
  v: z.literal(1),
  numero: z.number().int().min(1).max(10_000_000),
  data: dia,
  validade: dia,
  modalidade: z.enum(['frio', 'pago']),
  vistoria: z.object({ valor: dinheiro, abater: z.boolean() }).nullish(),
  cliente: z.string().max(60),
  carro: z.object({
    nome: z.string().max(80),
    placa: z.string().max(8),
    ano: z.number().int().min(1900).max(2100).nullish(),
    km: z.number().int().min(0).max(5_000_000).nullish()
  }),
  linhas: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        tipo: z.enum(['peca', 'servico', 'outro']),
        descricao: z.string().min(1).max(160),
        quantidade: z.number().min(0).max(100_000),
        unidade: z.enum(['un', 'L', 'h']),
        valorUnitario: dinheiro.nullable(),
        /** O serviço a que a linha pertence (para agrupar na tela). */
        grupo: z.string().max(60).nullish()
      })
    )
    .min(1)
    .max(100),
  desconto: z.number().min(0).max(1_000_000).nullish(),
  diagnostico: z.string().max(800).nullish(),
  recomendacoes: z
    .array(z.object({ texto: z.string().max(200), urgencia: z.enum(['agora', 'proxima_revisao', 'observar']) }))
    .max(10)
    .nullish(),
  prazo: z.string().max(80).nullish(),
  pagamento: z.string().max(120).nullish(),
  observacao: z.string().max(400).nullish()
});
export type DadosOrcamentoLink = z.infer<typeof esquemaOrcamentoLink>;
export type LinhaOrcamentoLink = DadosOrcamentoLink['linhas'][number];

const corta = (t: string | undefined | null, max: number) => (t ?? '').trim().slice(0, max);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * O orçamento como vai para o link do servidor: todas as linhas com o id (o cliente recusa pelo
 * id), sem os dados da oficina (o banco põe os dela, que o link não consegue trocar).
 * Também é a base da prova da aprovação (lib/aprovacao), dos dois lados.
 */
export function dadosDoOrcamento(doc: Documento, cliente: Cliente | undefined, veiculo: Veiculo | undefined): DadosOrcamentoLink {
  const ano = veiculo?.ano && veiculo.ano >= 1900 && veiculo.ano <= 2100 ? Math.round(veiculo.ano) : null;
  const recs = (doc.recomendacoes ?? []).filter((r) => r.texto.trim()).slice(0, 10);
  return {
    v: 1,
    numero: doc.numero,
    data: doc.data,
    validade: validoAte(doc),
    modalidade: doc.modalidade === 'pago' ? 'pago' : 'frio',
    vistoria: doc.modalidade === 'pago' && doc.vistoria && doc.vistoria.valor > 0 ? { valor: r2(doc.vistoria.valor), abater: doc.vistoria.abater } : null,
    cliente: corta(primeiroNome(cliente?.nome ?? ''), 60),
    carro: {
      nome: corta([veiculo?.marca, veiculo?.modelo].filter(Boolean).join(' '), 80) || 'Carro',
      placa: corta(veiculo?.placa, 8),
      ano,
      km: doc.km != null && doc.km >= 0 ? Math.round(doc.km) : null
    },
    linhas: doc.linhas
      .filter((l) => l.descricao.trim())
      .slice(0, 100)
      .map((l) => ({
        id: l.id.slice(0, 100),
        tipo: l.tipo,
        descricao: corta(l.descricao, 160),
        quantidade: r2(Math.max(0, l.quantidade)),
        unidade: l.unidade,
        valorUnitario: l.valorUnitario == null ? null : r2(l.valorUnitario),
        grupo: l.servico && servicoExiste(l.servico) ? infoServico(l.servico).nome : null
      })),
    desconto: doc.desconto && doc.desconto > 0 ? r2(doc.desconto) : null,
    diagnostico: corta(doc.diagnostico, 800) || null,
    recomendacoes: recs.length ? recs.map((r) => ({ texto: corta(r.texto, 200), urgencia: r.urgencia })) : null,
    prazo: corta(doc.prazo, 80) || null,
    pagamento: corta(doc.pagamento, 120) || null,
    observacao: corta(doc.observacao, 400) || null
  };
}

export function lerOrcamentoDoLink(dados: unknown): DadosOrcamentoLink | null {
  const r = esquemaOrcamentoLink.safeParse(dados);
  return r.success ? r.data : null;
}

/** "Rio de Janeiro - RJ". */
export function cidadeDaOficina(o: { cidade?: string | null; uf?: string | null }): string {
  return [o.cidade?.trim(), o.uf?.trim()].filter(Boolean).join(' - ');
}

/** A data de hoje no Brasil (o servidor roda em outro fuso). */
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
