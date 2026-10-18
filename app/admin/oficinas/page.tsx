import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { OficinasEquipe } from '@/components/equipe/OficinasEquipe';
import { Botao, classeEntrada } from '@/components/ui';
import { listarOficinas } from '@/lib/equipe/dados';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Oficinas' };

const LIMITE = 500;

export default async function PaginaOficinas({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const acesso = await exigirEquipe();
  const q = String((await searchParams).q ?? '').slice(0, 80);
  const { dados, erro } = await listarOficinas(acesso.sb, q);
  return (
    <Moldura
      acesso={acesso}
      aba="oficinas"
      titulo="Oficinas"
      descricao="Cada oficina com o plano, quem entra nela e quanto usa o app. A equipe vê só contagens: os clientes, carros e ordens são da oficina."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {q || dados.length >= LIMITE ? (
        <form method="get" className="flex flex-wrap items-center gap-2 rounded-2xl bg-papel-2 px-4 py-3 text-[14px]">
          <span className="text-tinta-2">{q ? `Buscando em todas as oficinas por “${q}”.` : `Aqui estão as ${LIMITE} mais novas. Para achar uma mais antiga, busque em todas:`}</span>
          <label className="sr-only" htmlFor="busca-oficinas">
            Buscar em todas as oficinas
          </label>
          <input id="busca-oficinas" name="q" defaultValue={q} className={`${classeEntrada} h-10 max-w-xs`} placeholder="Nome, cidade, e-mail ou WhatsApp" />
          <Botao type="submit" tamanho="pequeno">
            Buscar
          </Botao>
          {q ? (
            <Link href="/admin/oficinas" className="font-semibold text-caneta hover:underline">
              Ver todas
            </Link>
          ) : null}
        </form>
      ) : null}
      <OficinasEquipe oficinas={dados} agora={Date.now()} />
    </Moldura>
  );
}
