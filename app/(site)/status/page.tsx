import type { Metadata } from 'next';
import Link from 'next/link';
import { conferirBanco, conferirLogin, type Conferencia } from '@/lib/saude-do-sistema';

// O que o Revisaí está fazendo agora: a página confere na hora o banco e o login.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Status',
  description: 'Se o Revisaí está funcionando agora: o app, o banco de dados e o login.'
};

function Linha({ nome, texto, c }: { nome: string; texto: string; c: Conferencia | null }) {
  const ok = c ? c.ok : true;
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <p className="font-semibold">{nome}</p>
        <p className="text-[13.5px] text-tinta-3">{texto}</p>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-bold ${ok ? 'bg-ok-claro text-ok' : 'bg-atraso-claro text-atraso'}`}>{ok ? 'Funcionando' : 'Com problema'}</span>
    </li>
  );
}

export default async function Status() {
  const [banco, login] = await Promise.all([conferirBanco(), conferirLogin()]);
  const tudoCerto = banco.ok && login.ok;
  const agora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="largo text-[32px]">Status do Revisaí</h1>
        <p className={`text-[17px] font-semibold ${tudoCerto ? 'text-ok' : 'text-atraso'}`} role="status">
          {tudoCerto ? 'Tudo funcionando.' : 'Parte do sistema está com problema. Já estamos olhando.'}
        </p>
        <p className="text-[14px] text-tinta-3">Conferido agora, {agora}. Recarregue a página para conferir de novo.</p>
      </header>
      <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
        <Linha nome="App e site" texto="As telas da oficina, da loja e do cliente." c={null} />
        <Linha nome="Banco de dados" texto="Clientes, ordens, pedidos e estoque." c={banco} />
        <Linha nome="Login" texto="Entrar com o código por e-mail ou com o Google." c={login} />
      </ul>
      <p className="text-[14.5px] text-tinta-2">
        Sem internet, o app da oficina continua abrindo neste aparelho com os dados que já estavam nele, e o que você fizer sobe quando a conexão voltar. Para falar com a equipe, use a ajuda dentro
        do app ou veja os contatos em{' '}
        <Link href="/seguranca" className="font-semibold text-caneta underline">
          Segurança
        </Link>
        .
      </p>
    </main>
  );
}
