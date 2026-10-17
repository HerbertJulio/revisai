'use client';

// Estado da oficina, guardado no próprio aparelho (IndexedDB, com localStorage de reserva).
// Com a conta, este estado é a cópia local da oficina: cada mudança fica marcada como pendente
// até subir para o banco (components/oficina/sincronia), e o que os outros aparelhos mudaram
// chega por lá. Sem conta, os dados ficam só aqui, como antes.

import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { ehExemplo, gerarExemplo } from './exemplo';
import { hojeISO } from './datas';
import { ordemDoOrcamento, proximoNumero, totais } from './documentos';
import { aplicarMovimento, baixasDoDocumento } from './estoque';
import { normalizarPlaca } from './formatos';
import { OFICINA_VAZIA, PREFERENCIAS_PADRAO } from './padroes';
import type { OrdemServico } from './agente/ordem';
import { contarMontagem, juntarPlanos, PLANO_INICIAL, type EstadoPlano } from './plano';
import { ATE_TUDO, baseDoItem, iguais, mudancas, recalcularItem, todasAsChaves, valorAtual, type Chave, type ItemComBase } from './sincronia-dados';
import type { ProdutoProprio } from './referencias';
import type {
  Atendimento,
  Cliente,
  Contato,
  Documento,
  Id,
  ItemCarrinho,
  ItemEstoque,
  ItemServico,
  Leitura,
  MovimentoEstoque,
  Oficina,
  PedidoEnviado,
  Preferencias,
  ResultadoContato,
  ServicoId,
  TipoDocumento,
  Veiculo
} from './tipos';

export const CHAVE_DADOS = 'revisai:oficina';
export const VERSAO_DADOS = 1;

export interface DadosGuardados {
  configurado: boolean;
  exemplo: boolean;
  oficina: Oficina;
  preferencias: Preferencias;
  clientes: Record<Id, Cliente>;
  veiculos: Record<Id, Veiculo>;
  atendimentos: Record<Id, Atendimento>;
  leituras: Record<Id, Leitura>;
  contatos: Record<Id, Contato>;
  carrinho: ItemCarrinho[];
  pedidos: PedidoEnviado[];
  /** Produtos que a oficina cadastrou, com o prazo que ela usa. */
  produtosProprios: Record<Id, ProdutoProprio>;
  /** Número aleatório deste aparelho (não identifica a oficina; serve para a demanda, os rascunhos, os alertas e o acompanhamento dos pedidos). */
  aparelhoId: string | null;
  /** Quando este aparelho mandou o primeiro alerta de preço (para saber se vale buscar as respostas). */
  alertasDesde: string | null;
  demandaEnviadaEm: string | null;
  /** Ordens de serviço montadas por voz e conferidas pelo mecânico. */
  ordens: Record<Id, OrdemServico>;
  /** Teste e assinatura do Pro neste aparelho. */
  plano: EstadoPlano;
  /** O que a oficina tem guardado. */
  estoque: Record<Id, ItemEstoque>;
  /** Entradas, saídas e contagens do estoque (as mais novas primeiro ao mostrar). */
  movimentos: Record<Id, MovimentoEstoque>;
  /** Orçamentos e ordens de serviço. */
  documentos: Record<Id, Documento>;
  /** O último número usado de cada tipo. */
  contadores: Partial<Record<TipoDocumento, number>>;
  resumoMostradoEm: string | null;
  ultimoBackup: string | null;
  /** Quando esta cópia foi gravada (a mais nova vence entre IndexedDB e localStorage). */
  salvoEm?: number;
  /** A oficina da conta de quem estes dados são (null: só deste aparelho, sem conta). */
  contaOficinaId: string | null;
  /** Até onde o aparelho já buscou (marca do banco) e o que mudou aqui e ainda não subiu. */
  sinc: EstadoSincronia;
}

export interface EstadoSincronia {
  marca: number | null;
  pendentes: Record<Chave, true>;
  ultimaEm: string | null;
  /** Itens que o banco recusou (grandes demais, por exemplo): não ficam travando o resto. */
  rejeitados: Record<Chave, string>;
}

export const SINC_INICIAL: EstadoSincronia = { marca: null, pendentes: {}, ultimaEm: null, rejeitados: {} };

export interface AlvoContato {
  veiculoId: Id;
  servico: ServicoId;
  atendimentoId: Id;
}

