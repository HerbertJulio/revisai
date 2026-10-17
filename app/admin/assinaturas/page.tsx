import type { Metadata } from 'next';
import { Barras, nomeDoMes } from '@/components/equipe/Barras';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { Numero } from '@/components/painel/Numero';
import { Secao, Vazio } from '@/components/ui';
import { metricasDeAssinatura } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { porcento } from '@/lib/equipe/tipos';
import { formatarMoeda, formatarNumero, plural } from '@/lib/formatos';
import { PRO } from '@/lib/plano';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Assinaturas' };

function pct(n: number): string {
  return `${String(n).replace('.', ',')}%`;
}

export default async function PaginaAssinaturas() {
  const acesso = await exigirEquipe(PODE.numerosDeAssinatura);
  const { dados: m, erro } = await metricasDeAssinatura(acesso.sb);
  return (
    <Moldura
      acesso={acesso}
      aba="assinaturas"
      titulo="Assinaturas"
      descricao={`Receita recorrente do Pro. O valor de cada oficina sai da última assinatura paga que ainda vale; sem ela, do preço da tabela (${formatarMoeda(PRO.preco)}, ou ${formatarMoeda(PRO.precoFundador)} para as fundadoras).`}
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {m ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Receita por mês (MRR)" valor={formatarMoeda(m.mrr)} detalhe={`${formatarMoeda(m.mrr * 12)} por ano`} />
            <Numero rotulo="Oficinas pagando" valor={formatarNumero(m.pagantes)} detalhe={`${formatarNumero(m.comAssinatura)} com pagamento registrado`} />
            <Numero rotulo="Média por oficina" valor={formatarMoeda(m.receitaMedia)} />
            <Numero rotulo="Recebido no mês" valor={formatarMoeda(m.receitaMes)} />
            <Numero rotulo="Em teste agora" valor={formatarNumero(m.teste)} />
            <Numero rotulo="No grátis" valor={formatarNumero(m.gratis)} />
            <Numero
              rotulo="Saíram do Pro no mês"
              valor={formatarNumero(m.churnMes.sairam)}
              detalhe={m.churnMes.base ? `${pct(porcento(m.churnMes.sairam, m.churnMes.base))} de ${m.churnMes.base}` : 'nenhuma no Pro neste mês'}
            />
            <Numero
              rotulo="Do cadastro ao Pro"
              valor={pct(porcento(m.conversao.pro, m.conversao.cadastradas))}
              detalhe={`${m.conversao.cadastradas} cadastradas, ${m.conversao.testaram} testaram, ${m.conversao.pro} viraram Pro`}
            />
          </div>

          <Secao titulo="Receita dos últimos 6 meses" descricao="O que entrou de assinaturas em cada mês (pela data em que a equipe registrou).">
            {m.serie.length ? (
              <Barras
                rotulo="Receita por mês"
                itens={m.serie.map((s) => ({
                  rotulo: nomeDoMes(s.mes),
                  valor: s.receita,
                  texto: formatarMoeda(s.receita),
                  detalhe: `${plural(s.assinaturas, 'assinatura', 'assinaturas')}, ${plural(s.oficinasNovas, 'oficina nova', 'oficinas novas')}`
                }))}
              />
            ) : (
              <Vazio titulo="Sem dados ainda" />
            )}
          </Secao>
        </>
      ) : !erro ? (
        <Vazio titulo="Sem dados ainda" />
      ) : null}
    </Moldura>
  );
}
