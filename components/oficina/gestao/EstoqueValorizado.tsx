'use client';

// Quanto de dinheiro está parado no estoque (posição valorizada) e quanto saiu em peças no mês
// (consumo/CMV). Só leitura, a partir do estoque e dos movimentos. Lógica em lib/custo-estoque.

import { useMemo } from 'react';
import { Chip, Secao } from '@/components/ui';
import { consumoValorizado, posicaoValorizada } from '@/lib/custo-estoque';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';

export function EstoqueValorizado() {
  const hoje = useHoje();
  const estoque = useOficina((s) => s.estoque);
  const movimentos = useOficina((s) => s.movimentos);
  const pos = useMemo(() => posicaoValorizada(Object.values(estoque)), [estoque]);
  const cmv = useMemo(() => consumoValorizado(Object.values(movimentos), estoque, { de: `${hoje.slice(0, 7)}-01`, ate: hoje }), [movimentos, estoque, hoje]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Dinheiro parado em peças</p>
          <p className="largo num mt-1 text-[26px] font-extrabold">{formatarMoeda(pos.total)}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Consumo de peças no mês (CMV)</p>
          <p className="largo num mt-1 text-[26px] font-extrabold">{formatarMoeda(cmv.total)}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Itens sem custo</p>
          <p className="largo num mt-1 text-[26px] font-extrabold">{pos.semCusto}</p>
          <p className="text-[12px] text-tinta-3">não entram no valor</p>
        </div>
      </div>

      {pos.porCategoria.length ? (
        <Secao titulo="Por categoria">
          <div className="flex flex-col divide-y divide-linha rounded-2xl bg-papel px-5 ring-1 ring-linha">
            {pos.porCategoria.map((c) => (
              <div key={c.categoria} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[15px]">{c.nome}</span>
                <span className="num font-semibold">{formatarMoeda(c.valor)}</span>
              </div>
            ))}
          </div>
        </Secao>
      ) : null}

      {pos.itens.length ? (
        <Secao titulo="Maiores valores" descricao="Os itens que mais seguram dinheiro no estoque.">
          <div className="flex flex-col divide-y divide-linha rounded-2xl bg-papel px-5 ring-1 ring-linha">
            {pos.itens.slice(0, 10).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{i.nome}</span>
                  <span className="text-[13px] text-tinta-3">
                    {i.quantidade} × {formatarMoeda(i.custo)}
                  </span>
                </span>
                <span className="num font-semibold">{formatarMoeda(i.valor)}</span>
              </div>
            ))}
          </div>
        </Secao>
      ) : (
        <p className="text-[15px] text-tinta-2">Cadastre o custo dos itens do estoque para ver quanto de dinheiro está parado em peças.</p>
      )}

      {cmv.itens.length ? (
        <Secao titulo="Consumo do mês" descricao="As peças que saíram para as ordens neste mês, pelo custo.">
          <div className="flex flex-col divide-y divide-linha rounded-2xl bg-papel px-5 ring-1 ring-linha">
            {cmv.itens.slice(0, 10).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate text-[15px]">
                  {i.nome} <Chip tom="neutro">{i.quantidade}</Chip>
                </span>
                <span className="num font-semibold">{formatarMoeda(i.valor)}</span>
              </div>
            ))}
          </div>
        </Secao>
      ) : null}
    </div>
  );
}
