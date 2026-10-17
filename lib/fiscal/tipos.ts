// O que o Revisaí pede a um emissor de notas fiscais (provedor fiscal), sem depender de qual é.
// Cada emissor (lib/fiscal/focus.ts, lib/fiscal/teste.ts) traduz para a API dele.

export type NomeProvedorFiscal = 'focus' | 'teste';
export type AmbienteFiscal = 'homologacao' | 'producao';
export type RegimeFiscal = 'mei' | 'simples' | 'normal';
export type PadraoNfse = 'nacional' | 'municipal';
export type TipoNota = 'nfse' | 'nfe';
export type SituacaoNota = 'processando' | 'autorizada' | 'erro' | 'cancelada';

export interface Endereco {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  /** Só os 8 números. */
  cep: string;
  /** Código IBGE da cidade (7 números), quando a nota pede. */
  codigoMunicipio?: string | null;
}

/** A oficina como empresa no emissor. */
export interface EmpresaFiscal {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  regime: RegimeFiscal;
  inscricaoMunicipal?: string | null;
  inscricaoEstadual?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: Endereco | null;
  padraoNfse: PadraoNfse;
  ambiente: AmbienteFiscal;
}

/**
 * O que o servidor guarda para falar com o emissor em nome da oficina (cifrado no banco): o id
 * da empresa lá e, quando o emissor dá, as chaves de acesso de cada ambiente.
 */
export interface CredenciaisFiscais {
  empresaId: string | null;
  tokens?: Partial<Record<AmbienteFiscal, string | null>>;
}

export interface EmpresaCadastrada {
  credenciais: CredenciaisFiscais;
  certificadoValidoAte: string | null;
}

/** Quem recebe a nota (o cliente da oficina). */
export interface Tomador {
  nome: string;
  /** CPF (11) ou CNPJ (14), só letras e números. */
  documento: string;
  email?: string | null;
  telefone?: string | null;
  endereco?: Endereco | null;
}

/** A nota de serviço (mão de obra), do jeito do Revisaí. */
export interface NovaNfse {
  /** A referência da nota no emissor (gerada pelo Revisaí, única). */
  referencia: string;
  ambiente: AmbienteFiscal;
  padrao: PadraoNfse;
  /** ISO com o fuso de Brasília. */
  dataEmissao: string;
  /** AAAA-MM-DD. */
  competencia: string;
  prestador: {
    cnpj: string;
    regime: RegimeFiscal;
    inscricaoMunicipal?: string | null;
    /** Código IBGE da cidade da oficina. */
    codigoMunicipio: string;
  };
  tomador: Tomador;
  servico: {
    descricao: string;
    valor: number;
    /** Item da LC 116 ('14.01'). */
    itemListaServico: string;
    /** Código de tributação nacional ('140101'). */
    codigoTributacaoNacional: string;
    codigoTributacaoMunicipal?: string | null;
    /** Alíquota do ISS em %; no padrão nacional o sistema já sabe quando a cidade está nele. */
    aliquotaIss?: number | null;
    cnae?: string | null;
  };
  /** Situação e classificação do IBS/CBS (reforma tributária), quando o contador informou. */
  ibsCbs?: { situacao: string; classificacao: string } | null;
}

export interface ItemNfe {
  numero: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: '5102' | '5405';
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  valorDesconto: number;
  /** CSOSN (Simples e MEI) ou CST do ICMS (regime normal). */
  icms: { situacao: string; origem: number; aliquota?: number | null; base?: number | null; valor?: number | null };
  pis: string;
  cofins: string;
}

/** A nota das peças (NF-e modelo 55), venda ao consumidor dentro do estado. */
export interface NovaNfe {
  referencia: string;
  ambiente: AmbienteFiscal;
  dataEmissao: string;
  emitente: { cnpj: string; regime: RegimeFiscal; inscricaoEstadual?: string | null };
  destinatario: Tomador;
  itens: ItemNfe[];
  valorProdutos: number;
  valorDesconto: number;
  valorTotal: number;
  /** Forma de pagamento da NF-e (01 dinheiro, 03 crédito, 04 débito, 17 Pix, 90 sem pagamento...). */
  formaPagamento: string;
  informacoesAdicionais?: string | null;
}

/** O que o emissor diz da nota. */
export interface ResultadoNota {
  externo: string;
  situacao: SituacaoNota;
  numero?: string | null;
  serie?: string | null;
  chave?: string | null;
  urlPdf?: string | null;
  urlXml?: string | null;
  mensagem?: string | null;
}

/** Um aviso (webhook) do emissor sobre uma nota. */
export interface EventoFiscal {
  /** Identifica o aviso para não aplicar duas vezes. */
  id: string;
  tipo: TipoNota | null;
  nota: ResultadoNota;
}

export interface PedidoWebhook {
  cabecalhos: Headers;
  url: URL;
  corpo: string;
}

export interface ProvedorFiscal {
  nome: NomeProvedorFiscal;
  /** Cadastra (ou atualiza) a oficina como empresa no emissor e liga os avisos das notas. */
  cadastrarEmpresa(e: EmpresaFiscal, atual: CredenciaisFiscais | null): Promise<EmpresaCadastrada>;
  /** Manda o certificado A1 (.pfx em base64 e a senha) direto para o emissor. Devolve até quando vale. */
  enviarCertificado(c: CredenciaisFiscais, cnpj: string, arquivoBase64: string, senha: string): Promise<{ validoAte: string | null }>;
  emitirNfse(n: NovaNfse, c: CredenciaisFiscais): Promise<ResultadoNota>;
  emitirNfe(n: NovaNfe, c: CredenciaisFiscais): Promise<ResultadoNota>;
  /** O que o emissor diz agora da nota (null quando ele não conhece a referência). */
  consultar(tipo: TipoNota, externo: string, ambiente: AmbienteFiscal, c: CredenciaisFiscais): Promise<ResultadoNota | null>;
  cancelar(tipo: TipoNota, externo: string, ambiente: AmbienteFiscal, justificativa: string, c: CredenciaisFiscais): Promise<ResultadoNota>;
  /** O aviso veio mesmo do emissor (segredo combinado). */
  validarWebhook(p: PedidoWebhook): boolean;
  /** O aviso como o Revisaí entende (o endereço do aviso pode dizer o ambiente). */
  lerEvento(corpo: unknown, url?: URL): EventoFiscal | null;
}

/** Erro que vira mensagem para a pessoa (o resto vira "tente de novo"). */
export class ErroFiscal extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string | null = null,
    readonly status: number | null = null
  ) {
    super(mensagem);
    this.name = 'ErroFiscal';
  }
}
