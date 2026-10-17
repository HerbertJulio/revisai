// Regras de cada horário marcado na agenda: os passos (marcado, confirmado, chegou...), quem é o
// cliente, os serviços que o texto pede, a ordem de serviço aberta quando o carro chegou e as
// mensagens de WhatsApp (confirmação, lembrete da véspera e recusa do pedido pelo link).
// Funções puras, para testar sem navegador.

import { dataLocal, diasEntre, formatarDataCurta, somarDias } from './datas';
import { formatarPlaca, normalizarPlaca, normalizarTelefone, primeiroNome } from './formatos';
import { horaCurta } from './horarios';
import { servicoExiste } from './manutencao';
import type { Agendamento, SituacaoAgendamento } from './registros-oficina';
import { diaCurto } from './rotulos';
import type { Cliente, Documento, Id, Oficina, ServicoId, Veiculo } from './tipos';

export const SITUACOES: SituacaoAgendamento[] = ['marcado', 'confirmado', 'chegou', 'concluido', 'faltou', 'cancelado'];

export const ROTULO_SITUACAO: Record<SituacaoAgendamento, string> = {
  marcado: 'Marcado',
  confirmado: 'Confirmado',
  chegou: 'Chegou',
  concluido: 'Concluído',
  faltou: 'Faltou',
  cancelado: 'Cancelado'
};

/** O botão que leva para cada situação. */
export const ACAO_SITUACAO: Record<SituacaoAgendamento, string> = {
  marcado: 'Voltar para marcado',
  confirmado: 'Cliente confirmou',
  chegou: 'Chegou',
  concluido: 'Concluir',
  faltou: 'Faltou',
  cancelado: 'Cancelar'
};

/** Para onde cada situação pode ir. Os finais (concluído, faltou, cancelado) só reabrem. */
const PASSOS: Record<SituacaoAgendamento, SituacaoAgendamento[]> = {
  marcado: ['confirmado', 'chegou', 'faltou', 'cancelado'],
  confirmado: ['chegou', 'faltou', 'cancelado', 'marcado'],
  chegou: ['concluido', 'cancelado', 'confirmado'],
  concluido: ['chegou'],
  faltou: ['marcado'],
  cancelado: ['marcado']
};

export function podeMudar(de: SituacaoAgendamento, para: SituacaoAgendamento): boolean {
  return PASSOS[de]?.includes(para) ?? false;
}

export function proximasSituacoes(de: SituacaoAgendamento): SituacaoAgendamento[] {
  return PASSOS[de] ?? [];
}

/** O passo principal (o botão grande): marcado → confirmado → chegou → concluído. */
export function passoPrincipal(de: SituacaoAgendamento): SituacaoAgendamento | null {
  if (de === 'marcado') return 'confirmado';
  if (de === 'confirmado') return 'chegou';
  if (de === 'chegou') return 'concluido';
  return null;
}

/** Ainda vai acontecer ou está acontecendo (não terminou, não faltou, não foi cancelado). */
export function emAberto(s: SituacaoAgendamento): boolean {
  return s === 'marcado' || s === 'confirmado' || s === 'chegou';
}

export function finalizado(s: SituacaoAgendamento): boolean {
  return !emAberto(s);
}

/** Em ordem de dia e hora (e de criação, no empate). */
export function ordenarAgendamentos<T extends Pick<Agendamento, 'data' | 'hora' | 'criadoEm'>>(lista: T[]): T[] {
  const comparar = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return [...lista].sort((a, b) => comparar(a.data, b.data) || comparar(a.hora, b.hora) || comparar(a.criadoEm, b.criadoEm));
}

// ---------------------------------------------------------------- quem é

export interface QuemE {
  nome: string;
  telefone: string;
  placa: string;
  /** 'Onix 2019', ou vazio quando o carro não está cadastrado. */
  carro: string;
  cliente: Cliente | null;
  veiculo: Veiculo | null;
}

