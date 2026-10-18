'use client';

import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { registrarInteresse } from '@/app/acoes';
import { Captcha } from '@/components/conta/Captcha';
import { Botao, Campo, classeArea, classeEntrada } from '@/components/ui';
import { UFS } from '@/lib/padroes';

type Tipo = 'oficina' | 'fornecedor' | 'motorista' | 'contato';

/** Cadastro de interesse (vai para a tabela "interessados" do Supabase). */
export function FormInteresse({
  tipo,
  origem,
  plano,
  comEmpresa = false,
  rotuloEmpresa = 'Empresa',
  comCidade = true,
  mensagem = 'Mensagem',
  dicaMensagem,
  botao = 'Enviar',
  sucesso = 'Recebemos o seu contato. A gente fala com você em breve.',
  consentimento = 'Concordo em receber contato do Revisaí pelo WhatsApp ou e-mail sobre este assunto.',
  extra,
  captcha
}: {
  tipo: Tipo;
  origem: string;
  plano?: 'gratis' | 'plus' | 'vitrine' | 'destaque' | 'oferta';
  comEmpresa?: boolean;
  rotuloEmpresa?: string;
  comCidade?: boolean;
  mensagem?: string | null;
  dicaMensagem?: string;
  botao?: string;
  sucesso?: string;
  consentimento?: string;
  /** Texto que vai junto da mensagem (ex.: a data calculada da próxima troca). */
  extra?: string;
  /** A chave do site da verificação de pessoa, quando ligada. */
  captcha?: string | null;
}) {
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [rodada, setRodada] = useState(0);

  if (ok) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-ok-claro px-5 py-5 text-ok" role="status">
        <Check size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="font-semibold">{sucesso}</p>
      </div>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? '');
        if (captcha && !token) {
          setErro('Espere a verificação de segurança terminar e tente de novo.');
          return;
        }
        setErro(null);
        iniciar(async () => {
          let r: Awaited<ReturnType<typeof registrarInteresse>>;
          try {
            r = await registrarInteresse({
            tipo,
            origem,
            plano: plano ?? v('plano'),
            nome: v('nome'),
            empresa: v('empresa'),
            whatsapp: v('whatsapp'),
            email: v('email'),
            cidade: v('cidade'),
            uf: v('uf'),
            mensagem: [v('mensagem'), extra].filter(Boolean).join('\n'),
            consentimento: f.get('consentimento') === 'on',
            site: v('site'),
            captcha: token ?? ''
            });
          } catch {
            setErro('Não deu para enviar agora. Confira a internet e tente de novo.');
            return;
          } finally {
            if (captcha) {
              setToken(null);
              setRodada((n) => n + 1);
            }
          }
          if (r.ok) setOk(true);
          else setErro(r.erro);
        });
      }}
    >
      {comEmpresa ? (
        <Campo rotulo={rotuloEmpresa} htmlFor={`${origem}-empresa`} className="sm:col-span-2">
          <input id={`${origem}-empresa`} name="empresa" className={classeEntrada} autoComplete="organization" />
        </Campo>
      ) : null}
      <Campo rotulo="Seu nome" htmlFor={`${origem}-nome`} className="sm:col-span-2">
        <input id={`${origem}-nome`} name="nome" className={classeEntrada} autoComplete="name" required minLength={2} />
      </Campo>
      <Campo rotulo="WhatsApp" htmlFor={`${origem}-whats`}>
        <input id={`${origem}-whats`} name="whatsapp" className={classeEntrada} inputMode="tel" autoComplete="tel" placeholder="(21) 99999-0000" />
      </Campo>
      <Campo rotulo="E-mail" htmlFor={`${origem}-email`}>
        <input id={`${origem}-email`} name="email" type="email" className={classeEntrada} autoComplete="email" />
      </Campo>
      {comCidade ? (
        <div className="grid grid-cols-[1fr_88px] gap-3 sm:col-span-2">
          <Campo rotulo="Cidade" htmlFor={`${origem}-cidade`}>
            <input id={`${origem}-cidade`} name="cidade" className={classeEntrada} autoComplete="address-level2" />
          </Campo>
          <Campo rotulo="UF" htmlFor={`${origem}-uf`}>
            <select id={`${origem}-uf`} name="uf" className={classeEntrada} defaultValue="RJ">
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Campo>
        </div>
      ) : null}
      {mensagem ? (
        <Campo rotulo={mensagem} htmlFor={`${origem}-msg`} className="sm:col-span-2" dica={dicaMensagem}>
          <textarea id={`${origem}-msg`} name="mensagem" rows={3} className={classeArea} maxLength={1000} />
        </Campo>
      ) : null}
      {/* campo armadilha para robôs */}
      <div className="hidden" aria-hidden="true">
        <label>
          Site <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-3 text-[14px] text-tinta-2 sm:col-span-2">
        <input type="checkbox" name="consentimento" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--tinta)]" />
        <span>
          {consentimento} Veja a <a href="/privacidade" className="font-semibold text-caneta hover:underline">política de privacidade</a>.
        </span>
      </label>
      {captcha ? (
        <div className="sm:col-span-2">
          <Captcha chave={captcha} aoResolver={setToken} rodada={rodada} />
        </div>
      ) : null}
      {erro ? (
        <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso sm:col-span-2" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Botao type="submit" variante="primario" tamanho="grande" disabled={enviando}>
          {enviando ? 'Enviando…' : botao}
        </Botao>
      </div>
    </form>
  );
}
