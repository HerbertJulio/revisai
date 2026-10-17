'use client';

// A escolha do mês e a planilha do extrato (o resto da página vem pronto do servidor).

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Botao } from '@/components/ui';
import { nomeDoMes, type ExtratoDaLoja } from '@/lib/loja/dados';
import { escreverCsv } from '@/lib/loja/planilha';
import { SITUACOES_PARTE } from '@/lib/marketplace-dados';

export function EscolherMes({ meses, atual }: { meses: string[]; atual: string }) {
  const router = useRouter();
  const [indo, iniciar] = useTransition();
  return (
    <label className="flex items-center gap-2 text-[14px] font-semibold text-tinta-2">
      Mês
      <select
        value={atual}
        disabled={indo}
        onChange={(e) => iniciar(() => router.push(`/fornecedor/extrato?mes=${e.target.value}`))}
        className="h-10 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[16px] font-semibold text-tinta outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 disabled:opacity-60 sm:text-[14.5px]"
      >
        {meses.map((m) => (
          <option key={m} value={m}>
            {nomeDoMes(m)}
          </option>
        ))}
      </select>
    </label>
  );
}

const dinheiro = (n: number) => n.toFixed(2).replace('.', ',');

export function BaixarExtrato({ extrato }: { extrato: ExtratoDaLoja }) {
  function baixar() {
    const nomeDaSituacao = (s: string) => SITUACOES_PARTE.find((x) => x.id === s)?.nome ?? s;
    const linhas: string[][] = [
      ['pedido', 'data', 'situacao', 'subtotal', 'comissao_percentual', 'comissao'],
      ...extrato.partes.map((p) => [
        p.codigo,
        new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(p.data)),
        nomeDaSituacao(p.situacao),
        dinheiro(p.subtotal),
        String(p.comissaoPercentual).replace('.', ','),
        dinheiro(p.comissao)
      ]),
      [],
      ['total de vendas', '', '', dinheiro(extrato.totalVendas), '', ''],
      ['comissão', '', '', '', '', dinheiro(extrato.totalComissao)],
      ['mensalidade do Destaque', '', '', '', '', dinheiro(extrato.mensalidade)],
      ['total a pagar', '', '', '', '', dinheiro(extrato.total)]
    ];
    const url = URL.createObjectURL(new Blob([escreverCsv(linhas)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `extrato-${extrato.mes}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return (
    <Botao onClick={baixar}>
      <Download size={16} aria-hidden="true" /> Baixar planilha
    </Botao>
  );
}
