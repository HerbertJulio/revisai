import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { ProAdmin } from '@/components/equipe/ProAdmin';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { buscarCadastros, usoDosAlertas } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { oficinaDoPedidoDeAlertas, quantidadeDoPedidoDeAlertas } from '@/lib/equipe/tipos';
import { listarAssinaturas } from '@/lib/pro';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pro' };

export default async function PaginaPro() {
  const acesso = await exigirEquipe(PODE.verAssinaturas);
  const { sb } = acesso;
  const [a, c] = await Promise.all([listarAssinaturas(sb), buscarCadastros(sb)]);
  const pedidos = c.dados
    .filter((x) => x.plano === 'alertas' && x.situacao === 'novo')
    .map((x) => ({ ...x, oficinaId: oficinaDoPedidoDeAlertas(x.mensagem, a.dados), quantidade: quantidadeDoPedidoDeAlertas(x.mensagem) }));
  const ids = [...new Set([...a.dados.flatMap((x) => (x.oficina_id ? [x.oficina_id] : [])), ...pedidos.flatMap((p) => (p.oficinaId ? [p.oficinaId] : []))])];
  const [uso, nomes] = await Promise.all([usoDosAlertas(sb, ids), ids.length ? sb.from('oficinas').select('id, nome').in('id', ids) : Promise.resolve({ data: [] })]);
  const oficinas = Object.fromEntries(((nomes.data ?? []) as { id: string; nome: string }[]).map((o) => [o.id, o.nome]));
  const comCodigo = new Set(a.dados.map((x) => x.oficina_nome.trim().toLowerCase()));
  const interessados = c.dados.filter(
    (x) => x.tipo === 'oficina' && (x.plano === 'plus' || x.plano === 'pro') && x.situacao !== 'arquivado' && !comCodigo.has((x.empresa || x.nome).trim().toLowerCase())
  );
  return (
    <Moldura acesso={acesso} aba="pro" titulo="Pro" descricao="Códigos do plano Pro das oficinas. Crie o código depois do pagamento e mande para o dono da oficina digitar no app.">
      {a.erro ? <AvisoErro>{a.erro}</AvisoErro> : null}
      <ProAdmin
        assinaturas={a.dados}
        interessados={interessados}
        hoje={diaEmBrasilia(Date.now())}
        usoAlertas={uso}
        pedidosDeAlertas={pedidos}
        oficinas={oficinas}
        papel={acesso.papel}
      />
    </Moldura>
  );
}
