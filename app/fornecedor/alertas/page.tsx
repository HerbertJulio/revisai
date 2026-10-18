import type { Metadata } from 'next';
import { AlertasDaLoja } from '@/components/fornecedor/Alertas';
import { AvisoErro } from '@/components/fornecedor/comum';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { ALERTAS } from '@/lib/alertas-dados';
import { alertasParaLoja } from '@/lib/loja/alertas';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Alertas de preço' };

export default async function PaginaAlertas() {
  const r = await painelOuEntrada('/fornecedor/alertas');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const { loja } = painel;
  const a = await alertasParaLoja(sb, loja.id);
  return (
    <MolduraFornecedor
      aba="alertas"
      painel={painel}
      titulo="Alertas de preço"
      descricao={`Oficinas ${loja.uf ? `do ${loja.uf}` : 'do seu estado'} pedindo um preço do que você vende. Elas esperam até ${ALERTAS.horasParaResponder} horas e escolhem entre as lojas que responderam.`}
    >
      {a.erro ? <AvisoErro>{a.erro}</AvisoErro> : null}
      <AlertasDaLoja alertas={a.alertas} produtos={a.produtos} uf={a.uf} ativa={loja.ativo} />
    </MolduraFornecedor>
  );
}
