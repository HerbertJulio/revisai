'use client';

// A pessoa chega aqui pelo link de "esqueci a senha". A gente abre a sessão de recuperação
// (pelo token do e-mail ou pelo código) e deixa escolher uma senha nova.

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';
import { mensagemDeEntrada } from './FormEntrar';

const SENHA_MINIMA = 6;

export function RedefinirSenha({ config, para }: { config: ConfigPublica; para: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<'abrindo' | 'pronto' | 'invalido'>('abrindo');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abriu = useRef(false);

  useEffect(() => {
    if (abriu.current) return;
    abriu.current = true;
    const sb = clienteNavegador(config);

    async function abrir() {
      const url = new URL(location.href);
      const tokenHash = url.searchParams.get('token_hash');
      const tipo = url.searchParams.get('type');
      const codigo = url.searchParams.get('code');
      try {
        if (tokenHash && tipo) {
          const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (error) throw error;
        } else if (codigo) {
          const { error } = await sb.auth.exchangeCodeForSession(codigo);
          if (error) throw error;
        }
        // limpa o endereço para o token não ficar no histórico
        window.history.replaceState(null, '', url.pathname);
        const { data } = await sb.auth.getSession();
        setEstado(data.session ? 'pronto' : 'invalido');
      } catch {
        setEstado('invalido');
      }
    }
    void abrir();
  }, [config]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
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
    const { error } = await clienteNavegador(config)
      .auth.updateUser({ password: senha })
      .catch((x: unknown) => ({ error: { message: String((x as Error)?.message ?? x) } }));
    if (error) {
      setOcupado(false);
      setErro(mensagemDeEntrada(error));
      return;
    }
    router.replace(`/conta?para=${encodeURIComponent(para)}`);
    router.refresh();
  }

  if (estado === 'abrindo') return <p className="text-[15px] text-tinta-2">Abrindo o link…</p>;

  if (estado === 'invalido')
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">O link não vale mais ou já foi usado. Peça outro na tela de entrar.</p>
        <Botao variante="escuro" tamanho="grande" onClick={() => router.replace(`/entrar?para=${encodeURIComponent(para)}`)}>
          Voltar para entrar
        </Botao>
      </div>
    );

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <Campo rotulo="Nova senha" erro={erro} dica={`Ao menos ${SENHA_MINIMA} caracteres.`} htmlFor="senha-nova">
        <input
          id="senha-nova"
          name="senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
            if (erro) setErro(null);
          }}
          aria-invalid={erro ? true : undefined}
          className={classeEntrada}
          minLength={SENHA_MINIMA}
          autoFocus
          required
        />
      </Campo>
      <Campo rotulo="Repita a nova senha" htmlFor="senha-nova2">
        <input
          id="senha-nova2"
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
      <Botao type="submit" variante="escuro" tamanho="grande" disabled={ocupado}>
        <Lock size={18} aria-hidden="true" />
        {ocupado ? 'Salvando…' : 'Salvar a senha'}
      </Botao>
    </form>
  );
}
