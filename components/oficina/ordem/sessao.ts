'use client';

// A ordem por voz em andamento fica guardada no aparelho enquanto o mecânico não confirma: o áudio
// vai para o IndexedDB assim que ele para de falar, junto com o texto, as fotos e a ficha. Se a
// internet cair, o app fechar ou ele sair da tela, a ordem continua de onde parou.

import { del, get, set } from 'idb-keyval';
import type { OrdemIA } from '@/lib/agente/esquema';
import { apagarMidia, lerMidia } from '@/lib/midia';
import type { Clipe } from './gravador';

const CHAVE = 'revisai:ordem-por-voz';
// as ordens já confirmadas ou descartadas (uma outra aba aberta não pode trazer de volta)
const ENCERRADAS = 'revisai:ordem-por-voz:encerradas';

export interface FotoLocal {
  id: string;
  arquivo: File;
  url: string;
}

export interface Preenchido {
  relato: string;
  fotos: string;
}

export interface SessaoSalva<R = unknown> {
  versao: 1;
  id: string;
  criadoEm: string;
  veiculoId: string | null;
  clipes: { id: string; mime: string; segundos: number; ouvido: boolean }[];
  fotos: { id: string; mime: string; nome: string }[];
  relato: string;
  /** Com que texto e fotos a ordem foi preenchida da última vez (para saber se mudou). */
  preenchido: Preenchido | null;
  contada: boolean;
  ia: { ordem: OrdemIA; modelo: string } | null;
  rev: R | null;
  /** O mecânico já mexeu na ficha (preencher de novo pergunta antes). */
  mexeu: boolean;
}

async function encerradas(): Promise<string[]> {
  try {
    return ((await get(ENCERRADAS)) as string[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function lerSessao<R>(): Promise<SessaoSalva<R> | null> {
  try {
    const s = (await get(CHAVE)) as SessaoSalva<R> | undefined;
    if (!s || s.versao !== 1 || !s.id) return null;
    return (await encerradas()).includes(s.id) ? null : s;
  } catch {
    return null;
  }
}

export async function salvarSessao<R>(s: SessaoSalva<R>): Promise<void> {
  try {
    if ((await encerradas()).includes(s.id)) return;
    await set(CHAVE, s);
  } catch {}
}

/** Tira do aparelho a ordem guardada quando ela fica vazia (só se for esta mesma ordem). */
export async function esquecerSessao(id: string): Promise<void> {
  try {
    const guardada = (await get(CHAVE)) as SessaoSalva | undefined;
    if (!guardada || guardada.id === id) await del(CHAVE);
  } catch {}
}

/**
 * Encerra a ordem: confirmada ou descartada, ela não volta mais. Com `midias`, apaga também os
 * áudios e fotos (quando é descartada), a não ser que outra aba já tenha encerrado a mesma ordem.
 */
export async function encerrarSessao(id: string, midias?: string[]): Promise<void> {
  const lista = await encerradas();
  const ja = lista.includes(id);
  try {
    await set(ENCERRADAS, [...lista.filter((x) => x !== id), id].slice(-30));
  } catch {}
  await esquecerSessao(id);
  if (!ja) for (const m of midias ?? []) await apagarMidia(m);
}

/** Os áudios e fotos guardados, de volta como arquivos (os que sumiram ficam de fora). */
export async function abrirMidias(s: SessaoSalva<unknown>): Promise<{ clipes: Clipe[]; fotos: FotoLocal[] }> {
  const clipes: Clipe[] = [];
  for (const c of s.clipes) {
    const blob = await lerMidia(c.id);
    if (blob) clipes.push({ id: c.id, blob, url: URL.createObjectURL(blob), segundos: c.segundos, ouvido: c.ouvido });
  }
  const fotos: FotoLocal[] = [];
  for (const f of s.fotos) {
    const blob = await lerMidia(f.id);
    if (!blob) continue;
    const arquivo = new File([blob], f.nome, { type: f.mime || blob.type });
    fotos.push({ id: f.id, arquivo, url: URL.createObjectURL(arquivo) });
  }
  return { clipes, fotos };
}
