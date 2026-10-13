// Tipos do domínio. Datas de calendário são 'AAAA-MM-DD'; instantes (criadoEm, quando) são ISO completos.

export type Id = string;

export type ServicoId =
  | 'troca_oleo'
  | 'filtro_oleo'
  | 'filtro_ar'
  | 'filtro_cabine'
  | 'filtro_combustivel'
  | 'velas'
  | 'correia_dentada'
  | 'correia_acessorios'
  | 'pastilhas'
  | 'discos'
  | 'fluido_freio'
  | 'arrefecimento'
  | 'alinhamento'
  | 'rodizio'
  | 'pneus'
  | 'bateria'
  | 'amortecedores'
  | 'cambio_manual'
  | 'cambio_automatico'
  | 'higienizacao'
  | 'palhetas'
  | 'revisao'
  | 'gnv';

/** Categorias de produto da loja (as mesmas do banco). */
export type Categoria =
  | 'oleo_motor'
  | 'filtro_oleo'
  | 'filtro_ar'
  | 'filtro_cabine'
  | 'filtro_combustivel'
  | 'vela'
  | 'correia_dentada'
  | 'correia_acessorios'
  | 'pastilha_freio'
  | 'disco_freio'
  | 'fluido_freio'
  | 'arrefecimento'
  | 'pneu'
  | 'bateria'
  | 'amortecedor'
  | 'fluido_cambio'
  | 'higienizacao_ar'
  | 'palheta'
  | 'outros';

export type BaseOleo = 'mineral' | 'semissintetico' | 'sintetico';

/** Especificação técnica de um produto (o que a recomendação compara). */
export interface EspecProduto {
  viscosidade?: string;
  base?: BaseOleo;
  api?: string;
  ilsac?: string;
  acea?: string[];
  normas?: string[];
  medida?: string;
  amperagem?: number;
  tipo?: string;
}

/** O óleo que o manual pede para o carro. */
export interface EspecOleo {
  viscosidades: string[];
  api?: string;
  acea?: string;
  norma?: string;
  base?: BaseOleo;
  capacidadeL?: number;
}

export interface Intervalo {
  km: number | null;
  meses: number | null;
}

export interface Oficina {
  nome: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  endereco: string;
}

export interface Preferencias {
  /** Avisar quantos dias antes de vencer. */
  antecedenciaDias: number;
  /** Ou quantos km antes de vencer, o que vier primeiro. */
  antecedenciaKm: number;
  usoSeveroPadrao: boolean;
  /** Rodagem usada quando o carro ainda não tem histórico. */
  kmMesPadrao: number;
  mensagem: string;
  intervalos: Partial<Record<ServicoId, Intervalo>>;
  tema: 'auto' | 'claro' | 'escuro';
}

export interface Cliente {
  id: Id;
  nome: string;
  telefone: string;
  email?: string;
  observacao?: string;
  criadoEm: string;
}

export type Combustivel = 'flex' | 'gasolina' | 'etanol' | 'diesel' | 'gnv' | 'hibrido' | 'eletrico';

export interface Veiculo {
  id: Id;
  clienteId: Id;
  placa: string;
  marca: string;
  modelo: string;
  motor?: string;
  ano?: number | null;
  combustivel?: Combustivel;
  /** Rodagem informada pelo cliente; sobrepõe a calculada pelo histórico. */
  kmMes?: number | null;
  /** null segue o padrão da oficina. */
  usoSevero?: boolean | null;
  oleo?: EspecOleo;
  /** Prazo de troca de óleo do manual, quando for diferente do padrão da oficina. */
  intervaloOleo?: Intervalo | null;
  observacao?: string;
  criadoEm: string;
}

/** Quilometragem anotada fora de um atendimento (o cliente passou na oficina, mandou foto do painel). */
export interface Leitura {
  id: Id;
  veiculoId: Id;
  data: string;
  km: number;
}

export interface ProdutoUsado {
  id?: number;
  nome: string;
  categoria?: Categoria;
  especificacao?: EspecProduto;
}

export interface ItemServico {
  servico: ServicoId;
  produto?: ProdutoUsado | null;
  intervaloKm: number | null;
  intervaloMeses: number | null;
  observacao?: string;
}

export interface Atendimento {
  id: Id;
  veiculoId: Id;
  data: string;
  km: number;
  itens: ItemServico[];
  valor?: number | null;
  observacao?: string;
  criadoEm: string;
}

export type ResultadoContato = 'avisado' | 'agendado' | 'adiado' | 'recusou';

/** Registro de que a oficina falou com o cliente sobre um vencimento. */
export interface Contato {
  id: Id;
  veiculoId: Id;
  servico: ServicoId;
  /** O atendimento que abriu este ciclo (um novo serviço fecha o ciclo). */
  atendimentoId: Id;
  quando: string;
  resultado: ResultadoContato;
  /** Agendado para / adiado até. */
  data?: string;
  observacao?: string;
}

export interface ItemCarrinho {
  produtoId: number;
  quantidade: number;
}

export interface PedidoEnviado {
  codigo: string;
  quando: string;
  itens: { produtoId: number; nome: string; quantidade: number; precoUnitario: number }[];
  total: number;
}