interface Acoes {
  configurar(oficina: Partial<Oficina>, comExemplo: boolean): void;
  salvarOficina(o: Partial<Oficina>): void;
  salvarPreferencias(p: Partial<Preferencias>): void;
  salvarCliente(c: Omit<Cliente, 'id' | 'criadoEm'> & { id?: Id }): Id;
  removerCliente(id: Id): void;
  salvarVeiculo(v: Omit<Veiculo, 'id' | 'criadoEm'> & { id?: Id }): Id;
  removerVeiculo(id: Id): void;
  registrarAtendimento(a: Omit<Atendimento, 'id' | 'criadoEm'> & { id?: Id }): Id;
  removerAtendimento(id: Id): void;
  anotarKm(veiculoId: Id, data: string, km: number): void;
  removerLeitura(id: Id): void;
  registrarContato(alvos: AlvoContato[], resultado: ResultadoContato, extra?: { data?: string; observacao?: string }): Id[];
  desfazerContatos(ids: Id[]): void;
  adicionarAoCarrinho(produtoId: number, quantidade: number): void;
  definirQuantidade(produtoId: number, quantidade: number): void;
  limparCarrinho(): void;
  /** Guarda o pedido enviado; o do carrinho esvazia o carrinho (o do alerta de preço, não). */
  registrarPedido(p: PedidoEnviado, opcoes?: { manterCarrinho?: boolean }): void;
  salvarProdutoProprio(p: Omit<ProdutoProprio, 'id' | 'criadoEm'> & { id?: Id }): Id;
  removerProdutoProprio(id: Id): void;
  garantirAparelhoId(): string;
  marcarAlerta(): void;
  salvarOrdem(o: Omit<OrdemServico, 'id' | 'criadoEm'> & { id?: Id }): Id;
  removerOrdem(id: Id): void;
  comecarTeste(hoje: string): void;
  ativarPro(ate: string, codigo: string): void;
  contarMontagem(hoje: string): void;
  salvarItemEstoque(i: Omit<ItemEstoque, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: Id }): Id;
  removerItemEstoque(id: Id): void;
  /** Registra uma entrada, saída ou ajuste e atualiza a quantidade do item. */
  moverEstoque(m: Omit<MovimentoEstoque, 'id' | 'quando'> & { quando?: string }): Id | null;
  /** Dá entrada no estoque do que chegou de um pedido da loja. */
  receberPedido(codigo: string, entradas: { itemId: Id; quantidade: number; custoUnitario: number | null; fornecedor?: string }[]): void;
  salvarDocumento(d: Omit<Documento, 'id' | 'numero' | 'criadoEm' | 'atualizadoEm'> & { id?: Id; numero?: number }): Id;
  removerDocumento(id: Id): void;
  marcarEnviado(id: Id): void;
  /** O cliente aprovou: o orçamento vira ordem aberta (sem as linhas recusadas). Devolve o id da ordem. */
  aprovarOrcamento(id: Id, recusadas?: Id[]): Id | null;
  recusarOrcamento(id: Id): void;
  /** A ordem ficou pronta: registra o serviço (os avisos saem dele) e tira as peças do estoque. */
  concluirOrdem(id: Id, ctx: { itens: ItemServico[]; km: number; data: string }): Id | null;
  cancelarOrdem(id: Id): void;
  marcarDemandaEnviada(): void;
  marcarResumo(data: string): void;
  marcarBackup(): void;
  importar(dados: Partial<DadosGuardados>): void;
  carregarExemplo(): void;
  removerExemplo(): void;
  apagarTudo(): void;
  /** Liga os dados deste aparelho à oficina da conta (levando o que já tem, ou começando limpo). */
  vincularConta(oficinaId: string, levarDados: boolean): void;
  /** Tira os dados da conta do aparelho (ao sair ou trocar de oficina). */
  esquecerConta(): void;
  /** Os itens subiram: tira dos pendentes os que não mudaram de novo enquanto subiam. */
  marcarEnviados(enviados: { chave: Chave; valor: unknown }[]): void;
  /** Aplica o que veio do banco (sem marcar como mudança local) e guarda a marca. */
  aplicarDoBanco(parte: Partial<DadosGuardados>, marca: number | null): void;
  /** O banco recusou estes itens: saem dos pendentes e ficam anotados com o motivo. */
  rejeitarItens(itens: { chave: Chave; motivo: string }[]): void;
}

export type EstadoOficina = DadosGuardados & Acoes;

const VAZIO: DadosGuardados = {
  configurado: false,
  exemplo: false,
  oficina: OFICINA_VAZIA,
  preferencias: PREFERENCIAS_PADRAO,
  clientes: {},
  veiculos: {},
  atendimentos: {},
  leituras: {},
  contatos: {},
  carrinho: [],
  pedidos: [],
  produtosProprios: {},
  aparelhoId: null,
  alertasDesde: null,
  demandaEnviadaEm: null,
  ordens: {},
  plano: PLANO_INICIAL,
  estoque: {},
  movimentos: {},
  documentos: {},
  contadores: {},
  resumoMostradoEm: null,
  ultimoBackup: null,
  contaOficinaId: null,
  sinc: SINC_INICIAL
};

/** O que é do aparelho e não da oficina: fica ao trocar de conta. */
function doAparelho(s: DadosGuardados): Partial<DadosGuardados> {
  return { aparelhoId: s.aparelhoId, preferencias: { ...PREFERENCIAS_PADRAO, tema: s.preferencias.tema } };
}

