'use client';

// A página que a oficina manda para o cliente: escolhe o dia, a hora livre, escreve nome, WhatsApp,
// placa e o serviço, e pede. A oficina confirma pelo WhatsApp.

import { CalendarCheck, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Botao, Campo, classeArea, classeEntrada } from '@/components/ui';
import { diasEntre, formatarDataCurta } from '@/lib/datas';
import { DIAS_CURTOS, diaDaSemana, horaCurta, NOMES_DIAS } from '@/lib/horarios';
import { atualizarHorarios, pedirHorario } from './acoes';
import type { AgendaPublica, DiaLivre } from './dados';

function nomeDoDia(data: string, hoje: string): string {
  const d = diasEntre(hoje, data);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  return DIAS_CURTOS[diaDaSemana(data)];
}

export function AgendarCliente({ slug, agenda, inicial }: { slug: string; agenda: AgendaPublica; inicial: DiaLivre[] }) {
  const [livres, setLivres] = useState<DiaLivre[]>(inicial);
  const [dia, setDia] = useState<string | null>(inicial[0]?.data ?? null);
  const [hora, setHora] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [placa, setPlaca] = useState('');
  const [servico, setServico] = useState(agenda.config.servicos.length === 1 ? agenda.config.servicos[0] : '');
  const [observacao, setObservacao] = useState('');
  const [consentimento, setConsentimento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<{ data: string; hora: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  const o = agenda.oficina;
  const horas = useMemo(() => livres.find((d) => d.data === dia)?.horas ?? [], [livres, dia]);
  const endereco = [o.endereco, [o.cidade, o.uf].filter(Boolean).join('/')].filter(Boolean).join(', ');

  // a página ficou aberta: os horários livres de novo quando ela volta para a frente
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible' || enviado) return;
      void atualizarHorarios(slug).then((l) => l && setLivres(l));
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [slug, enviado]);

  useEffect(() => {
    if (dia && !livres.some((d) => d.data === dia)) setDia(livres[0]?.data ?? null);
    if (hora && !horas.includes(hora)) setHora(null);
  }, [livres, dia, hora, horas]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!dia || !hora) return setErro('Escolha o dia e a hora.');
    if (nome.trim().length < 2) return setErro('Escreva o seu nome.');
    if (telefone.replace(/\D/g, '').length < 10) return setErro('Escreva o seu WhatsApp, com DDD.');
    if (!servico.trim()) return setErro('Escolha o serviço.');
    if (!consentimento) return setErro('Marque que concorda em enviar seus dados para a oficina.');
    setErro(null);
    iniciar(async () => {
      const r = await pedirHorario(slug, { data: dia, hora, nome, telefone, placa, servico, observacao, consentimento });
      if (r.ok) {
        setEnviado({ data: r.data, hora: r.hora });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setErro(r.erro);
      if (r.horarios) {
        setLivres(r.horarios);
        setHora(null);
      }
    });
  }

  if (enviado) {
    return (
      <div className="flex flex-col items-start gap-4" role="status">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ok-claro text-ok">
          <CalendarCheck size={28} aria-hidden="true" />
        </span>
        <h1 className="largo text-[28px] leading-tight">Pedido enviado. A oficina confirma pelo WhatsApp.</h1>
        <p className="text-[17px] text-tinta-2">
          {o.nome}, {NOMES_DIAS[diaDaSemana(enviado.data)].toLowerCase()}, {formatarDataCurta(enviado.data)}, às {horaCurta(enviado.hora)}
          {servico ? ` (${servico.toLowerCase()})` : ''}.
        </p>
        {endereco ? (
          <p className="flex items-start gap-2 text-[15px] text-tinta-2">
            <MapPin size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> {endereco}
          </p>
        ) : null}
        <p className="text-[14px] text-tinta-3">O horário fica garantido quando a oficina responder. Se precisar mudar, fale com ela pelo WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-[14px] font-semibold text-tinta-3">Agendar horário</p>
        <h1 className="largo text-[28px] leading-tight sm:text-[32px]">{o.nome}</h1>
        {endereco ? (
          <p className="flex items-start gap-2 text-[15px] text-tinta-2">
            <MapPin size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> {endereco}
          </p>
        ) : null}
        {agenda.config.mensagem ? <p className="mt-1 rounded-xl bg-papel-2 px-3.5 py-2.5 text-[15px]">{agenda.config.mensagem}</p> : null}
      </header>

      {!livres.length ? (
        <p className="rounded-2xl bg-papel px-4 py-4 text-tinta-2 ring-1 ring-linha">Não há horário livre nos próximos {agenda.config.diasAFrente} dias. Fale com a oficina pelo WhatsApp.</p>
      ) : (
        <form className="flex flex-col gap-6" onSubmit={enviar} noValidate>
          <section className="flex flex-col gap-2">
            <h2 className="text-[18px]">1. Escolha o dia</h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Dia">
              {livres.map((d) => {
                const sel = d.data === dia;
                return (
                  <button
                    key={d.data}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => {
                      setDia(d.data);
                      setHora(null);
                    }}
                    className={`flex h-16 w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border text-center ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta hover:border-tinta-3'}`}
                  >
                    <span className="text-[13px] font-semibold first-letter:uppercase">{nomeDoDia(d.data, agenda.hoje)}</span>
                    <span className="largo num text-[17px] font-extrabold">{formatarDataCurta(d.data)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {dia ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-[18px]">2. Escolha a hora</h2>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Hora">
                {horas.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={hora === h}
                    onClick={() => setHora(h)}
                    className={`num h-11 rounded-lg border text-[15px] font-semibold ${hora === h ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta hover:border-tinta-3'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-4">
            <h2 className="text-[18px]">3. Seus dados</h2>
            <Campo rotulo="Nome" htmlFor="c-nome">
              <input id="c-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={80} required />
            </Campo>
            <Campo rotulo="WhatsApp" htmlFor="c-tel" dica="A oficina confirma por aqui.">
              <input id="c-tel" type="tel" inputMode="tel" className={classeEntrada} value={telefone} onChange={(e) => setTelefone(e.target.value)} autoComplete="tel-national" placeholder="(21) 98765-4321" required />
            </Campo>
            <Campo rotulo="Placa do carro" htmlFor="c-placa" dica="Opcional.">
              <input id="c-placa" className={`${classeEntrada} uppercase`} value={placa} onChange={(e) => setPlaca(e.target.value)} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="ABC1D23" />
            </Campo>
            <Campo rotulo="Serviço" htmlFor="c-servico">
              {agenda.config.servicos.length ? (
                <select id="c-servico" className={classeEntrada} value={servico} onChange={(e) => setServico(e.target.value)} required>
                  <option value="">Escolha</option>
                  {agenda.config.servicos.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="c-servico" className={classeEntrada} value={servico} onChange={(e) => setServico(e.target.value)} maxLength={80} required />
              )}
            </Campo>
            <Campo rotulo="Observação" htmlFor="c-obs" dica="Opcional. Ex.: barulho no freio.">
              <textarea id="c-obs" rows={2} className={classeArea} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} />
            </Campo>
            <label className="flex items-start gap-3 text-[14.5px] leading-snug">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--tinta)]" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
              <span>
                Concordo em enviar meu nome, WhatsApp e placa para a {o.nome} marcar o horário e falar comigo.{' '}
                <Link href="/privacidade" target="_blank" className="font-semibold text-caneta underline">
                  Privacidade
                </Link>
              </span>
            </label>
          </section>

          {erro ? (
            <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[15px] text-atraso" role="alert">
              {erro}
            </p>
          ) : null}

          <Botao type="submit" variante="primario" tamanho="grande" disabled={enviando} className="w-full sm:w-auto">
            {enviando ? 'Enviando...' : hora && dia ? `Pedir ${nomeDoDia(dia, agenda.hoje)}, ${formatarDataCurta(dia)}, às ${horaCurta(hora)}` : 'Pedir o horário'}
          </Botao>
        </form>
      )}
    </div>
  );
}
