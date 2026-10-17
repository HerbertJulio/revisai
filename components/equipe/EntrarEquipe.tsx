'use client';

import { KeyRound, LockKeyhole, Mail, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { comecarCadastroDoApp, conferirCodigo, confirmarCadastroDoApp, confirmarCodigoDoApp, pedirCodigo, sairDaEquipe } from '@/app/admin/entrar/acoes';
import { Logo } from '@/components/marca';
import { QrCode } from '@/components/QrCode';
import { Botao, Campo, classeEntrada } from '@/components/ui';

export function TelaDaEquipe({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
        <Logo />
        <h1 className="largo mt-6 text-[26px] leading-tight">Área da equipe</h1>
        <p className="mt-1.5 mb-6 text-[15px] text-tinta-2">Entrada com o código do e-mail e o app autenticador.</p>
        {children}
      </div>
    </main>
  );
}

function CampoCodigo({ id, rotulo, valor, aoMudar, erro, dica }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; erro: string | null; dica?: string }) {
  return (
    <Campo rotulo={rotulo} erro={erro} dica={dica} htmlFor={id}>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={12}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className={`${classeEntrada} num text-center text-[22px] tracking-[0.3em]`}
        autoFocus
        required
      />
    </Campo>
  );
}

/** Os passos da entrada: e-mail e código; depois o app autenticador (cadastrar ou confirmar). */
export function EntrarEquipe({ passo, email: emailDaSessao }: { passo: 'email' | 'cadastrar' | 'confirmar'; email?: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [cadastro, setCadastro] = useState<{ fatorId: string; uri: string; segredo: string } | null>(null);

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; naoExiste?: boolean }>, depois: () => void) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.ok) return depois();
        if (r.naoExiste) return router.replace('/nao-encontrado');
        setErro(r.erro ?? 'Não deu certo. Tente de novo.');
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  const entrar = () => {
    router.replace('/admin');
    router.refresh();
  };

  if (passo === 'email' && !codigoEnviado)
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          rodar(() => pedirCodigo(email), () => setCodigoEnviado(true));
        }}
      >
        <Campo rotulo="E-mail" erro={erro} htmlFor="eq-email">
          <input id="eq-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} className={classeEntrada} autoFocus required />
        </Campo>
        <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
          <Mail size={18} aria-hidden="true" /> {ocupado ? 'Mandando…' : 'Receber o código'}
        </Botao>
      </form>
    );

  if (passo === 'email')
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          rodar(() => conferirCodigo(email, codigo), () => {
            setCodigo('');
            router.refresh();
          });
        }}
      >
        <p className="rounded-xl bg-caneta-claro px-4 py-3 text-[14px] text-caneta">Se o e-mail for da equipe, o código chega em até 1 minuto.</p>
        <CampoCodigo id="eq-codigo" rotulo="Código do e-mail" valor={codigo} aoMudar={setCodigo} erro={erro} />
        <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
          {ocupado ? 'Conferindo…' : 'Continuar'}
        </Botao>
        <button type="button" className="self-start text-[14px] font-semibold text-tinta-2 hover:text-tinta" onClick={() => (setCodigoEnviado(false), setCodigo(''), setErro(null))}>
          Outro e-mail
        </button>
      </form>
    );

  const rodape = (
    <form action={sairDaEquipe} className="mt-2">
      <p className="text-[13px] text-tinta-3">
        {emailDaSessao ? `Entrou como ${emailDaSessao}. ` : ''}
        <button type="submit" className="font-semibold text-tinta-2 underline hover:text-tinta">
          Sair
        </button>
      </p>
    </form>
  );

  if (passo === 'confirmar')
    return (
      <div className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            rodar(() => confirmarCodigoDoApp(codigo), entrar);
          }}
        >
          <p className="flex items-start gap-2 text-[15px] text-tinta-2">
            <Smartphone size={18} className="mt-0.5 shrink-0" aria-hidden="true" /> Abra o app autenticador e digite o código do Revisaí.
          </p>
          <CampoCodigo id="eq-app" rotulo="Código do app" valor={codigo} aoMudar={setCodigo} erro={erro} dica="O código muda a cada 30 segundos. Ele vale por 12 horas de painel." />
          <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
            <LockKeyhole size={18} aria-hidden="true" /> {ocupado ? 'Conferindo…' : 'Entrar'}
          </Botao>
        </form>
        {rodape}
      </div>
    );

  // cadastrar o app autenticador (obrigatório para a equipe)
  return (
    <div className="flex flex-col gap-4">
      {!cadastro ? (
        <>
          <p className="text-[15px] text-tinta-2">
            A equipe entra com um segundo fator. Instale um app autenticador no celular (Google Authenticator, Microsoft Authenticator ou 1Password, por exemplo) e cadastre o Revisaí nele.
          </p>
          {erro ? (
            <p className="text-sm text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
          <Botao
            variante="escuro"
            tamanho="grande"
            disabled={ocupado}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                try {
                  const r = await comecarCadastroDoApp();
                  if (r.ok) return setCadastro({ fatorId: r.fatorId, uri: r.uri, segredo: r.segredo });
                  if ('naoExiste' in r && r.naoExiste) return router.replace('/nao-encontrado');
                  setErro(r.erro);
                } catch {
                  setErro('Sem conexão com o servidor. Tente de novo.');
                }
              })
            }
          >
            <KeyRound size={18} aria-hidden="true" /> {ocupado ? 'Preparando…' : 'Cadastrar o app'}
          </Botao>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            rodar(() => confirmarCadastroDoApp(cadastro.fatorId, codigo), entrar);
          }}
        >
          <p className="text-[15px] text-tinta-2">No app, toque em adicionar e aponte a câmera para o QR. Sem câmera, digite o código abaixo.</p>
          <div className="mx-auto w-48 rounded-xl bg-white p-2 ring-1 ring-linha">
            <QrCode texto={cadastro.uri} rotulo="QR para cadastrar o Revisaí no app autenticador" className="h-auto w-full" />
          </div>
          <p className="num rounded-xl bg-papel-2 px-3 py-2 text-center text-[14px] font-semibold tracking-wider break-all select-all">{cadastro.segredo}</p>
          <CampoCodigo id="eq-novo" rotulo="Código que o app mostra" valor={codigo} aoMudar={setCodigo} erro={erro} />
          <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
            {ocupado ? 'Conferindo…' : 'Confirmar e entrar'}
          </Botao>
        </form>
      )}
      {rodape}
    </div>
  );
}
