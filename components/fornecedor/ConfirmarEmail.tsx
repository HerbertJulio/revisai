'use client';

// Confirmação do código do e-mail antes de uma mudança sensível na loja (trocar a chave Pix,
// chamar ou passar alguém a dono). O banco só aceita essas mudanças até 15 minutos depois de a
// pessoa confirmar o código; quem pegar a sessão aberta de alguém não tem o e-mail dela.

import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { mensagemDeEntrada } from '@/components/conta/FormEntrar';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { Captcha } from '@/components/conta/Captcha';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';

export function ConfirmarEmail({
  config,
  email,
  motivo,
  aoConfirmar,
  aoVoltar
}: {
  config: ConfigPublica | null;
  email: string;
  /** O que a pessoa está fazendo, para o texto: "trocar a chave Pix". */
  motivo: string;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  const [passo, setPasso] = useState<'pedir' | 'codigo'>('pedir');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [rodadaCaptcha, setRodadaCaptcha] = useState(0);

  async function pedir() {
    if (!config) return setErro('O login não está ligado neste servidor.');
    if (config.captcha && !captcha) return setErro('Espere a verificação de segurança terminar e tente de novo.');
    setOcupado(true);
    setErro(null);
    try {
      const { error } = await clienteNavegador(config).auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${location.origin}/auth/confirmar?para=${encodeURIComponent('/fornecedor/conta')}`,
          ...(captcha ? { captchaToken: captcha } : {})
        }
      });
      if (error) return setErro(mensagemDeEntrada(error));
      setPasso('codigo');
    } catch {
      setErro('Sem conexão agora. Tente de novo.');
    } finally {
      setOcupado(false);
      if (config.captcha) {
        setCaptcha(null);
        setRodadaCaptcha((r) => r + 1);
      }
    }
  }

  async function conferir(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    const token = codigo.replace(/\D/g, '');
    if (token.length < 6) return setErro('O código tem 6 números.');
    setOcupado(true);
    setErro(null);
    try {
      const { error } = await clienteNavegador(config).auth.verifyOtp({ email, token, type: 'email' });
      if (error) return setErro(mensagemDeEntrada(error));
      aoConfirmar();
    } catch {
      setErro('Sem conexão agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-caneta-claro/70 p-4" role="group" aria-label="Confirmar o código do e-mail">
      <p className="flex items-center gap-2 font-semibold text-caneta">
        <MailCheck size={18} aria-hidden="true" /> Confirme que é você
      </p>
      {passo === 'pedir' ? (
        <>
          <p className="text-[14.5px] text-tinta-2">
            Para {motivo}, vamos mandar um código para <strong>{email}</strong>. É uma proteção da loja: sem o e-mail, ninguém faz essa mudança, nem com o painel aberto.
          </p>
          {erro ? (
            <p className="text-[14px] text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
          {config?.captcha ? <Captcha chave={config.captcha} aoResolver={setCaptcha} rodada={rodadaCaptcha} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Botao variante="fantasma" tamanho="pequeno" onClick={aoVoltar}>
              Voltar
            </Botao>
            <Botao variante="escuro" tamanho="pequeno" onClick={() => void pedir()} disabled={ocupado}>
              {ocupado ? 'Mandando…' : 'Mandar o código'}
            </Botao>
          </div>
        </>
      ) : (
        <form onSubmit={conferir} className="flex flex-col gap-3">
          <p className="text-[14.5px] text-tinta-2">Mandamos o código para {email}. Ele chega em até 1 minuto (olhe também o spam).</p>
          <Campo rotulo="Código do e-mail" erro={erro} htmlFor="codigo-confirmar">
            <input
              id="codigo-confirmar"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className={`${classeEntrada} num text-center text-[20px] tracking-[0.3em]`}
              autoFocus
              required
            />
          </Campo>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="text-[14px] font-semibold text-caneta hover:underline disabled:opacity-50" disabled={ocupado} onClick={() => void pedir()}>
              Mandar de novo
            </button>
            <div className="flex gap-2">
              <Botao variante="fantasma" tamanho="pequeno" onClick={aoVoltar}>
                Voltar
              </Botao>
              <Botao type="submit" variante="escuro" tamanho="pequeno" disabled={ocupado}>
                {ocupado ? 'Conferindo…' : 'Confirmar'}
              </Botao>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
