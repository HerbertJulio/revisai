import Link from 'next/link';
import { PainelAssinatura, type PrecoDoPro } from '@/components/cobranca/PainelAssinatura';
import { Vazio, classeBotao } from '@/components/ui';
import { cobrancaLigada, metodosDisponiveis } from '@/lib/cobranca';
import { lerAssinatura, lerPagamento } from '@/lib/cobranca/banco';
import { hojeEmBrasilia } from '@/lib/cobranca/documento';
import { COLUNAS_ASSINATURA, COLUNAS_PAGAMENTO } from '@/lib/cobranca/tipos';
import { acessoDaOficina } from '@/lib/conta';

export const metadata = { title: 'Assinatura do Pro' };
export const dynamic = 'force-dynamic';

export default async function PaginaAssinatura() {
  const a = await acessoDaOficina();
  if (!a.ok) {
    return (
      <Vazio
        titulo="Assinatura do Pro"
        acao={
          <Link href="/planos#assinar" className={classeBotao('primario')}>
            Assinar pelo WhatsApp
          </Link>
        }
      >
        {a.erro} Sem conta, a assinatura é combinada pelo WhatsApp da equipe.
      </Vazio>
    );
  }
  if (a.oficina.papel !== 'dono' && a.oficina.papel !== 'gerente') {
    return <Vazio titulo="Assinatura do Pro">Só o dono ou o gerente da oficina cuida da assinatura. Peça a eles para abrir esta página.</Vazio>;
  }

  const id = a.oficina.id;
  const [preco, assinaturas, pagamentos, codigo] = await Promise.all([
    a.sb.rpc('cobranca_preco', { p_oficina: id }),
    a.sb.from('assinaturas_pro').select(COLUNAS_ASSINATURA).eq('oficina_id', id).order('criado_em', { ascending: false }).limit(5),
    a.sb.from('pagamentos').select(COLUNAS_PAGAMENTO).eq('oficina_id', id).eq('tipo', 'pro').order('criado_em', { ascending: false }).limit(24),
    a.sb.rpc('cobranca_codigo_do_pro', { p_oficina: id })
  ]);
  for (const r of [preco, assinaturas, pagamentos, codigo]) if (r.error) console.error('[assinatura]', r.error.message);

  const lista = (assinaturas.data ?? []).map((l) => lerAssinatura(l as Record<string, unknown>));
  const viva = lista.find((x) => x.situacao !== 'cancelada') ?? null;
  const anterior = viva ? null : (lista.find((x) => x.situacao === 'cancelada') ?? null);
  const base = viva ?? lista[0] ?? null;
  const p = preco.data as { valor?: number; fundadora?: boolean; vagas?: number } | null;
  const c = codigo.data as { codigo?: string; ate?: string } | null;

  return (
    <PainelAssinatura
      oficina={{ nome: a.oficina.nome, proAte: a.oficina.proAte, plano: a.oficina.plano }}
      ligada={cobrancaLigada()}
      metodos={metodosDisponiveis()}
      preco={p?.valor ? ({ valor: Number(p.valor), fundadora: !!p.fundadora, vagas: Number(p.vagas ?? 0) } satisfies PrecoDoPro) : null}
      assinatura={viva}
      anterior={anterior}
      pagamentos={(pagamentos.data ?? []).map((l) => lerPagamento(l as Record<string, unknown>))}
      sugestao={{ nome: base?.nome_nota ?? a.oficina.nome, email: base?.email_nota ?? a.conta.usuario.email, documento: base?.documento ?? '' }}
      codigo={c?.codigo && c.ate ? { codigo: c.codigo, ate: c.ate } : null}
      hoje={hojeEmBrasilia()}
    />
  );
}
