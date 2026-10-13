'use client';

import { CalendarPlus, MapPin, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EtiquetaTroca, Placa } from '@/components/pecas';
import { Botao, classeBotao } from '@/components/ui';
import { decodificarCartao, type DadosCartao } from '@/lib/cartao';
import { diasEntre, formatarData, formatarDataCurta, hojeISO } from '@/lib/datas';
import { formatarKm } from '@/lib/formatos';
import { gerarIcs } from '@/lib/ics';
import { servico } from '@/lib/manutencao';
import { linkWhatsApp, listaDeServicos } from '@/lib/whatsapp';

/** O cartão de manutenção que a oficina manda para o cliente (dados no fragmento do link). */
export function CartaoDono() {
  const [estado, setEstado] = useState<'carregando' | 'invalido' | DadosCartao>('carregando');
  const [hoje, setHoje] = useState('');

  useEffect(() => {
    setHoje(hojeISO());
    const ler = () => setEstado(decodificarCartao(window.location.hash.slice(1)) ?? 'invalido');
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);

  if (estado === 'carregando') return <div className="min-h-[50vh]" aria-busy="true" />;
  if (estado === 'invalido') {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="largo text-[30px]">Este cartão não abriu</h1>
        <p className="text-tinta-2">O link pode ter sido cortado ao copiar. Peça para a oficina mandar de novo, ou calcule a sua próxima troca por aqui.</p>
        <Link href="/motorista" className={classeBotao('primario', 'normal', 'self-start')}>
          Calcular a próxima troca
        </Link>
      </div>
    );
  }

  const c = estado;
  const itens = [...c.i].sort((a, b) => (a.d ?? '9') < (b.d ?? '9') ? -1 : 1);
  const proximos = itens.filter((i) => i.d);
  const mensagem = `Oi! Aqui é ${c.c || 'o cliente'}, do ${c.car.m} placa ${c.car.p}. Vi no cartão de manutenção que ${listaDeServicos(proximos.slice(0, 3).map((i) => i.s)).texto} ${proximos.length > 1 ? 'estão chegando' : 'está chegando'}. Quero agendar um horário.`;
  const zap = c.o.w ? linkWhatsApp(c.o.w, mensagem) : null;

  function calendario() {
    const ics = gerarIcs(
      proximos.map((i) => ({
        uid: `${c.car.p}-${i.s}-${i.d}@revisai.howlks.com`,
        titulo: `${servico(i.s).nome} do ${c.car.m}`,
        data: i.d!,
        descricao: `${servico(i.s).nome}: até ${formatarData(i.l ?? i.d)}${i.k ? ` ou ${formatarKm(i.k)}` : ''}, o que vier primeiro. Oficina: ${c.o.n}.`
      }))
    );
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `manutencao-${c.car.p}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="text-[15px] font-semibold text-tinta-2">Cartão de manutenção da {c.o.n}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Placa placa={c.car.p} grande />
          <h1 className="largo text-[30px] leading-tight sm:text-[38px]">
            {c.c ? `${c.c}, o seu ` : 'Seu '}
            {c.car.m}
            {c.car.a ? ` ${c.car.a}` : ''}
          </h1>
        </div>
        <p className="max-w-[60ch] text-tinta-2">Cada item vence pela data ou pela quilometragem, o que vier primeiro. Salve os lembretes no calendário do celular.</p>
        <div className="flex flex-wrap gap-2">
          {zap ? (
            <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'grande')}>
              <MessageCircle size={18} /> Agendar com a oficina
            </a>
          ) : null}
          {proximos.length ? (
            <Botao tamanho="grande" onClick={calendario}>
              <CalendarPlus size={18} /> Salvar lembretes no calendário
            </Botao>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-8 rounded-[28px] bg-vidro px-6 py-8 sm:px-8">
        {itens.map((i) => {
          const dias = i.d && hoje ? diasEntre(hoje, i.d) : null;
          const situacao = dias == null ? 'futuro' : dias < 0 ? 'atrasado' : dias <= 15 ? 'avisar' : 'futuro';
          return (
            <div key={i.s} className="flex flex-col items-start gap-2">
              <EtiquetaTroca data={i.l ?? i.d} km={i.k} situacao={situacao} titulo={servico(i.s).nome} />
              {i.l && i.d && i.d < i.l ? <p className="text-[13px] font-semibold text-tinta">Pela sua rodagem, por volta de {formatarDataCurta(i.d)}</p> : null}
              <p className="text-[13px] text-tinta-2">
                Feito em {formatarDataCurta(i.f)}/{i.f.slice(2, 4)} com {formatarKm(i.fk)}
              </p>
            </div>
          );
        })}
      </div>

      <footer className="flex flex-col gap-2 border-t border-linha pt-6 text-[14px] text-tinta-2">
        <p className="flex items-center gap-2 font-semibold text-tinta">
          <MapPin size={16} aria-hidden="true" /> {c.o.n}
          {c.o.c ? <span className="font-normal text-tinta-2">{c.o.c}</span> : null}
        </p>
        {c.o.e ? <p>{c.o.e}</p> : null}
        <p>
          Cartão gerado em {formatarData(c.g)}. As informações ficam só neste link. Feito com o{' '}
          <Link href="/" className="font-semibold text-caneta hover:underline">
            Revisaí
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
