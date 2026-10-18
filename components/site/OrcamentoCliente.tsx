'use client';

// O orçamento como o cliente da oficina vê: os itens com o preço, o que a oficina viu no carro,
// e a aprovação pelo WhatsApp da oficina. Dá para desmarcar o que não quiser fazer agora.
// Os dados vêm no fragmento do link (#) e não passam por servidor nenhum.

import { Check, HelpCircle, MapPin, MessageCircle, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Placa } from '@/components/pecas';
import { classeBotao } from '@/components/ui';
import { formatarData, hojeISO } from '@/lib/datas';
import { formatarKm, formatarMoeda, formatarNumero, formatarTelefone } from '@/lib/formatos';
import { servico, servicoExiste } from '@/lib/manutencao';
import { decodificarOrcamento, mensagemDeAprovacao, totalEscolhido, type DadosOrcamento } from '@/lib/orcamento-link';
import { linkWhatsApp } from '@/lib/whatsapp';

const URGENCIAS = { a: 'Fazer logo', p: 'Na próxima revisão', o: 'Ficar de olho' } as const;

/** "Peça, 4 litros de R$ 45,90"; nada quando a descrição já diz tudo ("Mão de obra"). */
function legendaDaLinha(l: DadosOrcamento['l'][number]): string {
  const tipo = l.t === 'p' ? 'Peça' : l.t === 's' ? 'Mão de obra' : '';
  const partes: string[] = [];
  if (tipo && !l.d.toLowerCase().startsWith(tipo.toLowerCase()) && !(l.t === 's' && l.v == null)) partes.push(tipo);
  if (l.q !== 1 || l.u === 'L') partes.push(`${formatarNumero(l.q, 2)} ${l.u === 'L' ? 'litros' : l.u === 'h' ? 'horas' : 'unidades'}${l.v != null ? ` de ${formatarMoeda(l.v)}` : ''}`);
  return partes.join(', ');
}

export function OrcamentoCliente() {
  const [estado, setEstado] = useState<'carregando' | 'invalido' | DadosOrcamento>('carregando');
  useEffect(() => {
    const ler = () => setEstado(decodificarOrcamento(window.location.hash.slice(1)) ?? 'invalido');
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);
  if (estado === 'carregando') return <div className="min-h-[50vh]" aria-busy="true" />;
  if (estado === 'invalido')
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="largo text-[30px]">Este orçamento não abriu</h1>
        <p className="text-tinta-2">O link pode ter sido cortado ao copiar. Peça para a oficina mandar de novo.</p>
      </div>
    );
  return <Orcamento d={estado} />;
}

