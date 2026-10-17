// Tipos do domínio. Datas de calendário são 'AAAA-MM-DD'; instantes (criadoEm, quando) são ISO completos.

import type { FotoRegistro } from './registros-oficina';

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
  /** Link do Google para o cliente avaliar a oficina (g.page/r/.../review). */
  linkAvaliacao?: string;
  cnpj?: string;
  razaoSocial?: string;
  inscricaoMunicipal?: string;
  /** Chave Pix da oficina (cobrança do cliente, fiado e clube). */
  chavePix?: string;
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
  /** Mandar a previsão de compras (sem dados dos clientes) para os fornecedores da região. */
  compartilharDemanda: boolean;
  /** Quanto a oficina põe em cima do custo da peça no orçamento (%). */
  margemPecas: number;
  /** Validade padrão do orçamento, em dias (o Código de Defesa do Consumidor fala em 10). */
  validadeOrcamento: number;
  /** O passo a passo fala as perguntas em voz alta. */
  vozGuia: boolean;
  /** Horário de trabalho, usado na agenda e no agendamento pelo link. */
  agenda?: {
    diasSemana: number[];
    inicio: string;
    fim: string;
    intervaloMin: number;
    vagasPorHorario: number;
    agendamentoOnline: boolean;
    /** O horário de cada dia da semana (0 = domingo), quando os dias não são iguais; null: fechado. */
    semana?: ({ inicio: string; fim: string } | null)[];
    /** Pausa de todos os dias (o almoço): não tem horário nela. */
    pausa?: { inicio: string; fim: string } | null;
    /** Dias fechados fora da semana normal (feriado, férias), AAAA-MM-DD. */
    folgas?: string[];
    /** O endereço do agendamento pelo link (/agendar/<slug>), depois que a oficina ligou. */
    slug?: string | null;
  };
  /** Garantia que sai na entrega do carro, em dias (o CDC dá 90 para serviço). */
  garantiaPadrao?: { servicosDias: number; pecasDias: number; condicoes: string };
  fidelidade?: { ativo: boolean; pontosPorReal: number; reaisPorPonto: number; minimoResgate: number };
}