function novoId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** UUID v4 também nos navegadores sem crypto.randomUUID (o servidor só aceita esse formato). */
function novoUuid(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let ultimoInstante = 0;

/**
 * O instante de agora, sempre depois do anterior neste aparelho. Os movimentos do estoque são
 * somados em ordem de tempo (com o piso no zero): dois no mesmo milissegundo ficariam na ordem
 * do id (sorteado), e uma saída grande podia ser contada antes da entrada feita logo antes dela.
 */
function instante(): string {
  ultimoInstante = Math.max(Date.now(), ultimoInstante + 1);
  return new Date(ultimoInstante).toISOString();
}

function semChaves<T>(registro: Record<Id, T>, remover: (item: T, id: Id) => boolean): Record<Id, T> {
  const r: Record<Id, T> = {};
  for (const [id, item] of Object.entries(registro)) if (!remover(item, id)) r[id] = item;
  return r;
}

/**
 * IndexedDB; se o navegador bloquear, localStorage; se nada funcionar, só na memória.
 * Na leitura, a cópia gravada por último vence. Se o IndexedDB falhar ao ler, ele não é
 * sobrescrito nesta sessão (para não apagar os dados de verdade com uma tela vazia).
 */
const memoria = new Map<string, string>();
let leituraFalhou = false;
const noNavegador = typeof window !== 'undefined';
const canal = noNavegador && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('revisai') : null;

export function armazenamentoComProblema(): boolean {
  return leituraFalhou;
}

function gravadoEm(valor: string | null): number {
  try {
    return Number(JSON.parse(valor ?? '')?.state?.salvoEm) || 0;
  } catch {
    return 0;
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const armazenamento: StateStorage = {
  async getItem(nome) {
    let doIdb: string | null = null;
    let erro = false;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        doIdb = (await idbGet<string>(nome)) ?? null;
        erro = false;
        break;
      } catch {
        erro = true;
        await espera(200 * (tentativa + 1));
      }
    }
    if (erro) leituraFalhou = true;
    let doLocal: string | null = null;
    try {
      doLocal = localStorage.getItem(nome);
    } catch {}
    const copias = [doIdb, doLocal, memoria.get(nome) ?? null].filter((v): v is string => !!v);
    if (!copias.length) return null;
    return copias.sort((a, b) => gravadoEm(b) - gravadoEm(a))[0];
  },
  async setItem(nome, valor) {
    let salvo = false;
    if (!leituraFalhou) {
      try {
        await idbSet(nome, valor);
        salvo = true;
        try {
          localStorage.removeItem(nome);
        } catch {}
      } catch {}
    }
    if (!salvo) {
      try {
        localStorage.setItem(nome, valor);
        salvo = true;
      } catch {}
    }
    if (!salvo) memoria.set(nome, valor);
    canal?.postMessage({ tipo: 'salvo' });
  },
  async removeItem(nome) {
    try {
      await idbDel(nome);
    } catch {}
    try {
      localStorage.removeItem(nome);
    } catch {}
    memoria.delete(nome);
  }
};

export const useOficina = create<EstadoOficina>()(
  persist(
    (set, get) => ({
      ...VAZIO,

      configurar(oficina, comExemplo) {
        const base = { ...get().oficina, ...oficina };
        if (comExemplo) {
          const ex = gerarExemplo(hojeISO());
          set({ configurado: true, exemplo: true, oficina: base, ...mesclar(get(), ex) });
        } else set({ configurado: true, oficina: base });
      },

      salvarOficina(o) {
        set({ oficina: { ...get().oficina, ...o } });
      },

      salvarPreferencias(p) {
        set({ preferencias: { ...get().preferencias, ...p } });
      },

      salvarCliente(c) {
        const id = c.id ?? novoId();
        const anterior = get().clientes[id];
        set({ clientes: { ...get().clientes, [id]: { ...anterior, ...c, id, nome: c.nome.trim(), criadoEm: anterior?.criadoEm ?? new Date().toISOString() } } });
        return id;
      },

      removerCliente(id) {
        const carros = new Set(Object.values(get().veiculos).filter((v) => v.clienteId === id).map((v) => v.id));
        set({
          clientes: semChaves(get().clientes, (_c, cid) => cid === id),
          veiculos: semChaves(get().veiculos, (v) => carros.has(v.id)),
          atendimentos: semChaves(get().atendimentos, (a) => carros.has(a.veiculoId)),
          leituras: semChaves(get().leituras, (l) => carros.has(l.veiculoId)),
          contatos: semChaves(get().contatos, (k) => carros.has(k.veiculoId)),
          ordens: semChaves(get().ordens, (o) => o.veiculoId != null && carros.has(o.veiculoId)),
          documentos: semChaves(get().documentos, (d) => d.veiculoId != null && carros.has(d.veiculoId))
        });
      },

      salvarVeiculo(v) {
        const id = v.id ?? novoId();
        const anterior = get().veiculos[id];
        set({
          veiculos: {
            ...get().veiculos,
            [id]: { ...anterior, ...v, id, placa: normalizarPlaca(v.placa), criadoEm: anterior?.criadoEm ?? new Date().toISOString() }
          }
        });
        return id;
      },

      removerVeiculo(id) {
        set({
          veiculos: semChaves(get().veiculos, (_v, vid) => vid === id),
          atendimentos: semChaves(get().atendimentos, (a) => a.veiculoId === id),
          leituras: semChaves(get().leituras, (l) => l.veiculoId === id),
          contatos: semChaves(get().contatos, (k) => k.veiculoId === id),
          ordens: semChaves(get().ordens, (o) => o.veiculoId === id),
          documentos: semChaves(get().documentos, (d) => d.veiculoId === id)
        });
      },

      registrarAtendimento(a) {
        const id = a.id ?? novoId();
        const anterior = get().atendimentos[id];
        set({ atendimentos: { ...get().atendimentos, [id]: { ...a, id, criadoEm: anterior?.criadoEm ?? new Date().toISOString() } } });
        return id;
      },

      removerAtendimento(id) {
        set({
          atendimentos: semChaves(get().atendimentos, (_a, aid) => aid === id),
          contatos: semChaves(get().contatos, (k) => k.atendimentoId === id)
        });
      },

      anotarKm(veiculoId, data, km) {
        const id = novoId();
        set({ leituras: { ...get().leituras, [id]: { id, veiculoId, data, km } } });
      },

      removerLeitura(id) {
        set({ leituras: semChaves(get().leituras, (_l, lid) => lid === id) });
      },

      registrarContato(alvos, resultado, extra) {
        const quando = new Date().toISOString();
        const novos: Record<Id, Contato> = {};
        for (const alvo of alvos) {
          const id = novoId();
          novos[id] = { id, ...alvo, quando, resultado, data: extra?.data, observacao: extra?.observacao };
        }
        set({ contatos: { ...get().contatos, ...novos } });
        return Object.keys(novos);
      },

      desfazerContatos(ids) {
        const remover = new Set(ids);
        set({ contatos: semChaves(get().contatos, (_k, id) => remover.has(id)) });
      },

      adicionarAoCarrinho(produtoId, quantidade) {
        const carrinho = [...get().carrinho];
        const i = carrinho.findIndex((c) => c.produtoId === produtoId);
        if (i >= 0) carrinho[i] = { produtoId, quantidade: Math.min(999, carrinho[i].quantidade + quantidade) };
        else carrinho.push({ produtoId, quantidade: Math.min(999, quantidade) });
        set({ carrinho });
      },

      definirQuantidade(produtoId, quantidade) {
        const q = Math.max(0, Math.min(999, Math.round(quantidade)));
        set({
          carrinho: q === 0 ? get().carrinho.filter((c) => c.produtoId !== produtoId) : get().carrinho.map((c) => (c.produtoId === produtoId ? { ...c, quantidade: q } : c))
        });
      },

      limparCarrinho() {
        set({ carrinho: [] });
      },

      registrarPedido(p, opcoes) {
        set({ pedidos: [p, ...get().pedidos.filter((x) => x.codigo !== p.codigo)].slice(0, 50), ...(opcoes?.manterCarrinho ? {} : { carrinho: [] }) });
      },

      salvarProdutoProprio(p) {
        const id = p.id ?? novoId();
        const anterior = get().produtosProprios[id];
        set({
          produtosProprios: {
            ...get().produtosProprios,
            [id]: { ...p, id, marca: p.marca.trim(), nome: p.nome.trim(), criadoEm: anterior?.criadoEm ?? new Date().toISOString() }
          }
        });
        return id;
      },

      removerProdutoProprio(id) {
        set({ produtosProprios: semChaves(get().produtosProprios, (_p, pid) => pid === id) });
      },

      garantirAparelhoId() {
        const atual = get().aparelhoId;
        if (atual && UUID.test(atual)) return atual;
        const id = novoUuid();
        set({ aparelhoId: id });
        return id;
      },

      marcarAlerta() {
        if (!get().alertasDesde) set({ alertasDesde: new Date().toISOString() });
      },

      salvarOrdem(o) {
        const id = o.id ?? novoId();
        const anterior = get().ordens[id];
        set({ ordens: { ...get().ordens, [id]: { ...o, id, criadoEm: anterior?.criadoEm ?? new Date().toISOString() } } });
        return id;
      },

      removerOrdem(id) {
        set({ ordens: semChaves(get().ordens, (_o, oid) => oid === id) });
      },

      comecarTeste(hoje) {
        if (get().plano.testeDesde) return;
        set({ plano: { ...get().plano, testeDesde: hoje } });
      },

      ativarPro(ate, codigo) {
        set({ plano: { ...get().plano, proAte: ate, codigo } });
      },

      contarMontagem(hoje) {
        set({ plano: contarMontagem(get().plano, hoje) });
      },

      salvarItemEstoque(i) {
        const id = i.id ?? novoId();
        const anterior = get().estoque[id] as ItemComBase | undefined;
        const agora = instante();
        // a quantidade e o custo de um item que já existe só mudam por movimento (entrada, saída,
        // contagem): assim a soma dos aparelhos fecha e uma tela antiga não apaga o que chegou
        const quantidade = anterior ? anterior.quantidade : Math.max(0, i.quantidade);
        const custo = anterior ? anterior.custo : i.custo;
        const base = anterior ? anterior.base : { quantidade, custo, em: agora, ate: '' };
        const item: ItemComBase = {
          ...anterior,
          ...i,
          id,
          nome: i.nome.trim(),
          marca: i.marca?.trim() || undefined,
          quantidade,
          custo,
          minimo: Math.max(0, i.minimo),
          criadoEm: anterior?.criadoEm ?? agora,
          atualizadoEm: agora,
          ...(base ? { base } : {})
        };
        set({ estoque: { ...get().estoque, [id]: item } });
        return id;
      },

      removerItemEstoque(id) {
        set({ estoque: semChaves(get().estoque, (_i, iid) => iid === id), movimentos: semChaves(get().movimentos, (m) => m.itemId === id) });
      },

      moverEstoque(m) {
        const item = get().estoque[m.itemId];
        if (!item || !Number.isFinite(m.quantidade)) return null;
        const id = novoId();
        const mov: MovimentoEstoque = { ...m, id, quando: m.quando ?? instante() };
        const movimentos = { ...get().movimentos, [id]: mov };
        set({ estoque: { ...get().estoque, [item.id]: comMovimento(item, mov, movimentos) }, movimentos });
        return id;
      },

      receberPedido(codigo, entradas) {
        const quando = instante();
        const estoque = { ...get().estoque };
        const movimentos = { ...get().movimentos };
        for (const [i, e] of entradas.entries()) {
          const item = estoque[e.itemId];
          if (!item || !(e.quantidade > 0)) continue;
          const id = novoId();
          const mov: MovimentoEstoque = {
            id,
            itemId: item.id,
            quando: i === 0 ? quando : instante(),
            tipo: 'entrada',
            quantidade: e.quantidade,
            custoUnitario: e.custoUnitario,
            fornecedor: e.fornecedor,
            origem: { tipo: 'pedido', id: codigo, rotulo: `Pedido ${codigo}` }
          };
          movimentos[id] = mov;
          estoque[item.id] = comMovimento(item, mov, movimentos);
        }
        set({ estoque, movimentos, pedidos: get().pedidos.map((p) => (p.codigo === codigo ? { ...p, recebidoEm: quando } : p)) });
      },

      salvarDocumento(d) {
        const id = d.id ?? novoId();
        const s = get();
        const anterior = s.documentos[id];
        const agora = new Date().toISOString();
        const numero = anterior?.numero ?? d.numero ?? proximoNumero(s.contadores, Object.values(s.documentos), d.tipo);
        const contadores = { ...s.contadores, [d.tipo]: Math.max(s.contadores[d.tipo] ?? 0, numero) };
        set({ documentos: { ...s.documentos, [id]: { ...anterior, ...d, id, numero, criadoEm: anterior?.criadoEm ?? agora, atualizadoEm: agora } }, contadores });
        return id;
      },

      removerDocumento(id) {
        set({
          documentos: Object.fromEntries(
            Object.entries(get().documentos)
              .filter(([did]) => did !== id)
              .map(([did, d]) => [did, d.ordemId === id ? { ...d, ordemId: undefined } : d.orcamentoId === id ? { ...d, orcamentoId: undefined } : d])
          )
        });
      },

      marcarEnviado(id) {
        const d = get().documentos[id];
        if (!d) return;
        const agora = new Date().toISOString();
        const situacao = d.tipo === 'orcamento' && d.situacao === 'rascunho' ? 'enviado' : d.situacao;
        set({ documentos: { ...get().documentos, [id]: { ...d, situacao, enviadoEm: d.enviadoEm ?? agora, atualizadoEm: agora } } });
      },

      aprovarOrcamento(id, recusadas = []) {
        const s = get();
        const orc = s.documentos[id];
        if (!orc || orc.tipo !== 'orcamento') return null;
        if (orc.ordemId && s.documentos[orc.ordemId]) return orc.ordemId;
        const fora = new Set(recusadas);
        const aprovado: Documento = { ...orc, linhas: orc.linhas.map((l) => ({ ...l, recusada: fora.has(l.id) })) };
        if (!aprovado.linhas.some((l) => !l.recusada)) return null;
        const agora = new Date().toISOString();
        const ordemId = novoId();
        const numero = proximoNumero(s.contadores, Object.values(s.documentos), 'ordem');
        const ordem = ordemDoOrcamento(aprovado, { id: ordemId, numero, agora, hoje: hojeISO(), novoId });
        set({
          documentos: { ...s.documentos, [id]: { ...aprovado, situacao: 'aprovado', respondidoEm: agora, ordemId, atualizadoEm: agora }, [ordemId]: ordem },
          contadores: { ...s.contadores, ordem: numero }
        });
        return ordemId;
      },

      recusarOrcamento(id) {
        const d = get().documentos[id];
        if (!d || d.tipo !== 'orcamento') return;
        const agora = new Date().toISOString();
        set({ documentos: { ...get().documentos, [id]: { ...d, situacao: 'recusado', respondidoEm: agora, atualizadoEm: agora } } });
      },

      concluirOrdem(id, ctx) {
        const s = get();
        const d = s.documentos[id];
        if (!d || d.tipo !== 'ordem' || d.situacao === 'concluida' || !d.veiculoId || !s.veiculos[d.veiculoId]) return null;
        const agora = new Date().toISOString();
        const atendimentoId = novoId();
        const total = totais(d);
        const atendimentos = ctx.itens.length
          ? {
              ...s.atendimentos,
              [atendimentoId]: {
                id: atendimentoId,
                veiculoId: d.veiculoId,
                data: ctx.data,
                km: ctx.km,
                itens: ctx.itens,
                valor: total.total > 0 ? total.total : null,
                observacao: [d.diagnostico, d.observacao].filter(Boolean).join(' ').trim() || undefined,
                criadoEm: agora
              }
            }
          : s.atendimentos;
        const estoque = { ...s.estoque };
        const movimentos = { ...s.movimentos };
        for (const [itemId, quantidade] of baixasDoDocumento(d)) {
          const item = estoque[itemId];
          if (!item) continue;
          const mid = novoId();
          const mov: MovimentoEstoque = { id: mid, itemId, quando: instante(), tipo: 'saida', quantidade: -quantidade, origem: { tipo: 'ordem', id, rotulo: `OS nº ${d.numero}` } };
          movimentos[mid] = mov;
          estoque[itemId] = comMovimento(item, mov, movimentos);
        }
        set({
          atendimentos,
          estoque,
          movimentos,
          documentos: {
            ...s.documentos,
            [id]: { ...d, situacao: 'concluida', concluidoEm: agora, km: d.km ?? ctx.km, atendimentoId: ctx.itens.length ? atendimentoId : undefined, atualizadoEm: agora }
          }
        });
        return ctx.itens.length ? atendimentoId : null;
      },

      cancelarOrdem(id) {
        const d = get().documentos[id];
        if (!d || d.tipo !== 'ordem' || d.situacao === 'concluida') return;
        set({ documentos: { ...get().documentos, [id]: { ...d, situacao: 'cancelada', atualizadoEm: new Date().toISOString() } } });
      },

      marcarDemandaEnviada() {
        set({ demandaEnviadaEm: new Date().toISOString() });
      },

      marcarResumo(data) {
        set({ resumoMostradoEm: data });
      },

      marcarBackup() {
        set({ ultimoBackup: new Date().toISOString() });
      },

      importar(dados) {
        set({
          ...VAZIO,
          ...dados,
          configurado: true,
          oficina: { ...OFICINA_VAZIA, ...dados.oficina },
          preferencias: { ...PREFERENCIAS_PADRAO, ...dados.preferencias },
          plano: juntarPlanos(get().plano, dados.plano),
          aparelhoId: get().aparelhoId ?? dados.aparelhoId ?? null,
          // os alertas são deste aparelho, não do backup
          alertasDesde: get().alertasDesde,
          carrinho: get().carrinho,
          // a conta continua a mesma: o que veio do backup sobe para ela
          contaOficinaId: get().contaOficinaId,
          sinc: get().sinc,
          estoque: dados.estoque ?? {},
          movimentos: dados.movimentos ?? {},
          documentos: dados.documentos ?? {},
          contadores: dados.contadores ?? {}
        });
      },

      carregarExemplo() {
        const ex = gerarExemplo(hojeISO());
        set({ exemplo: true, ...mesclar(get(), ex) });
      },

      removerExemplo() {
        const s = get();
        set({
          exemplo: false,
          clientes: semChaves(s.clientes, (_c, id) => ehExemplo(id)),
          veiculos: semChaves(s.veiculos, (_v, id) => ehExemplo(id)),
          atendimentos: semChaves(s.atendimentos, (a, id) => ehExemplo(id) || ehExemplo(a.veiculoId)),
          leituras: semChaves(s.leituras, (l, id) => ehExemplo(id) || ehExemplo(l.veiculoId)),
          contatos: semChaves(s.contatos, (k, id) => ehExemplo(id) || ehExemplo(k.veiculoId)),
          estoque: semChaves(s.estoque, (_i, id) => ehExemplo(id)),
          movimentos: semChaves(s.movimentos, (m, id) => ehExemplo(id) || ehExemplo(m.itemId)),
          documentos: semChaves(s.documentos, (d, id) => ehExemplo(id) || (d.veiculoId != null && ehExemplo(d.veiculoId))),
          // os números voltam para o que a oficina usou de verdade
          contadores: contadoresDos(Object.values(semChaves(s.documentos, (d, id) => ehExemplo(id) || (d.veiculoId != null && ehExemplo(d.veiculoId)))))
        });
      },

      apagarTudo() {
        // o plano é da oficina, não dos dados: continua valendo depois de apagar
        set({ ...VAZIO, plano: get().plano, contaOficinaId: get().contaOficinaId, sinc: get().sinc, configurado: !!get().contaOficinaId, oficina: get().contaOficinaId ? get().oficina : OFICINA_VAZIA });
      },

      vincularConta(oficinaId, levarDados) {
        const s = get();
        if (levarDados) {
          const pendentes: Record<Chave, true> = {};
          for (const k of todasAsChaves(s)) pendentes[k] = true;
          semMarcar(() => set({ contaOficinaId: oficinaId, configurado: true, sinc: { ...SINC_INICIAL, pendentes } }));
        } else {
          semMarcar(() => set({ ...VAZIO, ...doAparelho(s), contaOficinaId: oficinaId, configurado: true, sinc: SINC_INICIAL }));
        }
      },

      esquecerConta() {
        semMarcar(() => set({ ...VAZIO, ...doAparelho(get()) }));
      },

      marcarEnviados(enviados) {
        const s = get();
        const pendentes = { ...s.sinc.pendentes };
        const rejeitados = { ...s.sinc.rejeitados };
        // compara pelo conteúdo: recarregar do aparelho (outra aba) troca os objetos sem mudar nada
        for (const e of enviados) {
          delete rejeitados[e.chave];
          if (iguais(valorAtual(s, e.chave), e.valor)) delete pendentes[e.chave];
        }
        semMarcar(() => set({ sinc: { ...s.sinc, pendentes, rejeitados, ultimaEm: new Date().toISOString() } }));
      },

      rejeitarItens(itens) {
        const s = get();
        const pendentes = { ...s.sinc.pendentes };
        const rejeitados = { ...s.sinc.rejeitados };
        for (const i of itens) {
          delete pendentes[i.chave];
          rejeitados[i.chave] = i.motivo.slice(0, 200);
        }
        semMarcar(() => set({ sinc: { ...s.sinc, pendentes, rejeitados } }));
      },

      aplicarDoBanco(parte, marca) {
        const s = get();
        semMarcar(() => set({ ...parte, configurado: true, sinc: { ...s.sinc, marca: marca ?? s.sinc.marca, ultimaEm: new Date().toISOString() } }));
      }
    }),
    {
      name: CHAVE_DADOS,
      version: VERSAO_DADOS,
      storage: createJSONStorage(() => armazenamento),
      partialize: (s): DadosGuardados => ({
        configurado: s.configurado,
        exemplo: s.exemplo,
        oficina: s.oficina,
        preferencias: s.preferencias,
        clientes: s.clientes,
        veiculos: s.veiculos,
        atendimentos: s.atendimentos,
        leituras: s.leituras,
        contatos: s.contatos,
        carrinho: s.carrinho,
        pedidos: s.pedidos,
        produtosProprios: s.produtosProprios,
        aparelhoId: s.aparelhoId,
        alertasDesde: s.alertasDesde,
        demandaEnviadaEm: s.demandaEnviadaEm,
        ordens: s.ordens,
        plano: s.plano,
        estoque: s.estoque,
        movimentos: s.movimentos,
        documentos: s.documentos,
        contadores: s.contadores,
        resumoMostradoEm: s.resumoMostradoEm,
        ultimoBackup: s.ultimoBackup,
        salvoEm: Date.now(),
        contaOficinaId: s.contaOficinaId,
        sinc: s.sinc
      }),
      merge: (guardado, atual) => {
        const g = (guardado ?? {}) as Partial<DadosGuardados>;
        return {
          ...atual,
          ...g,
          oficina: { ...OFICINA_VAZIA, ...g.oficina },
          preferencias: { ...PREFERENCIAS_PADRAO, ...g.preferencias },
          plano: { ...PLANO_INICIAL, ...g.plano },
          estoque: g.estoque ?? {},
          movimentos: g.movimentos ?? {},
          documentos: g.documentos ?? {},
          contadores: g.contadores ?? {},
          contaOficinaId: g.contaOficinaId ?? null,
          sinc: { ...SINC_INICIAL, ...g.sinc, pendentes: { ...(g.sinc?.pendentes ?? {}) }, rejeitados: { ...(g.sinc?.rejeitados ?? {}) } }
        };
      },
      onRehydrateStorage: () => () => {
        // terminou de ler o aparelho, com ou sem erro: o app não fica parado na tela de carregando
        marcarHidratado();
      }
    }
  )
);

/** O item depois do movimento: a base fica (ou nasce, nos itens antigos) e a quantidade sai da soma. */
function comMovimento(item: ItemEstoque, mov: MovimentoEstoque, movimentos: Record<Id, MovimentoEstoque>): ItemEstoque {
  const doItem = Object.values(movimentos).filter((m) => m.itemId === item.id);
  if ((item as ItemComBase).base) return recalcularItem(item as ItemComBase, doItem);
  // item de antes desta regra: a quantidade dele já inclui os movimentos até a última mudança
  if (mov.quando > item.atualizadoEm) return recalcularItem({ ...item, base: baseDoItem(item) }, doItem);
  // o relógio deste aparelho está atrás: soma este movimento e a base fica logo depois dele
  const depois = aplicarMovimento(item, mov);
  const em = item.atualizadoEm > mov.quando ? item.atualizadoEm : mov.quando;
  const comBase: ItemComBase = { ...depois, atualizadoEm: em, base: { quantidade: depois.quantidade, custo: depois.custo, em, ate: ATE_TUDO } };
  return comBase;
}

// ---------------------------------------------------------------- mudanças para subir

let semRegistrar = 0;
let recarregando = 0;

/** Muda o estado sem marcar como mudança local (o que veio do banco, a troca de conta). */
export function semMarcar<T>(fn: () => T): T {
  semRegistrar++;
  try {
    return fn();
  } finally {
    semRegistrar--;
  }
}

/**
 * Lê de novo o que está gravado no aparelho (outra aba gravou, o app voltou para a frente).
 * O que chega daí não é mudança local: são cópias do mesmo conteúdo, e marcar como pendente
 * faria subir dado velho por cima do que outro aparelho mudou.
 */
export async function recarregarDoAparelho(): Promise<void> {
  recarregando++;
  try {
    await useOficina.persist.rehydrate();
  } finally {
    recarregando--;
  }
}

/** Grava o estado no aparelho agora e espera terminar (antes de a página mudar, por exemplo). */
export async function gravarAgora(): Promise<void> {
  const o = useOficina.persist.getOptions();
  if (!o.storage || !o.name || !o.partialize) return;
  await o.storage.setItem(o.name, { state: o.partialize(useOficina.getState()) as EstadoOficina, version: o.version });
}

/** Cada mudança dos dados da oficina vira pendente até subir (só com a conta ligada). */
export function ligarRastreio(): () => void {
  return useOficina.subscribe((s, antes) => {
    if (semRegistrar > 0 || recarregando > 0 || !s.contaOficinaId || s.contaOficinaId !== antes.contaOficinaId) return;
    const chaves = mudancas(antes, s);
    if (!chaves.length) return;
    const pendentes = { ...s.sinc.pendentes };
    for (const k of chaves) pendentes[k] = true;
    semMarcar(() => useOficina.setState({ sinc: { ...s.sinc, pendentes } }));
  });
}

// ---------------------------------------------------------------- já leu o aparelho?

let hidratado = false;
const ouvintesDaHidratacao = new Set<() => void>();

function marcarHidratado() {
  if (hidratado) return;
  hidratado = true;
  for (const f of ouvintesDaHidratacao) f();
}

/** Leu o aparelho pelo menos uma vez (recarregar depois não volta para "carregando"). */
export function jaHidratou(): boolean {
  return hidratado || useOficina.persist.hasHydrated();
}

export function aoHidratar(f: () => void): () => void {
  ouvintesDaHidratacao.add(f);
  return () => {
    ouvintesDaHidratacao.delete(f);
  };
}

if (noNavegador) {
  ligarRastreio();
  // outra aba (ou o app instalado) gravou: recarrega para não sobrescrever com dados velhos
  canal?.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { tipo?: string })?.tipo === 'salvo') void recarregarDoAparelho();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void recarregarDoAparelho();
  });
}

