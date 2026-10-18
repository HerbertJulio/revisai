'use client';

// Sair da conta neste aparelho: antes, sobe o que ainda não subiu e tira do aparelho a cópia
// dos dados da oficina (outra pessoa pode usar o mesmo computador). Na próxima entrada, os dados
// voltam do banco.

import { del, keys } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { MotorDeSincronia } from '@/components/oficina/sincronia/motor';
import { limparCacheDoApp } from '@/lib/cache-app';
import { plural } from '@/lib/formatos';
import { aoHidratar, gravarAgora, jaHidratou, useOficina } from '@/lib/store';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';

// Enquanto a saída acontece, a tela da oficina não liga os dados do aparelho de novo (senão ela
// buscaria tudo outra vez antes de a sessão acabar). Vale só para a tela que estava aberta: depois
// de sair e entrar de novo, a tela nova começa do zero.
let tela = 0;
let saindoNaTela: number | null = null;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const f of ouvintes) f();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

/** A tela da oficina abriu (uma saída de antes não vale para ela). */
export function telaDaOficinaAbriu(): void {
  tela++;
  avisar();
}

export function saindoDaConta(): boolean {
  return saindoNaTela === tela;
}

export function useSaindoDaConta(): boolean {
  return useSyncExternalStore(assinar, saindoDaConta, () => false);
}

/** A saída não aconteceu (a internet caiu no meio, por exemplo): a tela volta a ligar os dados. */
export function desistirDeSair(): void {
  saindoNaTela = null;
  avisar();
}

/** A ação do servidor terminou mandando para outra página (o Next avisa com um erro especial). */
export function ehRedirecionamento(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

function esperarHidratacao(): Promise<void> {
  if (jaHidratou()) return Promise.resolve();
  return new Promise((resolve) => {
    const parar = aoHidratar(() => {
      parar();
      resolve();
    });
  });
}

/**
 * Sobe o que falta. Se não der (sem internet, sessão vencida), pergunta se pode perder o que
 * ficou. Devolve false se a pessoa preferiu não seguir.
 */
export async function subirAntesDeSair(config: ConfigPublica | null, confirmar: (texto: string) => boolean = (t) => window.confirm(t)): Promise<boolean> {
  await esperarHidratacao();
  const s = useOficina.getState();
  if (!s.contaOficinaId) return true;
  const pendentes = Object.keys(s.sinc.pendentes).length;
  if (!pendentes) return true;
  let ok = false;
  if (config && navigator.onLine !== false) {
    const motor = new MotorDeSincronia(clienteNavegador(config), s.contaOficinaId, () => {});
    ok = await motor.enviarPendentes();
    motor.parar();
  }
  if (ok) return true;
  const resto = Object.keys(useOficina.getState().sinc.pendentes).length || pendentes;
  return confirmar(
    `${plural(resto, 'mudança deste aparelho ainda não subiu', 'mudanças deste aparelho ainda não subiram')} para a nuvem. Saindo agora, ${resto === 1 ? 'ela se perde' : 'elas se perdem'}. Sair mesmo assim?`
  );
}

/**
 * Antes de sair: sobe o que falta e tira os dados da oficina do aparelho. Devolve false se a
 * pessoa preferiu não sair. Se a saída falhar depois disso, chame desistirDeSair().
 */
export async function prepararSaida(config: ConfigPublica | null, confirmar?: (texto: string) => boolean): Promise<boolean> {
  saindoNaTela = tela;
  avisar();
  if (!(await subirAntesDeSair(config, confirmar))) {
    desistirDeSair();
    return false;
  }
  if (useOficina.getState().contaOficinaId) {
    useOficina.getState().esquecerConta();
    // grava já: a página vai mudar logo em seguida
    await gravarAgora().catch(() => {});
  }
  // a ordem por voz em andamento e os áudios e fotos guardados são da conta que sai
  await apagarRascunhosDoAparelho();
  // as telas guardadas para abrir sem internet têm os dados da conta
  await limparCacheDoApp();
  return true;
}

const RASCUNHOS = ['revisai:ordem-por-voz', 'revisai:midia:'];

async function apagarRascunhosDoAparelho(): Promise<void> {
  try {
    const todas = await keys();
    await Promise.all(
      todas.filter((k) => typeof k === 'string' && RASCUNHOS.some((p) => k.startsWith(p))).map((k) => del(k).catch(() => {}))
    );
  } catch {
    // sem IndexedDB (aba privada), não há o que apagar
  }
}
