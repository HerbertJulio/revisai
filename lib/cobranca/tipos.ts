// O que todo gateway de pagamento faz para o Revisaí, num formato só. Cada gateway (Asaas, Efí,
// e o de teste) traduz para isto; o resto do app não sabe qual está ligado.
// Sem nada de servidor aqui (os componentes da tela usam os tipos).

export type Metodo = 'pix_automatico' | 'pix' | 'cartao' | 'boleto';
export type NomeProvedor = 'asaas' | 'efi' | 'teste';
export type SituacaoPagamento = 'pendente' | 'pago' | 'atrasado' | 'cancelado' | 'estornado';
export type SituacaoAssinatura = 'pendente' | 'ativa' | 'atrasada' | 'cancelada';
export type SituacaoNota = 'agendada' | 'emitida' | 'erro' | 'cancelada';

export const METODOS: { id: Metodo; nome: string; descricao: string }[] = [
  { id: 'pix_automatico', nome: 'Pix Automático', descricao: 'Autoriza uma vez no app do banco e o Pix sai sozinho todo mês.' },
  { id: 'pix', nome: 'Pix todo mês', descricao: 'Chega um Pix para pagar a cada mês, por e-mail e aqui no app.' },
  { id: 'cartao', nome: 'Cartão de crédito', descricao: 'Cobra no cartão todo mês. Os dados do cartão ficam só com o banco que cobra.' },
  { id: 'boleto', nome: 'Boleto', descricao: 'Um boleto por mês. Leva até 3 dias úteis para compensar.' }
];

export function nomeDoMetodo(m: string | null | undefined): string {
  return METODOS.find((x) => x.id === m)?.nome ?? (m === 'manual' ? 'Lançado à mão' : 'Pagamento');
}

/** Quem paga (a oficina ou a loja), como vai na nota fiscal. */
export interface Pagador {
  nome: string;
  /** CPF (11) ou CNPJ (14), só números. */
  documento: string;
  email: string;
  telefone?: string | null;
  /** O id da oficina ou da loja no Revisaí (fica no gateway para achar de volta). */
  referencia: string;
}

/** Uma cobrança no gateway. */
export interface Cobranca {
  externo: string;
  valor: number;
  /** AAAA-MM-DD */
  vencimento: string | null;
  /** A página de pagamento do gateway (cartão, boleto ou Pix). */
  link: string | null;
  pixCopiaECola: string | null;
  boletoLinha: string | null;
  situacao: SituacaoPagamento;
  /** Quando foi pago (ISO), se foi. */
  pagoEm: string | null;
  metodo: Metodo | null;
}

export interface AssinaturaCriada {
  clienteExterno: string | null;
  assinaturaExterna: string;
  proximoVencimento: string | null;
  /** Pix Automático: o copia e cola que o pagador lê no app do banco para autorizar. */
  autorizacao: string | null;
  /** A primeira cobrança, quando o gateway já cria junto. */
  primeira: Cobranca | null;
}

export interface Nota {
  externa: string;
  situacao: SituacaoNota;
  numero: string | null;
  url: string | null;
  erro?: string | null;
}

export interface NovaAssinatura {
  cliente: string;
  pagador: Pagador;
  metodo: Metodo;
  valor: number;
  descricao: string;
  /** O vencimento da primeira cobrança (AAAA-MM-DD). */
  primeiroVencimento: string;
  /** IP de quem assinou (alguns gateways pedem no cartão). */
  ip?: string | null;
}

export interface NovaCobranca {
  cliente: string;
  pagador: Pagador;
  valor: number;
  vencimento: string;
  descricao: string;
  referencia: string;
}

export interface NovaNota {
  /** A cobrança no gateway (quando o gateway emite a nota da própria cobrança). */
  pagamentoExterno: string | null;
  /** O cliente no gateway (nota avulsa, quando a cobrança foi por outro gateway). */
  cliente: string | null;
  valor: number;
  descricao: string;
}

export interface PedidoWebhook {
  cabecalhos: Headers;
  url: URL;
  corpo: string;
}

/** O que o aviso do gateway quer dizer, já traduzido. */
export type Evento =
  | { id: string; tipo: 'cobranca'; cobranca: Cobranca; assinatura: string | null }
  | { id: string; tipo: 'pago'; externo: string; pagoEm: string | null; assinatura: string | null; cobranca: Cobranca | null }
  | { id: string; tipo: 'atrasado'; externo: string }
  | { id: string; tipo: 'cancelado' | 'estornado'; externo: string }
  | { id: string; tipo: 'assinatura_cancelada'; assinatura: string }
  | { id: string; tipo: 'autorizacao_ativa' | 'autorizacao_recusada'; assinatura: string }
  | { id: string; tipo: 'nota'; externo: string | null; nota: Nota }
  | { id: string; tipo: 'ignorado'; motivo: string };

export interface Provedor {
  nome: NomeProvedor;
  /** Os jeitos de pagar que este gateway atende. */
  metodos: Metodo[];
  /** Emite nota fiscal (NFS-e). */
  emiteNota: boolean;
  criarCliente(p: Pagador): Promise<string>;
  criarAssinatura(a: NovaAssinatura): Promise<AssinaturaCriada>;
  cancelarAssinatura(externa: string): Promise<void>;
  consultarPagamento(externo: string): Promise<Cobranca | null>;
  /** As cobranças que o gateway já gerou para a assinatura (as mais novas primeiro). */
  cobrancasDaAssinatura(externa: string): Promise<Cobranca[]>;
  /** Uma cobrança por Pix, sem assinatura (a mensalidade das lojas). */
  gerarCobrancaAvulsa(c: NovaCobranca): Promise<Cobranca>;
  /** A cobrança do mês de uma assinatura por Pix Automático (só quando o gateway pede uma a uma). */
  agendarCobrancaRecorrente?(assinatura: string, valor: number, vencimento: string, descricao: string): Promise<Cobranca>;
  emitirNota(n: NovaNota): Promise<Nota>;
  validarWebhook(p: PedidoWebhook): boolean;
  lerEventos(corpo: unknown): Evento[];
}

export class ErroDoGateway extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly detalhe: unknown = null
  ) {
    super(mensagem);
    this.name = 'ErroDoGateway';
  }
}
