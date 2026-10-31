'use client';

import { ArrowLeft, Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';
import { Captcha } from './Captcha';

const ERROS_DO_LINK: Record<string, string> = {
  link: 'O link não vale mais. Entre de novo com a sua senha.',
  google: 'Não deu para entrar com o Google. Tente de novo ou use o e-mail e a senha.'
};

/** Tamanho mínimo de senha que o servidor aceita por padrão. */
const SENHA_MINIMA = 6;

type ErroDeEntrada = { message?: string; status?: number; code?: string } | null;

/** Mensagem do GoTrue para a pessoa, já no caso de e-mail e senha. */
export function mensagemDeEntrada(e: ErroDeEntrada): string {
  const m = (e?.message ?? '').toLowerCase();
  if (e?.code === 'invalid_credentials' || m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha errados. Confira os dois.';
  if (e?.code === 'email_not_confirmed' || m.includes('not confirmed')) return 'Confirme o seu e-mail antes de entrar. O link foi para a sua caixa de entrada.';
  if (e?.code === 'user_already_exists' || e?.code === 'email_exists' || m.includes('already registered') || m.includes('already been registered')) return 'Já existe conta com esse e-mail. Entre com a sua senha.';
  if (e?.code === 'weak_password' || m.includes('password should be') || m.includes('weak password')) return `A senha é fraca. Use ao menos ${SENHA_MINIMA} caracteres.`;
  if (e?.code === 'over_request_rate_limit' || e?.code === 'over_email_send_rate_limit' || m.includes('rate limit') || e?.status === 429) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
  if (e?.code === 'signup_disabled' || m.includes('signups not allowed')) return 'Novas contas estão fechadas no momento.';
  if (e?.code === 'email_address_invalid' || (m.includes('email address') && m.includes('invalid'))) return 'Confira o e-mail.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  return 'Não deu para entrar agora. Confira a internet e tente de novo.';
}

type Modo = 'entrar' | 'criar' | 'esqueci';

function emailValido(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

export function FormEntrar({ config, para, google, erro: erroInicial, aoEntrar }: { config: ConfigPublica; para: string; google: boolean; erro?: string | null; aoEntrar?: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(erroInicial ? (ERROS_DO_LINK[erroInicial] ?? null) : null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [rodadaCaptcha, setRodadaCaptcha] = useState(0);

  const sb = () => clienteNavegador(config);

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro(null);
    setAviso(null);
    setSenha('');
    setSenha2('');
  }

  function zerarCaptcha() {
    if (config.captcha) {
      setCaptcha(null);
      setRodadaCaptcha((r) => r + 1);
    }
  }

  function depoisDeEntrar() {
    if (aoEntrar) {
      setOcupado(false);
      aoEntrar();
      return;
    }
    router.replace(`/conta?para=${encodeURIComponent(para)}`);
    router.refresh();
  }

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (ocupado) return;
    const limpo = email.trim().toLowerCase();
    if (!emailValido(limpo)) {
      setErro('Confira o e-mail.');
      return;
    }
    if (config.captcha && !captcha) {
      setErro('Espere a verificação de segurança terminar e tente de novo.');
      return;
    }
    const comCaptcha = captcha ? { captchaToken: captcha } : {};

    if (modo === 'esqueci') {
      setOcupado(true);
      setErro(null);
      const { error } = await sb()
        .auth.resetPasswordForEmail(limpo, { redirectTo: `${location.origin}/auth/redefinir?para=${encodeURIComponent(para)}`, ...comCaptcha })
        .catch((x: unknown) => ({ error: { message: String((x as Error)?.message ?? x) } }));
      setOcupado(false);
      zerarCaptcha();
      if (error) {
        setErro(mensagemDeEntrada(error));
        return;
      }
      setEmail(limpo);
      setAviso(`Mandamos um link para ${limpo}. Abra e escolha uma senha nova (olhe também o spam).`);
      return;
    }

    if (modo === 'criar') {
      if (senha.length < SENHA_MINIMA) {
        setErro(`A senha precisa de ao menos ${SENHA_MINIMA} caracteres.`);
        return;
      }
      if (senha !== senha2) {
        setErro('As duas senhas não são iguais.');
        return;
      }
      setOcupado(true);
      setErro(null);
      const { data, error } = await sb()
        .auth.signUp({ email: limpo, password: senha, options: { emailRedirectTo: `${location.origin}/auth/confirmar?para=${encodeURIComponent(para)}`, ...comCaptcha } })
        .catch((x: unknown) => ({ data: null, error: { message: String((x as Error)?.message ?? x) } }));
      zerarCaptcha();
      if (error) {
        setOcupado(false);
        setErro(mensagemDeEntrada(error as ErroDeEntrada));
        return;
      }
      if (data?.session) {
        depoisDeEntrar();
        return;
      }
      // conta criada, mas o servidor pede confirmar o e-mail antes de entrar
      setOcupado(false);
      setModo('entrar');
      setSenha('');
      setSenha2('');
      setEmail(limpo);
      setAviso(`Conta criada. Confirme pelo link que mandamos para ${limpo} e depois entre com a sua senha.`);
      return;
    }

    // modo entrar
    setOcupado(true);
    setErro(null);
    const { error } = await sb()
      .auth.signInWithPassword({ email: limpo, password: senha, options: { ...comCaptcha } })
      .catch((x: unknown) => ({ error: { message: String((x as Error)?.message ?? x) } }));
    zerarCaptcha();
    if (error) {
      setOcupado(false);
      setErro(mensagemDeEntrada(error));
      return;
    }
    depoisDeEntrar();
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

  const tituloBotao = modo === 'criar' ? (ocupado ? 'Criando…' : 'Criar conta') : modo === 'esqueci' ? (ocupado ? 'Mandando…' : 'Mandar o link') : ocupado ? 'Entrando…' : 'Entrar';

  return (
    <div className="flex flex-col gap-4">
      {google && modo !== 'esqueci' ? (
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
            ou com e-mail e senha
            <span className="h-px flex-1 bg-linha" />
          </div>
        </>
      ) : null}

      {aviso ? (
        <p className="rounded-xl bg-caneta-claro px-4 py-3 text-[14px] text-caneta" role="status">
          {aviso}
        </p>
      ) : null}

      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Campo rotulo="Seu e-mail" erro={modo !== 'criar' && !senha ? erro : null} htmlFor="email-entrada">
          <input
            id="email-entrada"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (erro) setErro(null);
            }}
            aria-invalid={erro ? true : undefined}
            className={classeEntrada}
            autoFocus={!google}
            required
          />
        </Campo>

        {modo !== 'esqueci' ? (
          <Campo
            rotulo="Senha"
            erro={erro}
            dica={modo === 'criar' ? `Ao menos ${SENHA_MINIMA} caracteres.` : undefined}
            htmlFor="senha-entrada"
          >
            <input
              id="senha-entrada"
              name="senha"
              type="password"
              autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                if (erro) setErro(null);
              }}
              aria-invalid={erro ? true : undefined}
              className={classeEntrada}
              minLength={modo === 'criar' ? SENHA_MINIMA : undefined}
              required
            />
          </Campo>
        ) : null}

        {modo === 'criar' ? (
          <Campo rotulo="Repita a senha" htmlFor="senha2-entrada">
            <input
              id="senha2-entrada"
              name="senha2"
              type="password"
              autoComplete="new-password"
              value={senha2}
              onChange={(e) => {
                setSenha2(e.target.value);
                if (erro) setErro(null);
              }}
              className={classeEntrada}
              required
            />
          </Campo>
        ) : null}

        {config.captcha ? <Captcha chave={config.captcha} aoResolver={setCaptcha} rodada={rodadaCaptcha} /> : null}

        <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
          {modo === 'esqueci' ? <Mail size={18} aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
          {tituloBotao}
        </Botao>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[14px]">
        {modo === 'entrar' ? (
          <>
            <button type="button" className="font-semibold text-tinta-2 hover:text-tinta disabled:opacity-50" disabled={ocupado} onClick={() => trocarModo('criar')}>
              Criar uma conta
            </button>
            <button type="button" className="font-semibold text-caneta hover:underline disabled:opacity-50" disabled={ocupado} onClick={() => trocarModo('esqueci')}>
              Esqueci a senha
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-semibold text-tinta-2 hover:text-tinta disabled:opacity-50"
            disabled={ocupado}
            onClick={() => trocarModo('entrar')}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Voltar para entrar
          </button>
        )}
      </div>
    </div>
  );
}
