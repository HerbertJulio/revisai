import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { AlertasDaLoja } from '@/components/fornecedor/Alertas';
import { MolduraFornecedor, SemAcesso } from '@/components/fornecedor/Moldura';
import { alertasParaLoja } from '@/lib/alertas';
import { ALERTAS } from '@/lib/alertas-dados';
import { painelDaSessao } from '@/lib/fornecedor-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Alertas de preço' };

export default async function PaginaAlertas() {
  const r = await painelDaSessao();
  if (!r.sessao) return <SemAcesso linkInvalido={false} />;
  if (!r.painel)
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <AvisoErro>{r.erro ?? 'Não deu para abrir o painel agora.'}</AvisoErro>
      </main>
    );
  const { fornecedor, pedidos } = r.painel;
  const a = await alertasParaLoja(fornecedor.id);
  return (
    <MolduraFornecedor
      aba="alertas"
      loja={fornecedor.nome}
      novos={pedidos.filter((p) => p.status === 'novo').length}
      alertas={r.painel.alertasNovos}
      titulo="Alertas de preço"
      descricao={`Oficinas ${fornecedor.uf ? `do ${fornecedor.uf}` : 'do seu estado'} pedindo um preço do que você vende. Elas esperam até ${ALERTAS.horasParaResponder} horas e escolhem entre as lojas que responderam.`}
    >
      {a.erro ? <AvisoErro>{a.erro}</AvisoErro> : null}
      <AlertasDaLoja alertas={a.alertas} produtos={a.produtos} uf={a.uf} />
    </MolduraFornecedor>
  );
}
