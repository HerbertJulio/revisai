'use client';

// Os valores: a peça de cada serviço (quantidade e preço), a mão de obra, itens avulsos e desconto.

import { Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { IconeServico } from '@/components/icones';
import { classeEntrada } from '@/components/ui';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import { servico as infoServico } from '@/lib/manutencao';
import { definirMaoDeObra, incluirAvulsa, linhaDaMaoDeObra, linhaDaPeca, linhasAvulsas, mudarLinha, tirarLinha, totaisDoRascunho, type Rascunho } from '@/lib/passo';
import { useOficina } from '@/lib/store';
import type { ServicoId } from '@/lib/tipos';

/** O último valor de mão de obra que a oficina cobrou por serviço (para sugerir com um toque). */
function useUltimaMaoDeObra(): Map<ServicoId, number> {
  const documentos = useOficina((s) => s.documentos);
  return useMemo(() => {
    const m = new Map<ServicoId, number>();
    const lista = Object.values(documentos).sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));
    for (const d of lista) for (const l of d.linhas) if (l.tipo === 'servico' && l.servico && l.valorUnitario && !m.has(l.servico)) m.set(l.servico, l.valorUnitario);
    return m;
  }, [documentos]);
}

export function CampoDinheiro({ valor, aoMudar, rotulo, id, grande = false }: { valor: number | null | undefined; aoMudar: (v: number | null) => void; rotulo: string; id: string; grande?: boolean }) {
  const [texto, setTexto] = useState(valor != null ? formatarNumero(valor, 2) : '');
  // o valor mudou por fora (pela voz): mostra o novo
  useEffect(() => {
    if ((valor ?? null) !== (lerNumero(texto) ?? null)) setTexto(valor != null ? formatarNumero(valor, 2) : '');
  }, [valor]);
  return (
    <span className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-tinta-3">R$</span>
      <input
        id={id}
        aria-label={rotulo}
        className={`${classeEntrada} num pl-10 font-bold ${grande ? 'h-12 w-36 text-[18px]' : 'w-32'}`}
        value={texto}
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        onChange={(e) => {
          setTexto(e.target.value);
          const v = lerNumero(e.target.value);
          aoMudar(v != null && v >= 0 ? v : null);
        }}
      />
    </span>
  );
}

