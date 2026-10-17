import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { configWhatsApp } from '../agente/whatsapp-cloud';
import { formatarMoeda } from '../formatos';

// Avisos para a loja pelo WhatsApp, para quando o painel está fechado: pedido novo, alerta de preço
// novo da região, troca da chave Pix pedida e pedido de devolução ou garantia. Mensagem que a empresa começa precisa de modelo
// aprovado na Meta; sem o modelo configurado, nada é mandado (o painel ao vivo continua avisando).
// Variáveis (cada uma é o nome do modelo na Meta):
//   WHATSAPP_MODELO_LOJA_PEDIDO  {{1}} código do pedido, {{2}} oficina, {{3}} total
//   WHATSAPP_MODELO_LOJA_ALERTA  {{1}} produto, {{2}} cidade da oficina
//   WHATSAPP_MODELO_LOJA_PIX     {{1}} loja, {{2}} quando a chave nova vale
//   WHATSAPP_MODELO_LOJA_DEVOLUCAO {{1}} código da compra, {{2}} oficina, {{3}} "devolução" ou "garantia"
//   WHATSAPP_MODELO_IDIOMA       idioma dos modelos (padrão pt_BR)
// A loja desliga os avisos em Sua loja (fornecedores.avisar_whatsapp).

const VERSAO = process.env.WHATSAPP_API_VERSAO?.trim() || 'v23.0';
const MAXIMO_DE_LOJAS_POR_ALERTA = 20;

type Modelo = 'pedido' | 'alerta' | 'pix' | 'devolucao';

function nomeDoModelo(m: Modelo): string | null {
  const v = {
    pedido: process.env.WHATSAPP_MODELO_LOJA_PEDIDO,
    alerta: process.env.WHATSAPP_MODELO_LOJA_ALERTA,
    pix: process.env.WHATSAPP_MODELO_LOJA_PIX,
    devolucao: process.env.WHATSAPP_MODELO_LOJA_DEVOLUCAO
  }[m];
  return v?.trim() || null;
}

/** Manda um modelo aprovado. Devolve false sem configuração, sem número ou se a Meta recusar. */
export async function mandarModelo(para: string | null | undefined, modelo: Modelo, parametros: string[]): Promise<boolean> {
  const c = configWhatsApp();
  const nome = nomeDoModelo(modelo);
  if (!c || !nome || !para || !/^55\d{10,11}$/.test(para)) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSAO}/${c.numeroId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para,
        type: 'template',
        template: {
          name: nome,
          language: { code: process.env.WHATSAPP_MODELO_IDIOMA?.trim() || 'pt_BR' },
          components: [{ type: 'body', parameters: parametros.map((t) => ({ type: 'text', text: t.replace(/\s+/g, ' ').trim().slice(0, 120) || '-' })) }]
        }
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) console.error('[loja] aviso whatsapp', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return r.ok;
  } catch (e) {
    console.error('[loja] aviso whatsapp', e);
    return false;
  }
}

export interface LojaParaAviso {
  id: number;
  nome: string;
  whatsapp: string | null;
  avisar_whatsapp: boolean | null;
}

async function lojas(sb: SupabaseClient, ids: number[]): Promise<LojaParaAviso[]> {
  if (!ids.length) return [];
  const { data, error } = await sb.from('fornecedores').select('id, nome, whatsapp, avisar_whatsapp').in('id', ids);
  if (error) {
    console.error('[loja] lojas para avisar', error);
    return [];
  }
  return ((data ?? []) as LojaParaAviso[]).filter((l) => l.avisar_whatsapp !== false && !!l.whatsapp);
}

/** A loja que recebe o aviso (null quando ela desligou os avisos ou não tem WhatsApp). */
export async function lojaParaAviso(sb: SupabaseClient, fornecedorId: number): Promise<LojaParaAviso | null> {
  return (await lojas(sb, [fornecedorId]))[0] ?? null;
}

/** A loja pediu a troca da chave Pix: avisa no WhatsApp da loja (quem não pediu pode cancelar a tempo). */
export async function avisarTrocaDePix(loja: LojaParaAviso, valeEm: string): Promise<boolean> {
  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(valeEm));
  return mandarModelo(loja.whatsapp, 'pix', [loja.nome, quando]);
}