function Orcamento({ d }: { d: DadosOrcamento }) {
  const [escolhidas, setEscolhidas] = useState<Set<number>>(() => new Set(d.l.map((_l, i) => i)));
  const [hoje, setHoje] = useState('');
  useEffect(() => setHoje(hojeISO()), []);
  const total = useMemo(() => totalEscolhido(d, escolhidas), [d, escolhidas]);
  const vencido = !!hoje && hoje > d.ate;
  const grupos = useMemo(() => {
    const g: { titulo: string; itens: { l: DadosOrcamento['l'][number]; i: number }[] }[] = [];
    d.l.forEach((l, i) => {
      const titulo = l.g && servicoExiste(l.g) ? servico(l.g).nome : 'Outros itens';
      let grupo = g.find((x) => x.titulo === titulo);
      if (!grupo) g.push((grupo = { titulo, itens: [] }));
      grupo.itens.push({ l, i });
    });
    return g.sort((a, b) => Number(a.titulo === 'Outros itens') - Number(b.titulo === 'Outros itens'));
  }, [d]);
  const carro = [d.car.m, d.car.a].filter(Boolean).join(' ');
  const aprovar = d.o.w && escolhidas.size ? linkWhatsApp(d.o.w, mensagemDeAprovacao(d, escolhidas, formatarMoeda)) : null;
  const duvida = d.o.w ? linkWhatsApp(d.o.w, `Olá! Tenho uma dúvida sobre o orçamento nº ${d.n} (${[d.car.m, d.car.p].filter(Boolean).join(', ')}).`) : null;
  const agoraNao = d.o.w ? linkWhatsApp(d.o.w, `Olá! Obrigado pelo orçamento nº ${d.n}. Por enquanto não vou fazer.`) : null;

  function alternar(i: number) {
    setEscolhidas((x) => {
      const n = new Set(x);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1 border-b-2 border-tinta pb-4">
        <p className="largo text-[15px] font-extrabold tracking-wide text-oleo-tinta">Orçamento nº {d.n}</p>
        <h1 className="largo text-[30px] leading-tight sm:text-[36px]">{d.o.n}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px] text-tinta-2">
          {d.o.c ? (
            <span className="inline-flex items-center gap-1">
              <MapPin size={15} aria-hidden="true" /> {[d.o.e, d.o.c].filter(Boolean).join(', ')}
            </span>
          ) : null}
          {d.o.w ? <span>WhatsApp {formatarTelefone(d.o.w)}</span> : null}
        </p>
        <p className="mt-1 text-[13px] text-tinta-3">
          Este orçamento foi montado no aparelho da oficina e veio no próprio link, sem passar pelo Revisaí. Antes de aprovar, confira se o WhatsApp acima é mesmo o da sua oficina.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-3">
        {d.car.p ? <Placa placa={d.car.p} grande /> : null}
        <div className="min-w-0">
          <p className="font-bold">{carro}</p>
          <p className="text-[14px] text-tinta-2">
            {[d.car.k != null ? formatarKm(d.car.k) : '', `feito em ${formatarData(d.d)}`].filter(Boolean).join(', ')}
          </p>
        </div>
        <p className={`ml-auto rounded-full px-3 py-1 text-[13.5px] font-semibold ${vencido ? 'bg-atraso-claro text-atraso' : 'bg-ok-claro text-ok'}`}>{vencido ? `Venceu em ${formatarData(d.ate)}` : `Vale até ${formatarData(d.ate)}`}</p>
      </section>

      {d.c ? <p className="text-[17px]">Olá, {d.c}! Segue o que o seu carro precisa e quanto fica.</p> : null}

      {d.dg ? (
        <section className="rounded-2xl bg-papel-2 px-4 py-3.5">
          <h2 className="text-[15px] font-bold">O que a oficina viu no carro</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-tinta-2">{d.dg}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4" aria-label="Itens">
        <p className="text-[14px] text-tinta-3">Desmarque o que não quiser fazer agora. O total muda sozinho.</p>
        {grupos.map((g) => (
          <div key={g.titulo} className="flex flex-col gap-1.5">
            <h2 className="text-[16px] font-bold">{g.titulo}</h2>
            <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
              {g.itens.map(({ l, i }) => {
                const sim = escolhidas.has(i);
                return (
                  <li key={i}>
                    <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${sim ? '' : 'text-tinta-3'}`}>
                      <input type="checkbox" checked={sim} onChange={() => alternar(i)} className="h-5 w-5 shrink-0 accent-[var(--color-tinta)] print:hidden" />
                      <span className="min-w-0 flex-1">
                        <span className={`block ${sim ? '' : 'line-through'}`}>{l.d}</span>
                        {legendaDaLinha(l) ? <span className="block text-[13px] text-tinta-3">{legendaDaLinha(l)}</span> : null}
                      </span>
                      <span className={`num font-semibold ${sim ? '' : 'line-through'}`}>{l.v != null ? formatarMoeda(Math.round(l.v * l.q * 100) / 100) : l.t === 's' ? '' : 'a combinar'}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-1 rounded-2xl bg-tinta px-5 py-4 text-papel">
        {d.ds ? <p className="text-[14px] text-papel/75">Com {formatarMoeda(d.ds)} de desconto</p> : null}
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">Total</span>
          <span className="largo num text-[32px] font-extrabold">{formatarMoeda(total)}</span>
        </p>
        {d.m === 'p' && d.vi ? (
          <p className="text-[14px] text-papel/80">
            A vistoria custa {formatarMoeda(d.vi.v)}.
            {d.vi.a ? ` Se aprovar, ela sai deste valor: você paga ${formatarMoeda(Math.max(0, total - d.vi.v))} no fim.` : ' Ela é cobrada à parte.'}
          </p>
        ) : null}
      </section>

      {d.pz || d.pg ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {d.pz ? (
            <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
              <dt className="text-[13px] font-semibold text-tinta-3">Prazo</dt>
              <dd className="font-semibold">{d.pz}</dd>
            </div>
          ) : null}
          {d.pg ? (
            <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
              <dt className="text-[13px] font-semibold text-tinta-3">Pagamento</dt>
              <dd className="font-semibold">{d.pg}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {d.r?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-[16px] font-bold">Para ficar de olho</h2>
          <ul className="flex flex-col gap-1.5">
            {d.r.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-[15px]">
                <span className="mt-0.5 shrink-0 rounded-full bg-oleo-claro px-2 py-0.5 text-[12px] font-bold text-oleo-tinta">{URGENCIAS[x.u]}</span>
                {x.t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {d.ob ? <p className="text-[14.5px] text-tinta-2">{d.ob}</p> : null}

      <div className="flex flex-col gap-2 print:hidden">
        {aprovar && !vencido ? (
          <a href={aprovar} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'grande', 'w-full')}>
            <Check size={19} aria-hidden="true" /> {escolhidas.size === d.l.length ? 'Aprovar o orçamento' : `Aprovar ${escolhidas.size} ${escolhidas.size === 1 ? 'item' : 'itens'}`}
          </a>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {duvida ? (
            <a href={duvida} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'normal', 'flex-1')}>
              <HelpCircle size={17} aria-hidden="true" /> {vencido ? 'Pedir um orçamento novo' : 'Tirar uma dúvida'}
            </a>
          ) : null}
          <button type="button" onClick={() => window.print()} className={classeBotao('secundario', 'normal', 'flex-1')}>
            <Printer size={17} aria-hidden="true" /> Imprimir ou salvar PDF
          </button>
        </div>
        {agoraNao && !vencido ? (
          <a href={agoraNao} target="_blank" rel="noopener noreferrer" className="self-center py-2 text-[14px] font-semibold text-tinta-3 hover:text-tinta">
            <MessageCircle size={14} className="mr-1 inline" aria-hidden="true" /> Agora não
          </a>
        ) : null}
      </div>

      <p className="border-t border-linha pt-4 text-[12.5px] leading-relaxed text-tinta-3">
        Orçamento feito pela {d.o.n} no Revisaí. Os valores valem até {formatarData(d.ate)}. As informações deste orçamento ficam só neste link: nada é guardado em servidor.
      </p>
    </article>
  );
}