/** O carro do agendamento: o escolhido ou, se a placa for de um carro cadastrado, ele. */
export function veiculoDoAgendamento(a: Pick<Agendamento, 'veiculoId' | 'placa'>, veiculos: Record<Id, Veiculo>): Veiculo | null {
  if (a.veiculoId && veiculos[a.veiculoId]) return veiculos[a.veiculoId];
  const placa = normalizarPlaca(a.placa ?? '');
  if (placa.length === 7) return Object.values(veiculos).find((v) => v.placa === placa) ?? null;
  return null;
}

/**
 * Nome, WhatsApp, placa e carro. O nome e o WhatsApp digitados no horário (o pedido pelo link, o
 * cliente sem cadastro) valem antes do cadastro: quem pediu é quem recebe a confirmação, mesmo
 * quando o carro é de outra pessoa. O carro vem do cadastro (pela escolha ou pela placa).
 */
export function quemE(a: Agendamento, clientes: Record<Id, Cliente>, veiculos: Record<Id, Veiculo>): QuemE {
  const veiculo = veiculoDoAgendamento(a, veiculos);
  const cliente = (a.clienteId ? clientes[a.clienteId] : undefined) ?? (veiculo ? clientes[veiculo.clienteId] : undefined) ?? null;
  return {
    nome: a.nome?.trim() || cliente?.nome || 'Cliente',
    telefone: (a.telefone ? a.telefone : cliente?.telefone) || '',
    placa: veiculo?.placa || normalizarPlaca(a.placa ?? ''),
    carro: veiculo ? [veiculo.modelo, veiculo.ano].filter(Boolean).join(' ') : '',
    cliente,
    veiculo
  };
}

// ---------------------------------------------------------------- serviços do texto

function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Regras na ordem: as mais específicas primeiro, e o trecho reconhecido sai do texto. */
const REGRAS: [RegExp, ServicoId][] = [
  [/fluido do cambio automatico|cambio automatico|\batf\b/g, 'cambio_automatico'],
  [/oleo do cambio( manual)?|cambio manual|\bcambio\b/g, 'cambio_manual'],
  [/filtro de oleo|filtro do oleo/g, 'filtro_oleo'],
  [/filtro de combustivel|filtro do combustivel/g, 'filtro_combustivel'],
  [/filtro de cabine|filtro do ar[- ]condicionado|filtro de ar[- ]condicionado|filtro antipolen|\bcabine\b/g, 'filtro_cabine'],
  [/higieniza\w*|limpeza do ar[- ]condicionado/g, 'higienizacao'],
  [/filtro de ar( do motor)?|filtro do ar( do motor)?/g, 'filtro_ar'],
  [/fluido de freio|oleo de freio/g, 'fluido_freio'],
  [/discos? de freio|\bdiscos?\b/g, 'discos'],
  [/pastilhas?( de freio)?|\bfreios?\b/g, 'pastilhas'],
  [/troca de oleo|\boleo\b/g, 'troca_oleo'],
  [/alinhamento|balanceamento/g, 'alinhamento'],
  [/rodizio/g, 'rodizio'],
  [/\bpneus?\b/g, 'pneus'],
  [/bateria/g, 'bateria'],
  [/\bvelas?\b/g, 'velas'],
  [/correia dentada|kit de correia/g, 'correia_dentada'],
  [/correia/g, 'correia_acessorios'],
  [/arrefecimento|radiador|aditivo/g, 'arrefecimento'],
  [/amortecedor\w*|suspensao/g, 'amortecedores'],
  [/palhetas?|limpador/g, 'palhetas'],
  [/\bgnv\b/g, 'gnv'],
  [/revisao/g, 'revisao']
];

/**
 * Os serviços que o texto do agendamento pede ("Troca de óleo e filtro de ar" vira troca de óleo e
 * filtro de ar), na ordem em que aparecem. Também aceita os ids (troca_oleo).
 */
