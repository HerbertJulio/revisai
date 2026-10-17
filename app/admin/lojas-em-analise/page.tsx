import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { LojasEmAnalise, type LojaParaAnalisar } from '@/components/equipe/LojasEmAnalise';
import { Moldura } from '@/components/equipe/Moldura';
import { consultarCnpj } from '@/lib/equipe/cnpj';
import { lojasEmAnalise } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lojas em análise' };

/** Até quantas lojas pendentes a página consulta na Receita de uma vez. */
const CONSULTAS = 20;

export default async function PaginaLojasEmAnalise() {
  const acesso = await exigirEquipe(PODE.decidirLoja);
  const { dados, erro } = await lojasEmAnalise(acesso.sb);
  const pendentes: LojaParaAnalisar[] = await Promise.all(
    dados.pendentes.map(async (l, i) => ({
      ...l,
      donos: dados.donos[l.id] ?? [],
      consulta: l.cnpj ? (i < CONSULTAS ? await consultarCnpj(l.cnpj) : { ok: false as const, erro: 'Consulte na Receita (muitas lojas na fila).' }) : null
    }))
  );
  const recusadas: LojaParaAnalisar[] = dados.recusadas.map((l) => ({ ...l, donos: dados.donos[l.id] ?? [], consulta: null }));
  return (
    <Moldura
      acesso={acesso}
      aba="lojas-em-analise"
      titulo="Lojas em análise"
      descricao="Quem pediu para vender no Revisaí. Confira na Receita se o CNPJ está ativo e se a atividade é de peças antes de aprovar."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <LojasEmAnalise pendentes={pendentes} recusadas={recusadas} agora={Date.now()} />
    </Moldura>
  );
}
