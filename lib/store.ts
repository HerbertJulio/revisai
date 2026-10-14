'use client';

// Estado da oficina, guardado no próprio aparelho (IndexedDB, com localStorage de reserva).
// Quando o login chegar, este é o conteúdo que sobe para a nuvem no primeiro acesso.

import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { ehExemplo, gerarExemplo } from './exemplo';
import { hojeISO } from './datas';
import { normalizarPlaca } from './formatos';
import { OFICINA_VAZIA, PREFERENCIAS_PADRAO } from './padroes';
import type { ProdutoProprio } from './referencias';
import type {
  Atendimento,
  Cliente,
  Contato,
  Id,
  ItemCarrinho,
  Leitura,
  Oficina,
  PedidoEnviado,
  Preferencias,
  ResultadoContato,
  ServicoId,
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
  /** Número aleatório deste aparelho (não identifica a oficina; serve para a demanda e os rascunhos). */
  aparelhoId: string | null;
  demandaEnviadaEm: string | null;
  resumoMostradoEm: string | null;
  ultimoBackup: string | null;
  /** Quando esta cópia foi gravada (a mais nova vence entre IndexedDB e localStorage). */
  salvoEm?: number;
}

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
  registrarPedido(p: PedidoEnviado): void;
  salvarProdutoProprio(p: Omit<ProdutoProprio, 'id' | 'criadoEm'> & { id?: Id }): Id;
  removerProdutoProprio(id: Id): void;
  garantirAparelhoId(): string;
  marcarDemandaEnviada(): void;
  marcarResumo(data: string): void;
  marcarBackup(): void;
  importar(dados: Partial<DadosGuardados>): void;
  carregarExemplo(): void;
  removerExemplo(): void;
  apagarTudo(): void;
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
  demandaEnviadaEm: null,
  resumoMostradoEm: null,
  ultimoBackup: null
};

function novoId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
          contatos: semChaves(get().contatos, (k) => carros.has(k.veiculoId))
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
          contatos: semChaves(get().contatos, (k) => k.veiculoId === id)
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

      registrarPedido(p) {
        set({ pedidos: [p, ...get().pedidos].slice(0, 50), carrinho: [] });
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
        if (atual) return atual;
        const id = novoId();
        set({ aparelhoId: id });
        return id;
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
          carrinho: get().carrinho
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
          contatos: semChaves(s.contatos, (k, id) => ehExemplo(id) || ehExemplo(k.veiculoId))
        });
      },

      apagarTudo() {
        set({ ...VAZIO });
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
        demandaEnviadaEm: s.demandaEnviadaEm,
        resumoMostradoEm: s.resumoMostradoEm,
        ultimoBackup: s.ultimoBackup,
        salvoEm: Date.now()
      }),
      merge: (guardado, atual) => {
        const g = (guardado ?? {}) as Partial<DadosGuardados>;
        return {
          ...atual,
          ...g,
          oficina: { ...OFICINA_VAZIA, ...g.oficina },
          preferencias: { ...PREFERENCIAS_PADRAO, ...g.preferencias }
        };
      }
    }
  )
);

// Outra aba (ou o app instalado) gravou: recarrega para não sobrescrever com dados velhos.
if (noNavegador) {
  canal?.addEventListener('message', (e: MessageEvent) => {
    if ((e.data as { tipo?: string })?.tipo === 'salvo') void useOficina.persist.rehydrate();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void useOficina.persist.rehydrate();
  });
}

function mesclar(atual: DadosGuardados, ex: ReturnType<typeof gerarExemplo>) {
  return {
    clientes: { ...atual.clientes, ...ex.clientes },
    veiculos: { ...atual.veiculos, ...ex.veiculos },
    atendimentos: { ...atual.atendimentos, ...ex.atendimentos },
    leituras: { ...atual.leituras, ...ex.leituras },
    contatos: { ...atual.contatos, ...ex.contatos }
  };
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
