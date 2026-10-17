'use client';

import { ArrowLeft, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';

const ERROS_DO_LINK: Record<string, string> = {
  link: 'O link de entrada não vale mais. Peça um código novo.',
  google: 'Não deu para entrar com o Google. Tente de novo ou use o e-mail.'
};

/** Mensagem do GoTrue para a pessoa. */
export function mensagemDeEntrada(e: { message?: string; status?: number; code?: string } | null): string {
  const m = (e?.message ?? '').toLowerCase();
  if (e?.code === 'over_email_send_rate_limit' || m.includes('rate limit') || e?.status === 429) return 'Muitos códigos pedidos seguidos. Espere alguns minutos e tente de novo.';
  if (e?.code === 'otp_expired' || m.includes('expired') || m.includes('invalid')) return 'Código errado ou vencido. Confira ou peça outro.';
  if (m.includes('signups not allowed')) return 'Novas contas estão fechadas no momento.';
  if (m.includes('email address') && m.includes('invalid')) return 'Confira o e-mail.';
  return 'Não deu para entrar agora. Confira a internet e tente de novo.';
}

export function FormEntrar({ config, para, google, erro: erroInicial, aoEntrar }: { config: ConfigPublica; para: string; google: boolean; erro?: string | null; aoEntrar?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [passo, setPasso] = useState<'email' | 'codigo'>('email');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(erroInicial ? (ERROS_DO_LINK[erroInicial] ?? null) : null);
  const [aviso, setAviso] = useState<string | null>(null);

  const sb = () => clienteNavegador(config);

  async function pedirCodigo(e?: FormEvent) {
    e?.preventDefault();
    const limpo = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpo)) {
      setErro('Confira o e-mail.');
      return;
    }
    setOcupado(true);
    setErro(null);
    const { error } = await sb().auth.signInWithOtp({
      email: limpo,
      options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/auth/confirmar?para=${encodeURIComponent(para)}` }
    });
    setOcupado(false);
    if (error) {
      setErro(mensagemDeEntrada(error));
      return;
    }
    setEmail(limpo);
    setPasso('codigo');
    setAviso(`Mandamos um código para ${limpo}. Ele chega em até 1 minuto (olhe também o spam).`);
  }

  async function conferir(e: FormEvent) {
    e.preventDefault();
    const token = codigo.replace(/\D/g, '');
    if (token.length < 6) {
      setErro('O código tem 6 números.');
      return;
    }
    setOcupado(true);
    setErro(null);
    const { error } = await sb().auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      setOcupado(false);
      setErro(mensagemDeEntrada(error));
      return;
    }
    if (aoEntrar) {
      setOcupado(false);
      aoEntrar();
      return;
    }
    router.replace(`/conta?para=${encodeURIComponent(para)}`);
    router.refresh();
  }

  async function entrarComGoogle() {
    setOcupado(true);
    setErro(null);
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?para=${encodeURIComponent(para)}`, queryParams: { prompt: 'select_account' } }
    });
    if (error) {
      setOcupado(false);
      setErro(mensagemDeEntrada(error));
    }
  }

  if (passo === 'codigo')
    return (
      <form onSubmit={conferir} className="flex flex-col gap-4">
        {aviso ? <p className="rounded-xl bg-caneta-claro px-4 py-3 text-[14px] text-caneta">{aviso}</p> : null}
        <Campo rotulo="Código do e-mail" erro={erro} htmlFor="codigo-entrada">
          <input
            id="codigo-entrada"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className={`${classeEntrada} num text-center text-[22px] tracking-[0.3em]`}
            autoFocus
            required
          />
        </Campo>
        <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
          {ocupado ? 'Conferindo…' : 'Entrar'}
        </Botao>
        <div className="flex items-center justify-between text-[14px]">
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-tinta-2 hover:text-tinta" onClick={() => (setPasso('email'), setCodigo(''), setErro(null))}>
            <ArrowLeft size={15} aria-hidden="true" /> Outro e-mail
          </button>
          <button type="button" className="font-semibold text-caneta hover:underline disabled:opacity-50" disabled={ocupado} onClick={() => void pedirCodigo()}>
            Mandar de novo
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex flex-col gap-4">
      {google ? (
        <>
          <Botao variante="secundario" tamanho="grande" onClick={entrarComGoogle} disabled={ocupado}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Entrar com Google
          </Botao>
          <div className="flex items-center gap-3 text-[13px] text-tinta-3">
            <span className="h-px flex-1 bg-linha" />
            ou com o e-mail
            <span className="h-px flex-1 bg-linha" />
          </div>
        </>
      ) : null}
      <form onSubmit={pedirCodigo} className="flex flex-col gap-4">
        <Campo rotulo="Seu e-mail" erro={erro} dica="Mandamos um código de 6 números. Sem senha para lembrar." htmlFor="email-entrada">
          <input
            id="email-entrada"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={classeEntrada}
            autoFocus={!google}
            required
          />
        </Campo>
        <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
          <Mail size={18} aria-hidden="true" />
          {ocupado ? 'Mandando…' : 'Receber o código'}
        </Botao>
      </form>
    </div>
  );
}
