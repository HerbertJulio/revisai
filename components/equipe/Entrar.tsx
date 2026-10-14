'use client';

import { LockKeyhole } from 'lucide-react';
import { useActionState, type ReactNode } from 'react';
import { entrar, type EstadoEntrada } from '@/app/equipe/acoes';
import { Logo } from '@/components/marca';
import { Botao, Campo, classeEntrada } from '@/components/ui';

const INICIAL: EstadoEntrada = { erro: null };

export function Entrar({ voltar }: { voltar: string }) {
  const [estado, acao, enviando] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-5">
      <input type="hidden" name="voltar" value={voltar} />
      <Campo rotulo="Senha da equipe" erro={estado.erro} htmlFor="senha-equipe">
        <input
          id="senha-equipe"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={classeEntrada}
          autoFocus
        />
      </Campo>
      <Botao type="submit" variante="escuro" tamanho="grande" disabled={enviando}>
        <LockKeyhole size={18} aria-hidden="true" />
        {enviando ? 'Entrando…' : 'Entrar'}
      </Botao>
    </form>
  );
}

export function TelaEntrada({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
        <Logo />
        <h1 className="largo mt-6 text-[26px] leading-tight">Painel da equipe</h1>
        <p className="mt-1.5 mb-6 text-[15px] text-tinta-2">Pedidos da loja, cadastros do site e promoções dos fornecedores.</p>
        {children}
      </div>
    </main>
  );
}
