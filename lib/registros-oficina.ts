// Os cadastros da oficina que vieram depois dos clientes e carros: financeiro, agenda e comissão,
// checklist de entrada, garantia, lembretes (serviço recusado e recall), clube de manutenção e
// fidelidade. Cada coleção é um mapa id -> item no aparelho e uma linha por item no banco
// (public.registros), como clientes e carros, então a sincronização trata todas do mesmo jeito.

import type { Id } from './tipos';

export type FormaPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto' | 'transferencia' | 'fiado' | 'outro';

/** Conta a receber ou a pagar. O caixa do dia são os lançamentos pagos naquele dia. */
export interface Lancamento {
  id: Id;
  tipo: 'receber' | 'pagar';
  descricao: string;
  /** Em reais, sempre positivo. */
  valor: number;
  /** AAAA-MM-DD. */
  vencimento: string;
  /** AAAA-MM-DD em que foi pago ou recebido; null enquanto está em aberto. */
  pagoEm: string | null;
  forma: FormaPagamento | null;
  /** 'servico', 'pecas', 'aluguel', 'salario', 'fornecedor', 'imposto', 'clube', 'outros'... */
  categoria: string;
  /** As parcelas do mesmo pagamento (cartão parcelado, fiado em vezes) têm o mesmo grupo. */
  parcela?: { numero: number; total: number; grupo: Id } | null;
  clienteId?: Id | null;
  /** A ordem de serviço de onde veio. */
  documentoId?: Id | null;
  /** Quem recebe, numa conta a pagar (loja, aluguel, funcionário). */
  favorecido?: string;
  /** O pedido da loja do Revisaí de onde veio a conta a pagar. */
  pedidoCodigo?: string | null;
  /** Quando o lembrete do fiado foi mandado ao cliente. */
  lembradoEm?: string | null;
  observacao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type SituacaoAgendamento = 'marcado' | 'confirmado' | 'chegou' | 'concluido' | 'faltou' | 'cancelado';

export interface Agendamento {
  id: Id;
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM. */
  hora: string;
  duracaoMin: number;
  clienteId?: Id | null;
  veiculoId?: Id | null;
  /** Quem marcou pelo link, antes de virar cliente cadastrado. */
  nome?: string;
  telefone?: string;
  placa?: string;
  servico: string;
  observacao?: string;
  profissionalId?: Id | null;
  situacao: SituacaoAgendamento;
  origem: 'oficina' | 'online' | 'aviso';
  /** O pedido de horário feito pelo link público (id no banco). */
  pedidoOnlineId?: string | null;
  /** A ordem de serviço aberta quando o carro chegou. */
  documentoId?: Id | null;
  /** O pedido do kit da revisão na loja. */
  kitPedidoCodigo?: string | null;
  /** Quando a oficina mandou o lembrete da véspera pelo WhatsApp. */
  lembradoEm?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Mecânico ou ajudante: aparece na agenda, nas ordens e na comissão. */
export interface Profissional {
  id: Id;
  nome: string;
  telefone?: string;
  /** % sobre a mão de obra das ordens em que trabalhou. */
  comissaoServicos: number;
  /** % sobre as peças das ordens em que trabalhou. */
  comissaoPecas: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** Foto ligada a um registro: no Storage quando há conta, pequena no aparelho quando não há. */
export interface FotoRegistro {
  id: Id;
  /** Caminho no bucket 'links' (pasta da oficina), com nome aleatório. */
  caminho?: string | null;
  /** JPEG pequeno (até uns 150 KB) guardado no próprio registro, no modo sem conta. */
  dataUrl?: string | null;
  legenda?: string;
}

export type EstadoItemChecklist = 'ok' | 'falta' | 'avaria';
export type TipoAvaria = 'risco' | 'amassado' | 'quebrado' | 'trincado' | 'outro';

export interface AvariaChecklist {
  id: Id;
  /** Parte do carro: 'frente', 'traseira', 'lateral esquerda', 'teto', 'para-brisa'... */
  local: string;
  tipo: TipoAvaria;
  observacao?: string;
  /** Posição no desenho do carro, de 0 a 1. */
  x?: number;
  y?: number;
  fotoIds?: Id[];
}

/** Checklist de entrada: como o carro chegou, com a assinatura do cliente. */
export interface Checklist {
  id: Id;
  documentoId?: Id | null;
  veiculoId?: Id | null;
  clienteId?: Id | null;
  km?: number | null;
  /** Combustível em oitavos do tanque (0 a 8). */
  combustivel?: number | null;
  /** Estepe, macaco, triângulo, chave de roda, tapetes, som, documento... */
  itens: Record<string, EstadoItemChecklist>;
  avarias: AvariaChecklist[];
  fotos: FotoRegistro[];
  observacao?: string;
  /** Assinatura feita no celular (PNG pequeno em data URL) e quem assinou. */
  assinatura?: { nome: string; imagem: string; quando: string } | null;
  /** O link da cópia para o cliente (o token só existe na criação: guarda o endereço). */
  link?: { codigo: string; url?: string | null; publicadoEm?: string | null } | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Garantia do serviço entregue: o cliente consulta pela placa e pelo código. */
export interface Garantia {
  id: Id;
  documentoId: Id;
  veiculoId?: Id | null;
  clienteId?: Id | null;
  placa?: string;
  /** Entrega do carro, AAAA-MM-DD. */
  inicio: string;
  itens: { descricao: string; tipo: 'servico' | 'peca'; dias: number; km?: number | null; marca?: string }[];
  condicoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Algo para lembrar o cliente: item recusado no orçamento, recall ou anotação da oficina. */
export interface Lembrete {
  id: Id;
  veiculoId?: Id | null;
  clienteId?: Id | null;
  documentoId?: Id | null;
  descricao: string;
  motivo: 'recusado' | 'manual' | 'recall';
  /** Quando avisar, AAAA-MM-DD. */
  data: string;
  valorEstimado?: number | null;
  foto?: FotoRegistro | null;
  recallId?: Id | null;
  situacao: 'aberto' | 'avisado' | 'feito' | 'descartado';
  avisadoEm?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Plano do clube de manutenção que a oficina vende aos clientes. */
export interface ClubePlano {
  id: Id;
  nome: string;
  /** Mensalidade em reais. */
  preco: number;
  descricao?: string;
  /** Serviços incluídos por ano (ex.: 2 trocas de óleo). */
  beneficios: { servico: string; quantidadePorAno: number }[];
  descontoPecas: number;
  descontoServicos: number;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ClubeMembro {
  id: Id;
  planoId: Id;
  clienteId: Id;
  veiculoId?: Id | null;
  /** AAAA-MM-DD. */
  inicio: string;
  /** Dia do mês do vencimento (1 a 28). */
  diaVencimento: number;
  situacao: 'ativo' | 'pausado' | 'cancelado';
  usos: { data: string; servico: string; documentoId?: Id | null }[];
  /** O cartão do membro pelo link público (o código para mostrar e o endereço para mandar de novo). */
  cartao?: { codigo: string | null; url: string | null } | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ClubeCobranca {
  id: Id;
  membroId: Id;
  /** AAAA-MM. */
  competencia: string;
  valor: number;
  vencimento: string;
  pagoEm: string | null;
  forma?: FormaPagamento | null;
  lancamentoId?: Id | null;
  /** O link de pagamento desta mensalidade (para mandar de novo). */
  link?: { codigo: string | null; url: string | null } | null;
  /** Quando o lembrete da mensalidade atrasada foi mandado. */
  lembradoEm?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Pontos do cliente: ganhos nas ordens concluídas, usados em descontos. */
export interface MovimentoFidelidade {
  id: Id;
  clienteId: Id;
  tipo: 'ganho' | 'resgate' | 'ajuste';
  /** Positivo no ganho, negativo no resgate. */
  pontos: number;
  documentoId?: Id | null;
  descricao?: string;
  /** AAAA-MM-DD. */
  data: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Campanha de recall que a oficina anotou (da montadora ou do gov.br). */
export interface Recall {
  id: Id;
  marca: string;
  modelo: string;
  anoDe?: number | null;
  anoAte?: number | null;
  descricao: string;
  /** Endereço da campanha (montadora ou gov.br). */
  fonte?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const COLECOES_EXTRAS = [
  'lancamentos',
  'agendamentos',
  'profissionais',
  'checklists',
  'garantias',
  'lembretes',
  'clubePlanos',
  'clubeMembros',
  'clubeCobrancas',
  'fidelidade',
  'recalls'
] as const;
export type ColecaoExtra = (typeof COLECOES_EXTRAS)[number];

export interface DadosExtras {
  lancamentos: Record<Id, Lancamento>;
  agendamentos: Record<Id, Agendamento>;
  profissionais: Record<Id, Profissional>;
  checklists: Record<Id, Checklist>;
  garantias: Record<Id, Garantia>;
  lembretes: Record<Id, Lembrete>;
  clubePlanos: Record<Id, ClubePlano>;
  clubeMembros: Record<Id, ClubeMembro>;
  clubeCobrancas: Record<Id, ClubeCobranca>;
  fidelidade: Record<Id, MovimentoFidelidade>;
  recalls: Record<Id, Recall>;
}

/** O tipo de um item de uma das coleções novas. */
export type ItemExtra<C extends ColecaoExtra> = DadosExtras[C][Id];

/** O que se passa para gravar um item (o id e as datas são preenchidos quando faltam). */
export type NovoItemExtra<C extends ColecaoExtra> = Omit<ItemExtra<C>, 'id' | 'criadoEm' | 'atualizadoEm'> & {
  id?: Id;
  criadoEm?: string;
};

export const EXTRAS_VAZIOS: DadosExtras = {
  lancamentos: {},
  agendamentos: {},
  profissionais: {},
  checklists: {},
  garantias: {},
  lembretes: {},
  clubePlanos: {},
  clubeMembros: {},
  clubeCobrancas: {},
  fidelidade: {},
  recalls: {}
};

/** As coleções novas de um estado (guardado, backup ou atual), com mapa vazio no que faltar. */
export function extrasDe(s: Partial<DadosExtras> | null | undefined): DadosExtras {
  const r = { ...EXTRAS_VAZIOS };
  for (const c of COLECOES_EXTRAS) {
    const v = s?.[c];
    if (v && typeof v === 'object' && !Array.isArray(v)) (r as Record<string, unknown>)[c] = v;
  }
  return r;
}

/** Monta o item gravado: mantém a criação do anterior e marca a hora da mudança. */
export function itemGravado<C extends ColecaoExtra>(
  novo: NovoItemExtra<C>,
  id: Id,
  anterior: ItemExtra<C> | undefined,
  agora: string
): ItemExtra<C> {
  return {
    ...(anterior ?? {}),
    ...novo,
    id,
    criadoEm: anterior?.criadoEm ?? novo.criadoEm ?? agora,
    atualizadoEm: agora
  } as ItemExtra<C>;
}
