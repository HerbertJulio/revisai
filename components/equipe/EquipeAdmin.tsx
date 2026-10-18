'use client';

import { Copy, UserPlus, X } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { cancelarConviteDaEquipe, convidarParaEquipe, mudarPessoaDaEquipe } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeEntrada } from '@/components/ui';
import { PAPEIS_EQUIPE, type PapelEquipe } from '@/lib/conta-dados';
import { quandoFoi } from '@/lib/equipe-dados';
import { emailValido } from '@/lib/equipe/entrada';
import { nomeDoPapelEquipe } from '@/lib/equipe/papeis';
import type { ConviteEquipe, MembroEquipe } from '@/lib/equipe/tipos';
import { AvisoErro } from './comum';

function mensagemDoConvite(email: string, entrada: string): string {
  return `Você foi convidado para a equipe do Revisaí. Entre em ${entrada} com o e-mail ${email}, digite o código que chegar e cadastre o app autenticador no celular (Google Authenticator, Microsoft Authenticator ou 1Password). O convite fica valendo até você entrar.`;
}

export function EquipeAdmin({ membros, convites, eu, entrada, agora }: { membros: MembroEquipe[]; convites: ConviteEquipe[]; eu: string; entrada: string; agora: number }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<PapelEquipe>('suporte');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function convidar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const limpo = email.trim().toLowerCase();
    if (!emailValido(limpo)) return setErro('Confira o e-mail.');
    iniciar(async () => {
      try {
        const r = await convidarParaEquipe(limpo, papel, nome);
        if (!r.ok) return setErro(r.erro);
        setEmail('');
        setNome('');
        toast({ texto: `Convite feito para ${limpo}. Avise a pessoa para entrar com esse e-mail.` });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function mudar(m: MembroEquipe, novoPapel: PapelEquipe, ativo: boolean) {
    const pergunta = !ativo
      ? `Tirar ${m.email} da equipe? A pessoa perde o acesso ao painel na hora.`
      : !m.ativo
        ? `Devolver o acesso de ${m.email} ao painel?`
        : `Mudar ${m.email} para ${nomeDoPapelEquipe(novoPapel)}?`;
    if (!window.confirm(pergunta)) return;
    iniciar(async () => {
      try {
        const r = await mudarPessoaDaEquipe(m.userId, novoPapel, ativo);
        toast(r.ok ? { texto: 'Pronto.' } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  function cancelar(c: ConviteEquipe) {
    if (!window.confirm(`Cancelar o convite de ${c.email}?`)) return;
    iniciar(async () => {
      try {
        const r = await cancelarConviteDaEquipe(c.email);
        toast(r.ok ? { texto: 'Convite cancelado.' } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Mensagem copiada.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o texto e copie.', tom: 'erro' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="t-pessoas">
        <h2 id="t-pessoas" className="text-[21px]">
          Pessoas
        </h2>
        {membros.length ? (
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {membros.map((m) => {
              const sou = m.userId === eu;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold break-all">
                      {m.email}
                      {sou ? <Chip tom="caneta">Você</Chip> : null}
                      {!m.ativo ? <Chip tom="atraso">Sem acesso</Chip> : null}
                    </p>
                    <p className="text-[13.5px] text-tinta-3">
                      {[m.nome, m.ultimoAcesso ? `entrou ${quandoFoi(m.ultimoAcesso, agora)}` : 'ainda não entrou', `na equipe desde ${quandoFoi(m.criadoEm, agora)}`].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-[14px] font-semibold text-tinta-2">
                    <span className="sr-only">Papel de {m.email}</span>
                    <select
                      value={m.papel}
                      disabled={ocupado || sou || !m.ativo}
                      onChange={(e) => mudar(m, e.target.value as PapelEquipe, true)}
                      className="h-9 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[14px] font-semibold text-tinta disabled:opacity-60"
                    >
                      {PAPEIS_EQUIPE.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  {sou ? null : m.ativo ? (
                    <Botao tamanho="pequeno" variante="perigo" onClick={() => mudar(m, m.papel, false)} disabled={ocupado}>
                      Tirar acesso
                    </Botao>
                  ) : (
                    <Botao tamanho="pequeno" onClick={() => mudar(m, m.papel, true)} disabled={ocupado}>
                      Devolver acesso
                    </Botao>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio titulo="Ninguém na equipe ainda" />
        )}
        <ul className="grid grid-cols-1 gap-2 text-[13.5px] text-tinta-3 sm:grid-cols-3">
          {PAPEIS_EQUIPE.map((p) => (
            <li key={p.id}>
              <span className="font-semibold text-tinta-2">{p.nome}:</span> {p.descricao}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="t-convidar">
        <h2 id="t-convidar" className="text-[21px]">
          Convidar
        </h2>
        <form onSubmit={convidar} className="grid grid-cols-1 gap-4 rounded-2xl bg-papel p-4 ring-1 ring-linha sm:grid-cols-6 sm:p-5">
          <Campo rotulo="E-mail" htmlFor="eq-conv-email" className="sm:col-span-3">
            <input id="eq-conv-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} className={classeEntrada} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo rotulo="Nome (opcional)" htmlFor="eq-conv-nome" className="sm:col-span-3">
            <input id="eq-conv-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
          </Campo>
          <div className="sm:col-span-6">
            <p className="mb-2 text-[14px] font-semibold">Papel</p>
            <div className="flex flex-wrap gap-2">
              {PAPEIS_EQUIPE.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={papel === p.id}
                  onClick={() => setPapel(p.id)}
                  className={`h-10 rounded-full border px-4 text-[14px] font-semibold ${papel === p.id ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                >
                  {p.nome}
                </button>
              ))}
            </div>
          </div>
          {erro ? (
            <div className="sm:col-span-6">
              <AvisoErro>{erro}</AvisoErro>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
            <Botao type="submit" variante="escuro" disabled={ocupado}>
              <UserPlus size={16} aria-hidden="true" /> {ocupado ? 'Convidando…' : 'Convidar'}
            </Botao>
            <p className="text-[13.5px] text-tinta-3">A pessoa entra em {entrada} com esse e-mail e cadastra o app autenticador. Só então ela vira da equipe.</p>
          </div>
        </form>

        {convites.length ? (
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {convites.map((c) => (
              <li key={c.email} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-all">{c.email}</p>
                  <p className="text-[13.5px] text-tinta-3">{[c.nome, `${nomeDoPapelEquipe(c.papel)}`, `convidado ${quandoFoi(c.criadoEm, agora)}`].filter(Boolean).join(', ')}</p>
                </div>
                <Botao tamanho="pequeno" onClick={() => void copiar(mensagemDoConvite(c.email, entrada))}>
                  <Copy size={15} /> Copiar aviso
                </Botao>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-papel-2 hover:text-atraso"
                  aria-label={`Cancelar o convite de ${c.email}`}
                  onClick={() => cancelar(c)}
                  disabled={ocupado}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
