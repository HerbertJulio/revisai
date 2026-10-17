import type { Metadata } from 'next';
import { Barras } from '@/components/equipe/Barras';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { UsoEquipe } from '@/components/equipe/UsoEquipe';
import { Secao, Vazio } from '@/components/ui';
import { funilEUso } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { porcento } from '@/lib/equipe/tipos';
import { formatarNumero } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Uso e funil' };

export default async function PaginaUso() {
  const acesso = await exigirEquipe(PODE.numeros);
  const { dados, erro } = await funilEUso(acesso.sb);
  const f = dados?.funil;
  const etapas = f
    ? [
        { rotulo: 'Cadastraram', valor: f.cadastradas },
        { rotulo: 'Puseram dados', valor: f.comDados },
        { rotulo: '10 clientes ou mais', valor: f.com10Clientes },
        { rotulo: 'Testaram o Pro', valor: f.testaram },
        { rotulo: 'Viraram Pro', valor: f.pro }
      ]
    : [];
  return (
    <Moldura
      acesso={acesso}
      aba="uso"
      titulo="Uso e funil"
      descricao="Do cadastro ao Pro, e quanto cada oficina usa o app. Só contagens: a equipe não vê os clientes, carros e ordens de ninguém."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {dados ? (
        <>
          <Secao titulo="Funil" descricao="Quantas oficinas chegaram a cada etapa e quanto isso é do total cadastrado.">
            <Barras
              rotulo="Funil das oficinas"
              itens={etapas.map((e) => ({
                rotulo: e.rotulo,
                valor: e.valor,
                texto: formatarNumero(e.valor),
                detalhe: f && f.cadastradas ? `${String(porcento(e.valor, f.cadastradas)).replace('.', ',')}%` : undefined
              }))}
            />
          </Secao>
          <Secao titulo="Cada oficina">
            <UsoEquipe oficinas={dados.oficinas} agora={Date.now()} />
          </Secao>
        </>
      ) : !erro ? (
        <Vazio titulo="Sem dados ainda" />
      ) : null}
    </Moldura>
  );
}