/**
 * Pedido novo: cada loja do pedido recebe o aviso com a parte dela. Para a oficina chamar depois de
 * mandar o pedido (com o cliente dela: a oficina lê as partes do próprio pedido e o contato público das lojas).
 */
export async function avisarLojasDoPedido(sb: SupabaseClient, pedidoId: number): Promise<number> {
  const { data, error } = await sb.from('pedidos_fornecedores').select('fornecedor_id, codigo, oficina_nome, subtotal').eq('pedido_id', pedidoId);
  if (error || !data?.length) return 0;
  const partes = data as { fornecedor_id: number; codigo: string | null; oficina_nome: string | null; subtotal: number }[];
  const destino = await lojas(
    sb,
    partes.map((p) => Number(p.fornecedor_id))
  );
  let n = 0;
  for (const loja of destino) {
    const p = partes.find((x) => Number(x.fornecedor_id) === loja.id);
    if (p && (await mandarModelo(loja.whatsapp, 'pedido', [p.codigo ?? '', p.oficina_nome ?? 'uma oficina', formatarMoeda(Number(p.subtotal))]))) n++;
  }
  return n;
}

/**
 * Alerta de preço novo: avisa as lojas no ar do estado que vendem a categoria (no máximo 20, as que
 * têm mais produtos da categoria primeiro). Também para a oficina chamar depois de criar o alerta.
 */
export async function avisarLojasDoAlerta(sb: SupabaseClient, alertaId: string): Promise<number> {
  const a = await sb.from('alertas_preco').select('oficina_uf, oficina_cidade, categoria, titulo').eq('id', alertaId).maybeSingle();
  const alerta = a.data as { oficina_uf: string; oficina_cidade: string | null; categoria: string; titulo: string } | null;
  if (a.error || !alerta) return 0;
  const f = await sb.from('fornecedores').select('id').eq('uf', alerta.oficina_uf).eq('ativo', true).limit(500);
  const ids = ((f.data ?? []) as { id: number }[]).map((x) => Number(x.id));
  if (!ids.length) return 0;
  const p = await sb.from('produtos').select('fornecedor_id').eq('categoria', alerta.categoria).eq('ativo', true).in('fornecedor_id', ids).limit(5000);
  const contagem = new Map<number, number>();
  for (const x of (p.data ?? []) as { fornecedor_id: number }[]) contagem.set(Number(x.fornecedor_id), (contagem.get(Number(x.fornecedor_id)) ?? 0) + 1);
  const escolhidas = [...contagem.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, MAXIMO_DE_LOJAS_POR_ALERTA)
    .map(([id]) => id);
  let n = 0;
  for (const loja of await lojas(sb, escolhidas)) if (await mandarModelo(loja.whatsapp, 'alerta', [alerta.titulo, alerta.oficina_cidade ?? alerta.oficina_uf])) n++;
  return n;
}

/**
 * Pedido de devolução ou garantia novo: avisa a loja da compra. Para a oficina chamar depois de abrir o
 * pedido (com o cliente dela: ela lê a própria devolução e o contato público da loja).
 */
export async function avisarLojaDaDevolucao(sb: SupabaseClient, devolucaoId: string): Promise<boolean> {
  const { data, error } = await sb.from('devolucoes').select('fornecedor_id, codigo, tipo, parte:pedidos_fornecedores(oficina_nome)').eq('id', devolucaoId).maybeSingle();
  if (error || !data) return false;
  const d = data as { fornecedor_id: number | string; codigo: string | null; tipo: string; parte: { oficina_nome: string | null } | { oficina_nome: string | null }[] | null };
  const parte = Array.isArray(d.parte) ? d.parte[0] : d.parte;
  const loja = await lojaParaAviso(sb, Number(d.fornecedor_id));
  if (!loja) return false;
  return mandarModelo(loja.whatsapp, 'devolucao', [d.codigo ?? '', parte?.oficina_nome ?? 'uma oficina', d.tipo === 'garantia' ? 'garantia' : 'devolução']);
}