export interface Cliente {
  id: Id;
  nome: string;
  telefone: string;
  email?: string;
  /** Para a nota fiscal de serviço. */
  cpfCnpj?: string;
  endereco?: string;
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
  chassi?: string;
  cor?: string;
  anoModelo?: number | null;
  /** Valor da tabela FIPE na última consulta. */
  fipe?: { codigo: string; valor: number | null; referencia: string; consultadoEm: string } | null;
  observacao?: string;
  /** O link do histórico verificado do carro (o token só existe na criação: guarda o endereço). */
  links?: { historico?: { codigo: string; url?: string | null; publicadoEm?: string | null } } | null;
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
  /** Produto da loja. */
  id?: number;
  nome: string;
  categoria?: Categoria;
  especificacao?: EspecProduto;
  /** Linha da base de prazos por produto (o que o fabricante recomenda). */
  referenciaId?: number;
  /** Produto cadastrado pela própria oficina. */
  proprioId?: string;
  /** Saiu do estoque da oficina. */
  estoqueId?: string;
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

export interface ItemPedidoEnviado {
  produtoId: number;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  fornecedorId?: number;
  fornecedor?: string;
  /** Chave para achar o mesmo produto em outras lojas (lib/precos). */
  chave?: string;
  /** Preço por litro (óleo) ou por unidade, para comparar embalagens diferentes. */
  precoComparavel?: number;
  /** Preço combinado num alerta de preço. */
  combinado?: boolean;
}

export interface PedidoEnviado {
  codigo: string;
  quando: string;
  itens: ItemPedidoEnviado[];
  total: number;
  /** Já deu entrada no estoque. */
  recebidoEm?: string;
  /** Saiu de um alerta de preço. */
  alertaId?: string;
}

// ---------------------------------------------------------------- estoque

/** 'L' para óleo e fluidos contados em litros; 'un' para peças. */
export type UnidadeEstoque = 'un' | 'L';

/** Peça ou fluido que a oficina tem guardado. */
export interface ItemEstoque {
  id: Id;
  nome: string;
  marca?: string;
  categoria: Categoria;
  especificacao?: EspecProduto;
  unidade: UnidadeEstoque;
  quantidade: number;
  /** Abaixo disso, o app avisa para comprar. */
  minimo: number;
  /** Quanto a oficina pagou por unidade (ou litro) na última entrada. */
  custo: number | null;
  /** Quanto cobra do cliente por unidade (ou litro). */
  preco: number | null;
  /** Produto da loja do Revisaí para comprar de novo (dá a foto e o preço). */
  produtoLojaId?: number;
  referenciaId?: number;
  proprioId?: Id;
  imagemUrl?: string | null;
  /** Código de barras ou código do fabricante. */
  codigo?: string;
  /** Código de barras (GTIN/EAN) lido pela câmera ou pela nota de compra. */
  ean?: string;
  ncm?: string;
  /** Código do produto na nota do fornecedor (para reconhecer na próxima nota). */
  codigoFornecedor?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type TipoMovimento = 'entrada' | 'saida' | 'ajuste';

export interface MovimentoEstoque {
  id: Id;
  itemId: Id;
  quando: string;
  tipo: TipoMovimento;
  /** Positivo na entrada, negativo na saída; no ajuste, a diferença para a contagem. */
  quantidade: number;
  /** Na entrada: quanto pagou por unidade (ou litro). */
  custoUnitario?: number | null;
  /** De quem comprou (na entrada). */
  fornecedor?: string;
  /** Na entrada pela nota de compra (tipo 'nota'), o id é a chave de acesso da NF-e. */
  origem?: { tipo: 'ordem' | 'pedido' | 'manual' | 'contagem' | 'nota'; id?: string; rotulo?: string };
  observacao?: string;
}

// ---------------------------------------------------------------- orçamentos e ordens de serviço

export type TipoDocumento = 'orcamento' | 'ordem';

/** Frio: o cliente não paga pela vistoria. Pago: a vistoria é cobrada (e pode ser abatida). */
export type ModalidadeOrcamento = 'frio' | 'pago';

/**
 * Orçamento: rascunho, enviado, aprovado ou recusado (o vencido sai da data).
 * Ordem de serviço: aberta, concluída ou cancelada.
 */
export type SituacaoDocumento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado' | 'aberta' | 'concluida' | 'cancelada';

export type TipoLinha = 'peca' | 'servico' | 'outro';
export type UnidadeLinha = 'un' | 'L' | 'h';

export interface LinhaDocumento {
  id: Id;
  tipo: TipoLinha;
  /** Serviço de manutenção a que a linha pertence (é o que vira aviso). */
  servico?: ServicoId;
  descricao: string;
  quantidade: number;
  unidade: UnidadeLinha;
  /** Preço por unidade; null quando ainda não tem preço. */
  valorUnitario: number | null;
  /** A peça sai deste item do estoque. */
  estoqueId?: Id;
  /** O produto, para o aviso da próxima troca. */
  produto?: ProdutoUsado | null;
  intervaloKm?: number | null;
  intervaloMeses?: number | null;
  /** O cliente não aprovou este item. */
  recusada?: boolean;
  /** Quem fez (para a comissão). */
  profissionalId?: Id | null;
}

export type UrgenciaRecomendacao = 'agora' | 'proxima_revisao' | 'observar';

/** Etapas do serviço que o cliente acompanha pelo link. */
export type EtapaServico = 'recebido' | 'diagnostico' | 'aguardando_aprovacao' | 'aguardando_pecas' | 'em_servico' | 'pronto' | 'entregue';

/** Prova da aprovação do orçamento pelo cliente. */
export interface AprovacaoDocumento {
  canal: 'link' | 'whatsapp' | 'presencial';
  /** ISO, com hora. */
  quando: string;
  nome?: string;
  ip?: string | null;
  agente?: string | null;
  /** Resumo (hash) do que foi aprovado, para provar que o orçamento não mudou depois. */
  versao: string;
  copiaEnviadaPara?: string | null;
  /** Pelo WhatsApp: o que o cliente respondeu ou o que a oficina anotou. */
  observacao?: string;
  /** Na oficina: a assinatura feita no aparelho (PNG pequeno em data URL). */
  assinatura?: string | null;
}

export interface Documento {
  id: Id;
  /** Número sequencial da oficina (orçamentos e ordens contam separado). */
  numero: number;
  tipo: TipoDocumento;
  situacao: SituacaoDocumento;
  veiculoId: Id | null;
  /** null quando o mecânico não sabe a quilometragem. */
  km: number | null;
  data: string;
  linhas: LinhaDocumento[];
  desconto: number | null;
  modalidade?: ModalidadeOrcamento;
  /** Orçamento pago: quanto custa a vistoria e se ela sai do total quando o cliente aprova. */
  vistoria?: { valor: number; abater: boolean } | null;
  validadeDias?: number;
  /** "2 dias úteis". */
  prazo?: string;
  /** "Pix ou cartão em até 3 vezes". */
  pagamento?: string;
  diagnostico?: string;
  observacao?: string;
  recomendacoes?: { texto: string; urgencia: UrgenciaRecomendacao }[];
  /** O que o mecânico falou, já em texto. */
  relato?: string;
  enviadoEm?: string;
  respondidoEm?: string;
  concluidoEm?: string;
  /** A ordem veio deste orçamento. */
  orcamentoId?: Id;
  /** O orçamento virou esta ordem. */
  ordemId?: Id;
  /** A ordem concluída registrou este serviço (é o que gera os avisos). */
  atendimentoId?: Id;
  /** A ordem por voz (áudio e fotos) de onde veio. */
  vozId?: Id;
  etapa?: EtapaServico;
  andamento?: { etapa: EtapaServico; quando: string; nota?: string; fotoIds?: Id[] }[];
  fotos?: FotoRegistro[];
  checklistId?: Id | null;
  garantiaId?: Id | null;
  agendamentoId?: Id | null;
  /** Mecânico responsável (a comissão usa o de cada linha quando houver). */
  profissionalId?: Id | null;
  aprovacao?: AprovacaoDocumento | null;
  /** Links públicos deste documento: o código curto para mostrar (o token só existe na criação). */
  links?: Partial<Record<'orcamento' | 'andamento' | 'garantia' | 'checklist' | 'pagamento', { codigo: string; url?: string | null; publicadoEm?: string | null }>>;
  /** Nota fiscal de serviço desta ordem. */
  nota?: { situacao: 'processando' | 'autorizada' | 'erro' | 'cancelada'; numero?: string | null; url?: string | null; chave?: string | null; mensagem?: string | null } | null;
  criadoEm: string;
  atualizadoEm: string;
}