export function servicosDoTexto(texto: string): ServicoId[] {
  let t = ` ${semAcento(texto ?? '')} `;
  const achados: { servico: ServicoId; pos: number }[] = [];
  for (const id of t.match(/[a-z_]+/g) ?? []) if (id.includes('_') && servicoExiste(id) && !achados.some((x) => x.servico === id)) achados.push({ servico: id, pos: t.indexOf(id) });
  for (const [re, servico] of REGRAS) {
    t = t.replace(re, (m, ...resto) => {
      const pos = resto.find((x) => typeof x === 'number') as number;
      if (!achados.some((x) => x.servico === servico)) achados.push({ servico, pos });
      return ' '.repeat(m.length);
    });
  }
  return achados.sort((a, b) => a.pos - b.pos).map((x) => x.servico);
}

// ---------------------------------------------------------------- a ordem de serviço do carro que chegou

/** Onde abrir a ordem de serviço quando o carro chega: o passo a passo já com o carro e os serviços. */
export function linkDaOrdem(a: Pick<Agendamento, 'servico'>, veiculoId: Id | null): string {
  const p = new URLSearchParams({ tipo: 'ordem' });
  if (veiculoId) p.set('carro', veiculoId);
  const servicos = servicosDoTexto(a.servico);
  if (servicos.length) p.set('servicos', servicos.join(','));
  return `/oficina/nova?${p.toString()}`;
}

/** Até quantos dias depois do dia marcado a ordem do carro ainda conta como a do agendamento. */
const DIAS_PARA_LIGAR = 3;

/**
 * A ordem de serviço do carro que chegou: a que aponta para o agendamento ou, senão, a primeira
 * ordem do mesmo carro feita do dia marcado até 3 dias depois que ainda não está ligada a outro
 * agendamento (o passo a passo abre a ordem sem saber da agenda).
 */
export function ordemDoAgendamento(
  a: Pick<Agendamento, 'id' | 'data' | 'veiculoId' | 'placa' | 'documentoId'>,
  documentos: Documento[],
  veiculos: Record<Id, Veiculo>,
  ligadas: Set<Id> = new Set()
): Documento | null {
  const ordens = documentos.filter((d) => d.tipo === 'ordem' && d.situacao !== 'cancelada');
  if (a.documentoId) return ordens.find((d) => d.id === a.documentoId) ?? null;
  const propria = ordens.find((d) => d.agendamentoId === a.id);
  if (propria) return propria;
  const veiculo = veiculoDoAgendamento(a, veiculos);
  if (!veiculo) return null;
  const ate = somarDias(a.data, DIAS_PARA_LIGAR);
  return (
    ordens
      .filter((d) => d.veiculoId === veiculo.id && !ligadas.has(d.id) && !d.agendamentoId && d.data >= a.data && d.data <= ate && dataLocal(d.criadoEm) >= a.data)
      .sort((x, y) => (x.criadoEm < y.criadoEm ? -1 : 1))[0] ?? null
  );
}

// ---------------------------------------------------------------- mensagens

export interface ContextoMensagem {
  /** Nome do cliente (só o primeiro nome entra). */
  cliente: string;
  oficina: Pick<Oficina, 'nome' | 'endereco' | 'cidade' | 'uf'>;
  data: string;
  hora: string;
  servico?: string;
  /** 'Onix' ou a placa. */
  carro?: string;
  /** Hoje, para dizer "amanhã" e "hoje". */
  hoje?: string;
}

/** 'Rua A, 10, Centro, Rio de Janeiro/RJ' (sem repetir a cidade que já está no endereço). */
export function enderecoDaOficina(o: Pick<Oficina, 'endereco' | 'cidade' | 'uf'>): string {
  const endereco = (o.endereco ?? '').trim();
  const cidade = [(o.cidade ?? '').trim(), (o.uf ?? '').trim()].filter(Boolean).join('/');
  if (!endereco) return cidade;
  if (!cidade || semAcento(endereco).includes(semAcento((o.cidade ?? '').trim()))) return endereco;
  return `${endereco}, ${cidade}`;
}

