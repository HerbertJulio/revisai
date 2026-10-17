// Em que carros a peça serve. A loja escreve como fala ("Gol 1.0 2015 a 2020"); o app tira a marca,
// o modelo e os anos, para a oficina achar a peça pelo carro que está no elevador.
// Sem nada de servidor: serve ao formulário, à planilha e à vitrine.

import { modeloFalado, semAcento } from '../fala';
import type { Aplicacao } from './dados';

const ANO = '(19[5-9]\\d|20\\d{2})';

/** Uma linha vira uma aplicação (ou null se não sobrar nada). */
export function lerAplicacao(linha: string): Aplicacao | null {
  const texto = linha.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (texto.length < 2) return null;
  let anoDe: number | null = null;
  let anoAte: number | null = null;
  const faixa = texto.match(new RegExp(`\\b${ANO}\\s*(?:-|–|a|até|ate|/)\\s*${ANO}\\b`, 'i'));
  const emDiante = texto.match(new RegExp(`\\b${ANO}\\s*(?:\\+|em diante|pra frente|para frente)`, 'i'));
  const umAno = texto.match(new RegExp(`\\b${ANO}\\b`));
  if (faixa) {
    anoDe = Math.min(Number(faixa[1]), Number(faixa[2]));
    anoAte = Math.max(Number(faixa[1]), Number(faixa[2]));
  } else if (emDiante) {
    anoDe = Number(emDiante[1]);
  } else if (umAno) {
    anoDe = anoAte = Number(umAno[1]);
  }
  const semAnos = texto
    .replace(new RegExp(`\\b${ANO}\\b`, 'g'), ' ')
    .replace(/\b\d\.\d\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = semAnos ? modeloFalado(semAnos) : null;
  return { texto, marca: m?.marca || null, modelo: m?.modelo || null, anoDe, anoAte };
}

/** Várias linhas (ou separadas por ";" ou "|"), sem repetir. */
export function lerAplicacoesDoTexto(texto: string): Aplicacao[] {
  const vistas = new Set<string>();
  const lista: Aplicacao[] = [];
  for (const parte of texto.split(/\r?\n|;|\|/)) {
    const a = lerAplicacao(parte);
    if (!a) continue;
    const chave = semAcento(a.texto).toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    lista.push(a);
    if (lista.length >= 100) break;
  }
  return lista;
}

export function textoDasAplicacoes(lista: Aplicacao[], separador = '\n'): string {
  return lista.map((a) => a.texto).join(separador);
}

/** Como a aplicação aparece num selo curto: "VW Gol 2015–2020". */
export function rotuloDaAplicacao(a: Aplicacao): string {
  if (!a.modelo) return a.texto;
  const anos = a.anoDe && a.anoAte ? (a.anoDe === a.anoAte ? `${a.anoDe}` : `${a.anoDe}–${a.anoAte}`) : a.anoDe ? `${a.anoDe} em diante` : '';
  return [a.marca, a.modelo, anos].filter(Boolean).join(' ');
}

function igual(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && semAcento(a).toLowerCase().replace(/[^a-z0-9]/g, '') === semAcento(b).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A peça serve no carro? 'sim' quando uma aplicação bate modelo (e marca, quando as duas têm) e o
 * ano cabe; 'nao' quando a loja informou aplicações e nenhuma bate; 'sem-informacao' quando a loja
 * não informou (a oficina confere pela ficha técnica).
 */
export function serveNoCarro(aplicacoes: Aplicacao[], carro: { marca?: string | null; modelo?: string | null; ano?: number | null }): 'sim' | 'nao' | 'sem-informacao' {
  if (!aplicacoes.length || !carro.modelo) return 'sem-informacao';
  const modeloDoCarro = carro.modelo.split(/\s+/)[0];
  const bate = aplicacoes.some((a) => {
    if (!a.modelo) return false;
    const modelo = igual(a.modelo, carro.modelo) || igual(a.modelo.split(/\s+/)[0], modeloDoCarro);
    if (!modelo) return false;
    if (a.marca && carro.marca && !igual(a.marca, carro.marca) && !(igual(a.marca, 'Volkswagen') && igual(carro.marca, 'VW'))) return false;
    if (carro.ano && a.anoDe && carro.ano < a.anoDe) return false;
    if (carro.ano && a.anoAte && carro.ano > a.anoAte) return false;
    return true;
  });
  return bate ? 'sim' : 'nao';
}