export function Valores({ r, aoMudar }: { r: Rascunho; aoMudar: (r: Rascunho) => void }) {
  const ultima = useUltimaMaoDeObra();
  const [novoTexto, setNovoTexto] = useState('');
  const [novoValor, setNovoValor] = useState<number | null>(null);
  const [chaveNovo, setChaveNovo] = useState(0);
  const t = totaisDoRascunho(r);
  const avulsas = linhasAvulsas(r);

  function incluir() {
    if (novoTexto.trim().length < 2) return;
    aoMudar(incluirAvulsa(r, novoTexto, novoValor));
    setNovoTexto('');
    setNovoValor(null);
    setChaveNovo((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3">
        {r.servicos.map((s) => {
          const peca = linhaDaPeca(r, s);
          const mao = linhaDaMaoDeObra(r, s);
          const sugestao = ultima.get(s);
          return (
            <li key={s} className="rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha">
              <p className="flex items-center gap-2 font-bold">
                <IconeServico servico={s} size={19} className="text-tinta-2" /> {infoServico(s).nome}
              </p>
              {peca ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14.5px]">
                  <span className="min-w-0 flex-1 basis-48">
                    {peca.descricao}
                    <span className="num text-tinta-3">
                      {' '}
                      · {formatarNumero(peca.quantidade, 2)} {peca.unidade === 'L' ? 'L' : 'un'}
                    </span>
                  </span>
                  <CampoDinheiro id={`p-${peca.id}`} rotulo={`Preço de ${peca.descricao}${peca.unidade === 'L' ? ' por litro' : ''}`} valor={peca.valorUnitario} aoMudar={(v) => aoMudar(mudarLinha(r, peca.id, { valorUnitario: v }))} />
                  <span className="num w-24 text-right font-semibold">{peca.valorUnitario != null ? formatarMoeda(peca.valorUnitario * peca.quantidade) : '—'}</span>
                </div>
              ) : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14.5px]">
                <label htmlFor={`m-${s}`} className="min-w-0 flex-1 basis-48 text-tinta-2">
                  Mão de obra
                </label>
                <CampoDinheiro id={`m-${s}`} rotulo={`Mão de obra de ${infoServico(s).nome}`} valor={mao?.valorUnitario} aoMudar={(v) => aoMudar(definirMaoDeObra(r, s, v))} />
                <span className="w-24 text-right">
                  {!mao && sugestao ? (
                    <button type="button" onClick={() => aoMudar(definirMaoDeObra(r, s, sugestao))} className="num rounded-full bg-papel-2 px-2.5 py-1 text-[13px] font-semibold text-caneta hover:bg-caneta-claro">
                      {formatarMoeda(sugestao)}
                    </button>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-2" aria-labelledby="t-avulsos">
        <h3 id="t-avulsos" className="text-[16px] font-bold">
          Outros itens
        </h3>
        {avulsas.length ? (
          <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {avulsas.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 basis-40 text-[14.5px]">{l.descricao}</span>
                <CampoDinheiro id={`a-${l.id}`} rotulo={`Valor de ${l.descricao}`} valor={l.valorUnitario} aoMudar={(v) => aoMudar(mudarLinha(r, l.id, { valorUnitario: v }))} />
                <button type="button" onClick={() => aoMudar(tirarLinha(r, l.id))} className="grid h-9 w-9 place-items-center rounded-full text-tinta-3 hover:bg-papel-2 hover:text-atraso" aria-label={`Tirar ${l.descricao}`}>
                  <X size={17} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${classeEntrada} min-w-0 flex-1 basis-52`} value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && incluir()} placeholder="Ex.: troca da bomba d'água" aria-label="Novo item" maxLength={160} />
          <CampoDinheiro key={chaveNovo} id="novo-valor" rotulo="Valor do novo item" valor={null} aoMudar={setNovoValor} />
          <button type="button" onClick={incluir} disabled={novoTexto.trim().length < 2} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-tinta px-3.5 font-semibold text-papel disabled:opacity-45">
            <Plus size={17} aria-hidden="true" /> Incluir
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
        <label htmlFor="desconto" className="font-semibold">
          Desconto
        </label>
        <span className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-tinta-3">R$</span>
          <input id="desconto" className={`${classeEntrada} num w-32 pl-10 font-bold`} value={r.desconto} onChange={(e) => aoMudar({ ...r, desconto: e.target.value })} inputMode="decimal" placeholder="0,00" autoComplete="off" />
        </span>
      </div>

      <div className="flex flex-col gap-1 rounded-2xl bg-tinta px-5 py-4 text-papel">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[14px] text-papel/75">
          <span>Peças {formatarMoeda(t.pecas)}</span>
          <span>Mão de obra {formatarMoeda(t.servicos + t.outros)}</span>
          {t.desconto ? <span>Desconto {formatarMoeda(t.desconto)}</span> : null}
        </div>
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">Total</span>
          <span className="largo num text-[30px] font-extrabold">{formatarMoeda(t.total)}</span>
        </p>
        {t.semPreco ? <p className="text-[13px] text-oleo">{t.semPreco === 1 ? 'Um item ainda está sem preço.' : `${t.semPreco} itens ainda estão sem preço.`}</p> : null}
        {r.tipo === 'orcamento' && r.modalidade === 'pago' && lerNumero(r.vistoria) ? (
          <p className="text-[13px] text-papel/75">
            Vistoria de {formatarMoeda(lerNumero(r.vistoria))}
            {r.abater ? ', que sai deste total quando o cliente aprovar.' : ', cobrada à parte.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
