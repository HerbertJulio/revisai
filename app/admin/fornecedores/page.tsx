import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { FornecedoresAdmin } from '@/components/equipe/FornecedoresAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { diaEmBrasilia, type Cadastro } from '@/lib/equipe-dados';
import { buscarCadastros, enderecoDoSite, listarLojas, type Resultado } from '@/lib/equipe/dados';
import { pode } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lojas' };

export default async function PaginaLojas() {
  const acesso = await exigirEquipe();
  const semCadastros: Resultado<Cadastro[]> = { dados: [], erro: null };
  const [f, c] = await Promise.all([listarLojas(acesso.sb), pode(acesso.papel, 'criarLoja') ? buscarCadastros(acesso.sb) : Promise.resolve(semCadastros)]);
  const nomes = new Set(f.dados.map((x) => x.nome.trim().toLowerCase()));
  const leads = c.dados.filter((x) => x.tipo === 'fornecedor' && x.situacao !== 'arquivado' && !nomes.has((x.empresa || x.nome).trim().toLowerCase()));
  return (
    <Moldura
      acesso={acesso}
      aba="fornecedores"
      titulo="Lojas"
      descricao="As lojas do marketplace, o plano de cada uma, as vendas do mês e quem entra no painel delas (cada pessoa com a própria conta)."
    >
      {f.erro ? <AvisoErro>{f.erro}</AvisoErro> : null}
      <FornecedoresAdmin lojas={f.dados} leads={leads} hoje={diaEmBrasilia(Date.now())} papel={acesso.papel} site={enderecoDoSite()} />
    </Moldura>
  );
}
