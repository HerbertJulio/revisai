'use client';

import { Download, Search } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { consultarRegistrosDeAcesso } from '@/app/admin/acoes';
import { Botao, Campo, Vazio, classeEntrada } from '@/components/ui';
import type { RegistroDeAcesso } from '@/lib/equipe/tipos';
import { plural } from '@/lib/formatos';
import { AvisoErro } from './comum';

const formato = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

function csv(registros: RegistroDeAcesso[]): string {
  const campo = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = registros.map((r) => [r.quando, r.userId, r.ip, r.porta, r.rota, r.agente].map(campo).join(','));
  return ['"quando (UTC)","conta","ip","porta","rota","navegador"', ...linhas].join('\r\n');
}

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A consulta dos registros de acesso (data, hora, IP e porta) para atender uma ordem judicial. */
export function ConsultaAcessos() {
  const [email, setEmail] = useState('');
  const [ip, setIp] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ registros: RegistroDeAcesso[]; alvo: string } | null>(null);
  const [ocupado, iniciar] = useTransition();

  function consultar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (motivo.trim().length < 5) return setErro('Escreva o motivo, como o número do processo ou do ofício.');
    if (!email.trim() && !ip.trim()) return setErro('Diga o e-mail da conta ou o IP.');
    iniciar(async () => {
      try {
        const r = await consultarRegistrosDeAcesso({ email, ip, de, ate, motivo });
        if (!r.ok) return setErro(r.erro);
        setResultado({ registros: r.registros, alvo: email.trim() || ip.trim() });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-2xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta sm:px-5">
        Os registros de acesso ficam em sigilo por 6 meses (Marco Civil da Internet, art. 15) e só saem com ordem judicial. Cada consulta fica no histórico da equipe com o motivo e quem consultou.
      </p>
      <form onSubmit={consultar} className="grid gap-4 rounded-2xl bg-papel p-4 ring-1 ring-linha sm:grid-cols-6 sm:p-5">
        <Campo rotulo="E-mail da conta" htmlFor="ac-email" className="sm:col-span-3">
          <input id="ac-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} className={classeEntrada} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="ou o IP" htmlFor="ac-ip" className="sm:col-span-3">
          <input id="ac-ip" className={classeEntrada} value={ip} onChange={(e) => setIp(e.target.value)} placeholder="200.100.50.25" />
        </Campo>
        <Campo rotulo="De" htmlFor="ac-de" className="sm:col-span-2">
          <input id="ac-de" type="date" className={classeEntrada} value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até" htmlFor="ac-ate" className="sm:col-span-2">
          <input id="ac-ate" type="date" className={classeEntrada} value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        <Campo rotulo="Motivo" htmlFor="ac-motivo" className="sm:col-span-6" dica="O número do processo ou do ofício e quem pediu. Fica no histórico.">
          <input id="ac-motivo" className={classeEntrada} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        </Campo>
        {erro ? (
          <div className="sm:col-span-6">
            <AvisoErro>{erro}</AvisoErro>
          </div>
        ) : null}
        <div className="sm:col-span-6">
          <Botao type="submit" variante="escuro" disabled={ocupado}>
            <Search size={16} aria-hidden="true" /> {ocupado ? 'Consultando…' : 'Consultar'}
          </Botao>
        </div>
      </form>

      {resultado ? (
        resultado.registros.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="t-registros">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="t-registros" className="text-[21px]">
                {plural(resultado.registros.length, 'registro', 'registros')}
              </h2>
              <Botao tamanho="pequeno" onClick={() => baixar(`acessos-${resultado.alvo.replace(/[^a-z0-9.]+/gi, '-')}.csv`, csv(resultado.registros))}>
                <Download size={15} /> Baixar planilha (CSV)
              </Botao>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-papel ring-1 ring-linha">
              <table className="w-full min-w-[640px] text-left text-[13.5px]">
                <thead className="bg-papel-2 text-[12.5px] text-tinta-3">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Quando (Brasília)
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      IP e porta
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Página
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Navegador
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {resultado.registros.map((r, i) => (
                    <tr key={`${r.quando}-${i}`}>
                      <td className="num px-4 py-2 whitespace-nowrap">{formato.format(new Date(r.quando))}</td>
                      <td className="num px-3 py-2 whitespace-nowrap">
                        {r.ip}
                        {r.porta != null ? `:${r.porta}` : ''}
                      </td>
                      <td className="px-3 py-2">{r.rota}</td>
                      <td className="max-w-[320px] truncate px-4 py-2 text-tinta-3" title={r.agente ?? ''}>
                        {r.agente}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <Vazio titulo="Nenhum registro">Não há acessos guardados para essa busca nesse período. Os registros ficam 6 meses.</Vazio>
        )
      ) : null}
    </div>
  );
}