/** 'amanhã, sexta, 16/10, às 8h30' ou 'sexta, 16/10, às 8h30'. */
export function quandoPorExtenso(data: string, h: string, hoje?: string): string {
  const dias = hoje ? diasEntre(hoje, data) : null;
  const dia = diaCurto(data);
  const prefixo = dias === 0 ? 'hoje, ' : dias === 1 ? 'amanhã, ' : '';
  return `${prefixo}${dia}, às ${horaCurta(h)}`;
}

function oi(cliente: string): string {
  const nome = primeiroNome(cliente);
  return nome ? `Oi, ${nome}!` : 'Oi!';
}

function oQue(ctx: ContextoMensagem): string {
  const servico = (ctx.servico ?? '').trim();
  const carro = (ctx.carro ?? '').trim();
  if (servico && carro) return ` (${servico.toLowerCase()} do ${carro})`;
  if (servico) return ` (${servico.toLowerCase()})`;
  if (carro) return ` (${carro})`;
  return '';
}

function limpar(t: string): string {
  return t.replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** Confirmação do horário marcado (ou do pedido pelo link que a oficina aceitou). */
export function mensagemConfirmacao(ctx: ContextoMensagem): string {
  const oficina = ctx.oficina.nome.trim() || 'oficina';
  const endereco = enderecoDaOficina(ctx.oficina);
  return limpar(
    `${oi(ctx.cliente)} Aqui é da ${oficina}. Seu horário está marcado para ${quandoPorExtenso(ctx.data, ctx.hora, ctx.hoje)}${oQue(ctx)}.${endereco ? ` Endereço: ${endereco}.` : ''} Se precisar mudar, é só responder esta mensagem.`
  );
}

/** Lembrete da véspera. */
export function mensagemLembrete(ctx: ContextoMensagem): string {
  const oficina = ctx.oficina.nome.trim() || 'oficina';
  const endereco = enderecoDaOficina(ctx.oficina);
  return limpar(
    `${oi(ctx.cliente)} Passando para lembrar do seu horário ${quandoPorExtenso(ctx.data, ctx.hora, ctx.hoje)} na ${oficina}${oQue(ctx)}.${endereco ? ` Endereço: ${endereco}.` : ''} Pode confirmar? Se não puder vir, é só avisar por aqui.`
  );
}

/** A oficina não pode atender o pedido feito pelo link: o motivo e, se houver, o link para escolher outro horário. */
export function mensagemRecusa(ctx: ContextoMensagem & { motivo?: string; link?: string | null }): string {
  const oficina = ctx.oficina.nome.trim() || 'oficina';
  const motivo = (ctx.motivo ?? '').trim();
  const outro = ctx.link ? ` Se quiser, escolha outro horário aqui: ${ctx.link}` : ' Podemos ver outro horário?';
  return limpar(
    `${oi(ctx.cliente)} Aqui é da ${oficina}. Não vamos conseguir atender no horário que você pediu, ${quandoPorExtenso(ctx.data, ctx.hora, ctx.hoje)}.${motivo ? ` ${motivo.replace(/[.!]*$/, '.')}` : ''}${outro}`
  );
}

/** O texto da placa para mostrar (vazio quando não tem). */
export function placaParaMostrar(placa: string | null | undefined): string {
  const p = normalizarPlaca(placa ?? '');
  return p.length === 7 ? formatarPlaca(p) : '';
}

/** O telefone vale para o WhatsApp. */
export function temWhatsApp(telefone: string | null | undefined): boolean {
  return !!normalizarTelefone(telefone ?? '');
}

/** "16/10 às 8h30". */
export function diaEHora(data: string, h: string): string {
  return `${formatarDataCurta(data)} às ${horaCurta(h)}`;
}
