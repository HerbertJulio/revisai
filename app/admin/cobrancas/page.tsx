import type { Metadata } from 'next';
import { AdminCobrancas } from '@/components/cobranca/AdminCobrancas';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { Numero } from '@/components/painel/Numero';
import { hojeEmBrasilia } from '@/lib/cobranca/documento';
import { dadosDoPainel, estadoDosGateways, lojasDoMes, mesParaCobrar, outroMes } from '@/lib/cobranca/painel';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cobranças' };

export default async function PaginaCobrancas({ searchParams }: { searchParams: Promise<{ mes?: string | string[] }> }) {
  const acesso = await exigirEquipe(PODE.mudarPlano);
  const pedido = String((await searchParams).mes ?? '');
  const hoje = hojeEmBrasilia();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : mesParaCobrar(hoje);
  const d = await dadosDoPainel(acesso.sb);
  const extratos = await lojasDoMes(acesso.sb, mes, d.pagamentos);

  const esteMes = hoje.slice(0, 7);
  const recebidoNoMes = d.pagamentos.filter((p) => p.situacao === 'pago' && p.pago_em && p.pago_em.slice(0, 7) === esteMes).reduce((s, p) => s + p.valor, 0);
  const ativas = d.assinaturas.filter((a) => a.situacao === 'ativa').length;
  const esperando = d.assinaturas.filter((a) => a.situacao === 'pendente').length;
  const atrasadas = d.assinaturas.filter((a) => a.situacao === 'atrasada').length;
  const notas = d.pagamentos.filter((p) => p.situacao === 'pago' && p.valor > 0 && p.nota_situacao === 'erro').length;

  return (
    <Moldura
      acesso={acesso}
      aba="cobrancas"
      titulo="Cobranças"
      descricao="A assinatura do Pro pelo app, os pagamentos com a nota fiscal e o fechamento do mês das lojas."
    >
      {d.erros.map((e) => (
        <AvisoErro key={e}>{e}</AvisoErro>
      ))}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Assinaturas ativas" valor={formatarNumero(ativas)} detalhe={atrasadas ? `${formatarNumero(atrasadas)} atrasadas` : 'nenhuma atrasada'} />
        <Numero rotulo="Esperando o 1º pagamento" valor={formatarNumero(esperando)} />
        <Numero rotulo="Recebido no mês" valor={formatarMoeda(recebidoNoMes)} detalhe="Pro e lojas, pelo dia do pagamento" />
        <Numero rotulo="Notas com erro" valor={formatarNumero(notas)} detalhe={d.avisos.length ? `${d.avisos.length} avisos pendentes` : 'nenhum aviso pendente'} />
      </div>
      <AdminCobrancas
        gateways={estadoDosGateways()}
        assinaturas={d.assinaturas}
        pagamentos={d.pagamentos}
        avisos={d.avisos}
        mes={mes}
        mesAnterior={outroMes(mes, -1)}
        mesSeguinte={outroMes(mes, 1)}
        lojas={extratos.lojas}
        semExtrato={extratos.semExtrato}
        erroLojas={extratos.erro}
        hoje={hoje}
      />
    </Moldura>
  );
}
