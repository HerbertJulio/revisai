'use client';

import { useMemo, useState, useTransition } from 'react';
import { decidirPedidoDeImpulso } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Vazio, classeEntrada } from '@/components/ui';
import { contarPor, dataCurta, quandoFoi } from '@/lib/equipe-dados';
import { formatarMoeda, plural } from '@/lib/formatos';
import type { ImpulsoAdmin } from '@/lib/marketplace';
import { SITUACOES_IMPULSO, type SituacaoImpulso } from '@/lib/marketplace-dados';
import { Filtro, LinhaDeFiltros } from './comum';

export function ImpulsosAdmin({ impulsos, hoje }: { impulsos: ImpulsoAdmin[]; hoje: string }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<SituacaoImpulso>(impulsos.some((i) => i.status === 'pedido') ? 'pedido' : 'ativo');
  const [inicio, setInicio] = useState<Record<number, string>>({});
  const [ocupado, iniciar] = useTransition();
  const contagem = useMemo(() => contarPor(impulsos, (i) => i.status), [impulsos]);
  const visiveis = impulsos.filter((i) => i.status === filtro);
  const noAr = impulsos.filter((i) => i.status === 'ativo' && (i.fim ?? '') >= hoje);
  const receita = noAr.reduce((s, i) => s + i.valor, 0);
  const agora = Date.now();

  function decidir(i: ImpulsoAdmin, decisao: 'ativo' | 'recusado' | 'encerrado') {
    if (decisao === 'recusado' && !window.confirm(`Recusar o impulso de ${i.produtoNome}?`)) return;
    if (decisao === 'encerrado' && !window.confirm(`Tirar ${i.produtoNome} do topo agora?`)) return;
    iniciar(async () => {
      try {
        const r = await decidirPedidoDeImpulso(i.id, decisao, decisao === 'ativo' ? (inicio[i.id] ?? hoje) : null);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        toast({ texto: decisao === 'ativo' ? `${i.produtoNome} está impulsionado.` : decisao === 'recusado' ? 'Pedido recusado.' : 'Impulso encerrado.' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-tinta-2">
        {plural(noAr.length, 'produto no ar', 'produtos no ar')} agora, {formatarMoeda(receita)} em impulsos ativos. Ative depois de receber o pagamento (PIX ou boleto combinado com o fornecedor).
      </p>
      <LinhaDeFiltros rotulo="Filtrar impulsos">
        {SITUACOES_IMPULSO.map((s) => (
          <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => setFiltro(s.id)} n={contagem[s.id] ?? 0}>
            {s.plural}
          </Filtro>
        ))}
      </LinhaDeFiltros>
      {visiveis.length ? (
        <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {visiveis.map((i) => {
            const s = SITUACOES_IMPULSO.find((x) => x.id === i.status)!;
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{i.produtoNome}</p>
                    <Chip tom={s.tom}>{s.nome}</Chip>
                  </div>
                  <p className="text-[14px] text-tinta-2">
                    {i.fornecedorNome}, {i.dias} dias {i.uf ? `em ${i.uf}` : 'no Brasil todo'}, {formatarMoeda(i.valor)}
                  </p>
                  <p className="text-[13px] text-tinta-3">
                    {i.inicio && i.fim ? `De ${dataCurta(i.inicio, hoje)} a ${dataCurta(i.fim, hoje)}. ` : ''}Pedido {quandoFoi(i.criado_em, agora)}.
                  </p>
                </div>
                {i.status === 'pedido' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-[14px] text-tinta-2">
                      Começa em
                      <input
                        type="date"
                        className={`${classeEntrada} h-9 w-auto`}
                        value={inicio[i.id] ?? hoje}
                        min={hoje}
                        onChange={(e) => setInicio({ ...inicio, [i.id]: e.target.value })}
                      />
                    </label>
                    <Botao tamanho="pequeno" variante="escuro" onClick={() => decidir(i, 'ativo')} disabled={ocupado}>
                      Ativar
                    </Botao>
                    <Botao tamanho="pequeno" variante="perigo" onClick={() => decidir(i, 'recusado')} disabled={ocupado}>
                      Recusar
                    </Botao>
                  </div>
                ) : i.status === 'ativo' ? (
                  <Botao tamanho="pequeno" onClick={() => decidir(i, 'encerrado')} disabled={ocupado}>
                    Encerrar agora
                  </Botao>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo="Nada aqui">Os fornecedores pedem impulso pelo painel deles. O pedido aparece aqui para você ativar depois do pagamento.</Vazio>
      )}
    </div>
  );
}
