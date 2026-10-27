'use client';

// Junta as partes novas do app da oficina e oferece os pontos onde elas aparecem.

import type { Documento, Id } from '@/lib/tipos';
import { extensao as agenda } from './agenda';
import { extensao as cadastro } from './cadastro';
import { extensao as compras } from './compras';
import { extensao as financeiro } from './financeiro';
import { extensao as fiscal } from './fiscal';
import { extensao as ordem } from './ordem';
import type { Extensao } from './tipos';

const EXTENSOES: Extensao[] = [ordem, financeiro, agenda, cadastro, fiscal, compras];

function cada(nome: string, fn: (e: Extensao) => void) {
  for (const e of EXTENSOES) {
    try {
      fn(e);
    } catch (erro) {
      console.error(`Falhou depois de ${nome}`, erro);
    }
  }
}

export function telasExtras() {
  return EXTENSOES.flatMap((e) => e.telas ?? []);
}

export function PaineisDaOrdem({ doc }: { doc: Documento }) {
  const paineis = EXTENSOES.flatMap((e) => e.paineisDaOrdem ?? []);
  return (
    <>
      {paineis.map((Painel, i) => (
        <Painel key={i} doc={doc} />
      ))}
    </>
  );
}

export function PaineisDoCarro({ veiculoId }: { veiculoId: Id }) {
  const paineis = EXTENSOES.flatMap((e) => e.paineisDoCarro ?? []);
  return (
    <>
      {paineis.map((Painel, i) => (
        <Painel key={i} veiculoId={veiculoId} />
      ))}
    </>
  );
}

export function PaineisDoInicio() {
  const paineis = EXTENSOES.flatMap((e) => e.paineisDoInicio ?? []);
  return (
    <>
      {paineis.map((Painel, i) => (
        <Painel key={i} />
      ))}
    </>
  );
}

export function aoConcluirOrdem(documentoId: Id) {
  cada('concluir a ordem', (e) => e.aoConcluir?.(documentoId));
}

export function aoAprovarOrcamento(orcamentoId: Id, ordemId: Id, recusadas: Id[]) {
  cada('aprovar o orçamento', (e) => e.aoAprovar?.(orcamentoId, ordemId, recusadas));
}

export function aoRecusarOrcamento(orcamentoId: Id) {
  cada('recusar o orçamento', (e) => e.aoRecusar?.(orcamentoId));
}
