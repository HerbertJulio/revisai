import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { FornecedoresAdmin } from '@/components/equipe/FornecedoresAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { buscarCadastros } from '@/lib/equipe';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { listarFornecedoresAdmin } from '@/lib/marketplace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Fornecedores' };

export default async function PaginaFornecedores() {
  const portao = await portaoDaEquipe('/admin/fornecedores');
  if (portao) return portao;
  const [f, c] = await Promise.all([listarFornecedoresAdmin(), buscarCadastros()]);
  const nomes = new Set(f.dados.map((x) => x.nome.trim().toLowerCase()));
  const leads = c.dados.filter((x) => x.tipo === 'fornecedor' && x.situacao !== 'arquivado' && !nomes.has((x.empresa || x.nome).trim().toLowerCase()));
  return (
    <Moldura aba="fornecedores" titulo="Fornecedores" descricao="As lojas do marketplace, o plano de cada uma, as vendas do mês e o link de acesso ao painel delas.">
      {f.erro ? <AvisoErro>{f.erro}</AvisoErro> : null}
      <FornecedoresAdmin fornecedores={f.dados} leads={leads} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
