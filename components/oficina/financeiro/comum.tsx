'use client';

// Peças comuns do financeiro e dos relatórios: quem pode ver o dinheiro, o CSV para baixar,
// o selo da situação de uma conta e o id dos lançamentos novos.

import { Download, Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Chip, classeBotao } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import { situacaoDoLancamento, type SituacaoLancamento } from '@/lib/financeiro';
import { csv, type Celula } from '@/lib/relatorios';
import type { Lancamento } from '@/lib/registros-oficina';
import type { Id } from '@/lib/tipos';

/** Sem conta, quem usa o aparelho é o dono; com conta, o mecânico não vê o dinheiro. */
export function useGestao(): boolean {
  const { oficina } = useConta();
  return !oficina || oficina.papel !== 'mecanico';
}

/** A tela de dinheiro aberta pelo endereço por quem não pode ver. */
export function SoGestao({ children }: { children: ReactNode }) {
  const gestao = useGestao();
  if (gestao) return <>{children}</>;
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linha px-5 py-8">
      <Lock size={22} className="text-tinta-3" aria-hidden="true" />
      <p className="meio-largo text-lg font-bold">Só o dono e o gerente veem esta tela</p>
      <p className="max-w-prose text-tinta-2">O dinheiro da oficina (contas, caixa, fiado e relatórios) fica com quem cuida da gestão. Peça ao dono se precisar de alguma informação.</p>
      <Link href="/oficina" className={classeBotao('secundario')}>
        Voltar para os avisos
      </Link>
    </div>
  );
}

export function gerarId(): Id {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Baixa a tabela em CSV (com o BOM do UTF-8, para a planilha abrir os acentos). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: Celula[][]) {
  const blob = new Blob([`﻿${csv(cabecalho, linhas)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function BotaoCsv({ nome, cabecalho, linhas, rotulo = 'Baixar CSV' }: { nome: string; cabecalho: string[]; linhas: Celula[][]; rotulo?: string }) {
  return (
    <button
      type="button"
      onClick={() => baixarCsv(nome, cabecalho, linhas)}
      disabled={!linhas.length}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[14px] font-semibold text-caneta hover:bg-caneta-claro disabled:opacity-40"
    >
      <Download size={15} aria-hidden="true" /> {rotulo}
    </button>
  );
}

const SITUACOES: Record<SituacaoLancamento, { nome: (l: Pick<Lancamento, 'tipo'>) => string; tom: 'ok' | 'atraso' | 'oleo' | 'neutro' }> = {
  pago: { nome: (l) => (l.tipo === 'receber' ? 'Recebido' : 'Pago'), tom: 'ok' },
  vencido: { nome: () => 'Vencido', tom: 'atraso' },
  hoje: { nome: () => 'Vence hoje', tom: 'oleo' },
  aberto: { nome: () => 'Em aberto', tom: 'neutro' }
};

export function SeloDaConta({ lancamento, hoje }: { lancamento: Pick<Lancamento, 'tipo' | 'pagoEm' | 'vencimento'>; hoje: string }) {
  const s = SITUACOES[situacaoDoLancamento(lancamento, hoje)];
  return <Chip tom={s.tom}>{s.nome(lancamento)}</Chip>;
}

/** "Parcela 2 de 3". */
export function textoDaParcela(l: Pick<Lancamento, 'parcela'>): string {
  return l.parcela && l.parcela.total > 1 ? `${l.parcela.numero}/${l.parcela.total}` : '';
}

/** As colunas do CSV das contas. */
export const CABECALHO_CONTAS = ['Tipo', 'Descrição', 'Cliente ou favorecido', 'Categoria', 'Forma', 'Parcela', 'Vencimento', 'Pago em', 'Valor', 'Observação'];

export function dataBr(iso: string | null | undefined): string {
  return iso ? formatarData(iso) : '';
}
