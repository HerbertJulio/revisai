import Link from 'next/link';
import type { ReactNode } from 'react';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';
import { DATA_DA_VERSAO } from './versao';

// O molde dos documentos legais: título, versão, quem é a empresa, as seções numeradas e os links
// para os outros documentos. Os dados da empresa vêm das variáveis EMPRESA_* (lib/avisos/empresa).

export const DOCUMENTOS = [
  { href: '/termos', nome: 'Termos de uso' },
  { href: '/privacidade', nome: 'Política de privacidade' },
  { href: '/contrato-lojas', nome: 'Contrato das lojas' },
  { href: '/tratamento-de-dados', nome: 'Acordo de tratamento de dados' },
  { href: '/seguranca', nome: 'Segurança' }
] as const;

export function Documento({ titulo, resumo, atual, children, semVersao = false }: { titulo: string; resumo: ReactNode; atual: string; children: ReactNode; semVersao?: boolean }) {
  const e = dadosDaEmpresa();
  return (
    <article className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 lg:pt-16">
      <h1 className="largo text-[38px] leading-[1.02] sm:text-[48px]">{titulo}</h1>
      {semVersao ? null : <p className="mt-3 text-[14px] text-tinta-3">Versão de {DATA_DA_VERSAO}</p>}
      <div className="mt-5 flex flex-col gap-3 text-[17px] leading-relaxed text-tinta-2">{resumo}</div>
      <dl className="mt-8 grid gap-x-6 gap-y-2 rounded-[18px] bg-papel p-5 text-[15px] ring-1 ring-linha sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold">Empresa</dt>
        <dd className="text-tinta-2">{e.razaoSocial}</dd>
        <dt className="font-semibold">CNPJ</dt>
        <dd className="text-tinta-2">{e.cnpj}</dd>
        <dt className="font-semibold">Endereço</dt>
        <dd className="text-tinta-2">{e.endereco}</dd>
        <dt className="font-semibold">Contato</dt>
        <dd className="text-tinta-2">{e.emailContato}</dd>
        <dt className="font-semibold">Privacidade</dt>
        <dd className="text-tinta-2">{e.emailPrivacidade}</dd>
      </dl>
      <div className="mt-10 flex flex-col gap-10">{children}</div>
      <nav className="mt-14 border-t border-linha pt-6 text-[15px]" aria-label="Documentos do Revisaí">
        <p className="font-bold">Outros documentos</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {DOCUMENTOS.filter((d) => d.href !== atual).map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="font-semibold text-caneta underline">
                {d.nome}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}

export function Secao({ n, titulo, children, id }: { n: number; titulo: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-[21px]">
        {n}. {titulo}
      </h2>
      <div className="mt-3 flex flex-col gap-3 leading-relaxed text-tinta-2">{children}</div>
    </section>
  );
}

export function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Um bloco "o quê / para quê / base legal / por quanto tempo" (política de privacidade). */
export function Tratamento({ titulo, dados, para, base, prazo }: { titulo: string; dados: ReactNode; para: ReactNode; base: ReactNode; prazo?: ReactNode }) {
  return (
    <div className="rounded-[16px] bg-papel p-4 ring-1 ring-linha">
      <h3 className="font-bold text-tinta">{titulo}</h3>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[15px] sm:grid-cols-[8.5rem_1fr]">
        <dt className="font-semibold text-tinta">Dados</dt>
        <dd>{dados}</dd>
        <dt className="font-semibold text-tinta">Para quê</dt>
        <dd>{para}</dd>
        <dt className="font-semibold text-tinta">Base legal</dt>
        <dd>{base}</dd>
        {prazo ? (
          <>
            <dt className="font-semibold text-tinta">Por quanto tempo</dt>
            <dd>{prazo}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
