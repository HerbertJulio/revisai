import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mensagemDoBanco } from '@/lib/conta-dados';
import { comDadosPrivados } from '@/lib/loja/privados';
import { lerAssinatura, lerPagamento, numeroOuZero } from './banco';
import { hojeEmBrasilia } from './documento';
import { configAsaas, configEfi, testeLigado } from './index';
import {
  COLUNAS_ASSINATURA,
  COLUNAS_PAGAMENTO,
  type AssinaturaNoPainel,
  type AvisoComProblema,
  type EstadoDosGateways,
  type LojaDoMes,
  type PagamentoNoPainel
} from './tipos';

// O que o painel da equipe mostra da cobrança. Lê como a pessoa da equipe (o banco só entrega
// tudo ao financeiro); nada aqui fala com o gateway.

export function estadoDosGateways(): EstadoDosGateways {
  const a = configAsaas();
  const e = configEfi();
  return {
    asaas: a ? { ambiente: a.ambiente, webhook: !!a.tokenWebhook, nota: !!a.nota } : null,
    efi: e ? { ambiente: e.ambiente, webhook: !!e.segredoWebhook } : null,
    teste: testeLigado()
  };
}

/** O mês anterior ao de hoje ('AAAA-MM'): o mês que as lojas pagam agora. */
export function mesParaCobrar(hoje = hojeEmBrasilia()): string {
  const [a, m] = hoje.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function outroMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

type Embutido = { nome?: string | null } | { nome?: string | null }[] | null | undefined;

function nomeEmbutido(v: Embutido): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return x?.nome ?? null;
}

export interface DadosDoPainel {
  assinaturas: AssinaturaNoPainel[];
  pagamentos: PagamentoNoPainel[];
  avisos: AvisoComProblema[];
  erros: string[];
}

export async function dadosDoPainel(sb: SupabaseClient): Promise<DadosDoPainel> {
  const erros: string[] = [];
  const [as, pg, av] = await Promise.all([
    sb.from('assinaturas_pro').select(`${COLUNAS_ASSINATURA}, oficina:oficinas(nome)`).order('criado_em', { ascending: false }).limit(500),
    sb
      .from('pagamentos')
      .select(`${COLUNAS_PAGAMENTO}, oficina:oficinas(nome), loja:fornecedores(nome)`)
      .order('criado_em', { ascending: false })
      .limit(600),
    sb.rpc('cobranca_webhooks_pendentes', { p_limite: 50 })
  ]);
  if (as.error) erros.push(`Assinaturas: ${mensagemDoBanco(as.error)}`);
  if (pg.error) erros.push(`Pagamentos: ${mensagemDoBanco(pg.error)}`);
  if (av.error) erros.push(`Avisos: ${mensagemDoBanco(av.error)}`);
  const assinaturas = (as.data ?? []).map((l) => {
    const r = l as Record<string, unknown>;
    return { ...lerAssinatura(r), oficina: nomeEmbutido(r.oficina as Embutido) ?? 'Oficina' };
  });
  const pagamentos = (pg.data ?? []).map((l) => {
    const r = l as Record<string, unknown>;
    return { ...lerPagamento(r), quem: nomeEmbutido(r.oficina as Embutido) ?? nomeEmbutido(r.loja as Embutido) ?? (r.tipo === 'loja' ? 'Loja' : 'Oficina') };
  });
  const avisos = ((av.data ?? []) as Record<string, unknown>[]).map((w) => ({
    provedor: String(w.provedor ?? ''),
    evento: String(w.evento ?? ''),
    tipo: (w.tipo as string | null) ?? null,
    recebidoEm: String(w.recebidoEm ?? ''),
    tentativas: numeroOuZero(w.tentativas),
    erro: (w.erro as string | null) ?? null
  }));
  return { assinaturas, pagamentos, avisos, erros };
}

export interface ExtratosDoMes {
  lojas: LojaDoMes[];
  /** A função do extrato ainda não existe neste banco. */
  semExtrato: boolean;
  erro: string | null;
}

/** O extrato do mês de cada loja (vendas, comissão e mensalidade), com as cobranças do mês. */
export async function lojasDoMes(sb: SupabaseClient, mes: string, pagamentos: PagamentoNoPainel[]): Promise<ExtratosDoMes> {
  const { data, error } = await sb.from('fornecedores').select('id, nome').eq('demonstracao', false).order('nome').limit(200);
  if (error) return { lojas: [], semExtrato: false, erro: mensagemDoBanco(error) };
  // o CNPJ não sai na leitura da tabela: vem da função dos dados privados (equipe e servidor)
  const lojas = (await comDadosPrivados(sb, (data ?? []) as { id: number; nome: string }[])).linhas;
  const resultado: LojaDoMes[] = [];
  let semExtrato = false;
  for (let i = 0; i < lojas.length && !semExtrato; i += 8) {
    const parte = await Promise.all(
      lojas.slice(i, i + 8).map(async (l) => {
        const r = await sb.rpc('extrato_da_loja', { p_fornecedor: l.id, p_mes: mes });
        const cobrancas = pagamentos.filter((p) => p.tipo === 'loja' && p.fornecedor_id === Number(l.id) && p.referencia === mes);
        if (r.error) {
          if (r.error.code === 'PGRST202' || r.error.code === '42883') semExtrato = true;
          return { fornecedorId: Number(l.id), nome: l.nome, cnpj: l.cnpj, totalVendas: 0, totalComissao: 0, mensalidade: 0, total: 0, pedidos: 0, cobrancas, erro: mensagemDoBanco(r.error) };
        }
        const x = (r.data ?? {}) as { totalVendas?: unknown; totalComissao?: unknown; mensalidade?: unknown; total?: unknown; partes?: unknown[] };
        return {
          fornecedorId: Number(l.id),
          nome: l.nome,
          cnpj: l.cnpj,
          totalVendas: numeroOuZero(x.totalVendas),
          totalComissao: numeroOuZero(x.totalComissao),
          mensalidade: numeroOuZero(x.mensalidade),
          total: numeroOuZero(x.total),
          pedidos: Array.isArray(x.partes) ? x.partes.length : 0,
          cobrancas,
          erro: null
        };
      })
    );
    resultado.push(...parte);
  }
  return { lojas: semExtrato ? [] : resultado, semExtrato, erro: null };
}
