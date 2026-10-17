'use client';

import { ArrowLeftRight, CircleUserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Folha } from '@/components/Folha';
import { classeBotao } from '@/components/ui';
import { nomeDoPapel } from '@/lib/conta-dados';
import { BotoesDeSair } from './BotoesDeSair';
import { useConta } from './ProvedorConta';

/** Quem entrou, em qual oficina, trocar de oficina e sair (só com a conta). */
export function MenuDaConta({ compacto = false }: { compacto?: boolean }) {
  const { conta, oficina, config } = useConta();
  const [aberto, setAberto] = useState(false);
  if (!conta) return null;
  const email = conta.usuario.email;
  const outras = conta.oficinas.length + conta.fornecedores.length > 1;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`flex min-w-0 items-center gap-2 rounded-[10px] text-left text-[13px] font-semibold text-tinta-2 hover:text-tinta ${compacto ? 'h-10 px-1' : 'py-1'}`}
        aria-haspopup="dialog"
        aria-label={`Sua conta: ${email}`}
      >
        <CircleUserRound size={compacto ? 20 : 16} aria-hidden="true" className="shrink-0" />
        {compacto ? <span>Conta</span> : <span className="truncate">{email}</span>}
      </button>
      <Folha aberta={aberto} aoFechar={() => setAberto(false)} titulo="Sua conta" descricao={email}>
        <div className="flex flex-col gap-5">
          {oficina ? (
            <div className="rounded-2xl bg-papel-2 p-4">
              <p className="font-bold">{oficina.nome}</p>
              <p className="text-[14px] text-tinta-2">Você entra como {nomeDoPapel('oficina', oficina.papel).toLowerCase()}.</p>
            </div>
          ) : null}
          <Link href="/conta?ver=1" className={classeBotao('secundario', 'normal', 'self-start')} onClick={() => setAberto(false)}>
            <ArrowLeftRight size={16} aria-hidden="true" /> {outras ? 'Trocar de oficina' : 'Abrir a conta'}
          </Link>
          <div className="border-t border-linha pt-4">
            <p className="mb-3 text-[14px] text-tinta-2">Ao sair, o que ainda não subiu vai para a nuvem e os dados da oficina saem deste aparelho. Entrando de novo, eles voltam.</p>
            <BotoesDeSair config={config} />
          </div>
        </div>
      </Folha>
    </>
  );
}
