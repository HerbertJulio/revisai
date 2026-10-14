import type { ReactNode } from 'react';
import { acessoDaEquipe } from '@/lib/equipe';
import { Entrar, TelaEntrada } from './Entrar';

/** A tela de senha, ou null quando a pessoa já entrou. Cada página confere no servidor. */
export async function portaoDaEquipe(voltar: string): Promise<ReactNode | null> {
  const acesso = await acessoDaEquipe();
  if (acesso === 'dentro') return null;
  return (
    <TelaEntrada>
      {acesso === 'sem-configuracao' ? (
        <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">
          O painel ainda não foi ligado. Faltam as variáveis EQUIPE_SENHA e EQUIPE_CHAVE na Vercel.
        </p>
      ) : (
        <Entrar voltar={voltar} />
      )}
    </TelaEntrada>
  );
}
