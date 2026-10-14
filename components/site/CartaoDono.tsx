'use client';

import { CalendarDays, CalendarPlus, Download, MapPin, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Folha } from '@/components/Folha';
import { EtiquetaTroca, Placa } from '@/components/pecas';
import { Botao, classeBotao } from '@/components/ui';
import { decodificarCartao, type DadosCartao } from '@/lib/cartao';
import { diasEntre, formatarData, formatarDataCurta, hojeISO } from '@/lib/datas';
import { formatarKm, formatarTelefone } from '@/lib/formatos';
import { gerarIcs, linkGoogleAgenda, type EventoCalendario } from '@/lib/ics';
import { servico } from '@/lib/manutencao';
import { linkWhatsApp, listaDeServicos } from '@/lib/whatsapp';

type ItemCartao = DadosCartao['i'][number];

function baixarIcs(eventos: EventoCalendario[], nome: string) {
  const url = URL.createObjectURL(new Blob([gerarIcs(eventos)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** O lembrete de um item do cartão, como vai para o calendário. */
function eventoDoItem(c: DadosCartao, i: ItemCartao): EventoCalendario | null {
  const data = i.d ?? i.l;
  if (!data) return null;
  const oficina = `${c.o.n}${c.o.w ? `, WhatsApp ${formatarTelefone(c.o.w)}` : ''}`;
  return {
    uid: `${c.car.p}-${i.s}-${data}@revisai.howlks.com`,
    titulo: `${servico(i.s).nome} do ${c.car.m}`,
    data,
    descricao: `${servico(i.s).nome}: até ${formatarData(i.l ?? data)}${i.k ? ` ou ${formatarKm(i.k)}` : ''}, o que vier primeiro. Oficina: ${oficina}.`
  };
}

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

  return <Cartao c={estado} hoje={hoje} />;
}

function Cartao({ c, hoje }: { c: DadosCartao; hoje: string }) {
  const [aberto, setAberto] = useState<ItemCartao | null>(null);
  const itens = [...c.i].sort((a, b) => ((a.d ?? '9') < (b.d ?? '9') ? -1 : 1));
  const proximos = itens.filter((i) => i.d);
  const mensagem = `Oi! Aqui é ${c.c || 'o cliente'}, do ${c.car.m} placa ${c.car.p}. Vi no cartão de manutenção que ${listaDeServicos(proximos.slice(0, 3).map((i) => i.s)).texto} ${proximos.length > 1 ? 'estão chegando' : 'está chegando'}. Quero agendar um horário.`;
  const zap = c.o.w ? linkWhatsApp(c.o.w, mensagem) : null;

  function calendario() {
    const eventos = proximos.map((i) => eventoDoItem(c, i)).filter((e): e is EventoCalendario => !!e);
    baixarIcs(eventos, `manutencao-${c.car.p}.ics`);
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
        <p className="max-w-[60ch] text-tinta-2">Cada item vence pela data ou pela quilometragem, o que vier primeiro. Toque num item para pôr o lembrete no calendário.</p>
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
              <button
                type="button"
                onClick={() => setAberto(i)}
                className="rounded-xl transition-transform hover:-rotate-1 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-caneta active:scale-[0.98]"
                aria-label={`${servico(i.s).nome}: lembrete e agendamento`}
              >
                <EtiquetaTroca data={i.l ?? i.d} km={i.k} situacao={situacao} titulo={servico(i.s).nome} />
              </button>
              {i.l && i.d && i.d < i.l ? <p className="text-[13px] font-semibold text-tinta">Pela sua rodagem, por volta de {formatarDataCurta(i.d)}</p> : null}
              <p className="text-[13px] text-tinta-2">
                Feito em {formatarDataCurta(i.f)}/{i.f.slice(2, 4)} com {formatarKm(i.fk)}
              </p>
            </div>
          );
        })}
      </div>

      <FolhaDoItem c={c} item={aberto} aoFechar={() => setAberto(null)} />

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

function FolhaDoItem({ c, item, aoFechar }: { c: DadosCartao; item: ItemCartao | null; aoFechar: () => void }) {
  const evento = item ? eventoDoItem(c, item) : null;
  const nome = item ? servico(item.s).nome : '';
  const zap =
    item && c.o.w
      ? linkWhatsApp(c.o.w, `Oi! Aqui é ${c.c || 'o cliente'}, do ${c.car.m} placa ${c.car.p}. Vi no cartão de manutenção que ${servico(item.s).frase} está chegando. Quero agendar um horário.`)
      : null;
  return (
    <Folha
      aberta={item != null}
      aoFechar={aoFechar}
      titulo={item ? `${nome} do ${c.car.m}` : ''}
      descricao={
        item
          ? `Até ${formatarData(item.l ?? item.d)}${item.k ? ` ou ${formatarKm(item.k)}` : ''}, o que vier primeiro.${item.l && item.d && item.d < item.l ? ` Pela sua rodagem, por volta de ${formatarData(item.d)}.` : ''}`
          : undefined
      }
    >
      {item ? (
        <div className="flex flex-col gap-4">
          <p className="text-[14.5px] text-tinta-2">
            Feito em {formatarData(item.f)} com {formatarKm(item.fk)} na {c.o.n}.
          </p>
          {evento ? (
            <div className="flex flex-col gap-2">
              <a href={linkGoogleAgenda(evento)} target="_blank" rel="noopener noreferrer" className={classeBotao('escuro', 'grande')}>
                <CalendarDays size={18} aria-hidden="true" /> Pôr no Google Agenda
              </a>
              <Botao tamanho="grande" onClick={() => baixarIcs([evento], `${item.s}-${c.car.p}.ics`)}>
                <Download size={18} /> Calendário do iPhone ou outro
              </Botao>
              <p className="text-[13px] text-tinta-3">O lembrete toca uma semana antes.</p>
            </div>
          ) : (
            <p className="text-[14.5px] text-tinta-2">Este item vence só pela quilometragem. Confira o painel do carro de vez em quando.</p>
          )}
          {zap ? (
            <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'grande')}>
              <MessageCircle size={18} aria-hidden="true" /> Agendar com a oficina
            </a>
          ) : null}
        </div>
      ) : null}
    </Folha>
  );
}
