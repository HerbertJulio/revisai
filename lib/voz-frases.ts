// As frases que o passo a passo fala. Cada uma tem um id fixo: a voz natural de cada frase é gerada
// uma vez (rota /api/voz/[id]) e fica guardada; enquanto não existe, o navegador lê o texto.

import type { Categoria } from './tipos';

export const FRASES = {
  tipo: 'Vamos lá! É uma ordem de serviço ou um orçamento?',
  modalidade: 'O orçamento é frio, sem custo para o cliente, ou pago, com a vistoria cobrada?',
  vistoria: 'Quanto custa a vistoria?',
  carro: 'Qual é o carro? Pode falar o modelo ou a placa.',
  modelo: 'E qual é o modelo do carro?',
  placa: 'Qual é a placa do carro?',
  km: 'Quantos quilômetros estão marcando no painel?',
  dono: 'Quem é o dono do carro?',
  telefone: 'Qual é o WhatsApp do dono? Se não souber, é só pular.',
  servicos_ordem: 'O que foi feito no carro? Pode falar tudo, do seu jeito.',
  servicos_orcamento: 'O que precisa ser feito no carro? Pode falar tudo, do seu jeito.',
  peca_oleo_ordem: 'Qual óleo foi usado?',
  peca_oleo_orcamento: 'Qual óleo vai ser usado?',
  peca_ordem: 'Qual peça foi usada?',
  peca_orcamento: 'Qual peça vai ser usada?',
  valores_ordem: 'Confira os valores. Quanto ficou a mão de obra?',
  valores_orcamento: 'Agora os valores. Quanto vai cobrar de mão de obra?',
  conferir_ordem: 'Está tudo certo? O serviço já está pronto?',
  conferir_orcamento: 'Está tudo certo? Posso mandar o orçamento para o cliente?',
  pronto_ordem: 'Pronto! A ordem de serviço foi registrada.',
  pronto_aberta: 'Pronto! A ordem ficou em andamento.',
  pronto_orcamento: 'Pronto! O orçamento foi salvo.',
  repetir: 'Não entendi. Pode repetir?',
  entendi: 'Entendi.'
} as const;

export type FraseId = keyof typeof FRASES;

export function fraseValida(id: string): id is FraseId {
  return Object.prototype.hasOwnProperty.call(FRASES, id);
}

/** Nome da peça na pergunta: "Qual filtro de óleo foi usado?". */
const PECA: Partial<Record<Categoria, string>> = {
  filtro_oleo: 'filtro de óleo',
  filtro_ar: 'filtro de ar',
  filtro_cabine: 'filtro de cabine',
  filtro_combustivel: 'filtro de combustível',
  vela: 'vela',
  correia_dentada: 'correia dentada',
  correia_acessorios: 'correia',
  pastilha_freio: 'pastilha',
  disco_freio: 'disco',
  fluido_freio: 'fluido de freio',
  arrefecimento: 'aditivo do radiador',
  pneu: 'pneu',
  bateria: 'bateria',
  amortecedor: 'amortecedor',
  fluido_cambio: 'óleo do câmbio',
  higienizacao_ar: 'produto de higienização',
  palheta: 'palheta'
};

/**
 * A pergunta da peça de um serviço. O óleo tem voz própria; as outras usam a frase geral
 * na voz natural e o texto com o nome da peça na tela (e na voz do navegador).
 */
export function perguntaDaPeca(categoria: Categoria, tipo: 'ordem' | 'orcamento'): { id: FraseId; texto: string } {
  if (categoria === 'oleo_motor') return tipo === 'ordem' ? { id: 'peca_oleo_ordem', texto: FRASES.peca_oleo_ordem } : { id: 'peca_oleo_orcamento', texto: FRASES.peca_oleo_orcamento };
  const nome = PECA[categoria];
  const id: FraseId = tipo === 'ordem' ? 'peca_ordem' : 'peca_orcamento';
  if (!nome) return { id, texto: FRASES[id] };
  const feminino = /^(vela|correia|pastilha|bateria|palheta)/.test(nome);
  const texto = tipo === 'ordem' ? `Qual ${nome} foi ${feminino ? 'usada' : 'usado'}?` : `Qual ${nome} vai ser ${feminino ? 'usada' : 'usado'}?`;
  return { id, texto };
}