function mesclar(atual: DadosGuardados, ex: ReturnType<typeof gerarExemplo>) {
  return {
    clientes: { ...atual.clientes, ...ex.clientes },
    veiculos: { ...atual.veiculos, ...ex.veiculos },
    atendimentos: { ...atual.atendimentos, ...ex.atendimentos },
    leituras: { ...atual.leituras, ...ex.leituras },
    contatos: { ...atual.contatos, ...ex.contatos },
    estoque: { ...atual.estoque, ...ex.estoque },
    documentos: { ...atual.documentos, ...ex.documentos },
    contadores: {
      orcamento: Math.max(atual.contadores.orcamento ?? 0, ...Object.values(ex.documentos).filter((d) => d.tipo === 'orcamento').map((d) => d.numero)),
      ordem: Math.max(atual.contadores.ordem ?? 0, ...Object.values(ex.documentos).filter((d) => d.tipo === 'ordem').map((d) => d.numero))
    }
  };
}

function contadoresDos(documentos: Documento[]): Partial<Record<TipoDocumento, number>> {
  const r: Partial<Record<TipoDocumento, number>> = {};
  for (const d of documentos) r[d.tipo] = Math.max(r[d.tipo] ?? 0, d.numero);
  return r;
}

/** Os dados como arquivo de backup. */
export function dadosParaBackup(s: DadosGuardados) {
  return {
    app: 'revisai',
    versao: VERSAO_DADOS,
    exportadoEm: new Date().toISOString(),
    oficina: s.oficina,
    preferencias: s.preferencias,
    clientes: s.clientes,
    veiculos: s.veiculos,
    atendimentos: s.atendimentos,
    leituras: s.leituras,
    contatos: s.contatos,
    pedidos: s.pedidos,
    produtosProprios: s.produtosProprios,
    ordens: s.ordens,
    plano: s.plano,
    estoque: s.estoque,
    movimentos: s.movimentos,
    documentos: s.documentos,
    contadores: s.contadores,
    exemplo: s.exemplo
  };
}

/** Pede ao navegador para não apagar os dados quando faltar espaço. */
export async function pedirArmazenamentoPersistente(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
