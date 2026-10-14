'use server';

// Ações do servidor: pedido da loja e cadastro de interesse. O navegador manda só o que a pessoa
// escolheu; o banco confere os produtos e recalcula preços (gatilho calcular_pedido).

import { z } from 'zod';
import { normalizarTelefone } from '@/lib/formatos';
import { permitido } from '@/lib/limite';
import { supabaseServidor } from '@/lib/supabase';

type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function codigoPedido(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => LETRAS[b % LETRAS.length]).join('');
}

const esquemaPedido = z.object({
  oficina: z.object({
    nome: z.string().trim().min(2, 'Escreva o nome da oficina.').max(120),
    whatsapp: z.string().trim().max(30),
    cidade: z.string().trim().max(80).optional().default(''),
    uf: z
      .string()
      .trim()
      .regex(/^([A-Z]{2})?$/)
      .optional()
      .default('')
  }),
  itens: z
    .array(z.object({ produtoId: z.number().int().positive(), quantidade: z.number().int().min(1).max(999) }))
    .min(1, 'O pedido está vazio.')
    .max(50),
  observacao: z.string().trim().max(500).optional().default('')
});

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** O total como o banco calcula (mesma regra do gatilho), para a oficina guardar o valor certo. */
async function totalNoBanco(sb: NonNullable<ReturnType<typeof supabaseServidor>>, itens: Map<number, number>): Promise<number | null> {
  const ids = [...itens.keys()];
  const [p, pr] = await Promise.all([
    sb.from('produtos').select('id, preco').in('id', ids),
    sb.from('promocoes').select('produto_id, preco_promocional, quantidade_minima, inicio, fim').in('produto_id', ids)
  ]);
  if (p.error || pr.error) return null;
  const hoje = hojeEmSaoPaulo();
  let total = 0;
  for (const [id, quantidade] of itens) {
    const produto = p.data.find((x) => Number(x.id) === id);
    if (!produto) return null;
    const promocionais = pr.data
      .filter((x) => Number(x.produto_id) === id && x.inicio <= hoje && x.fim >= hoje && quantidade >= x.quantidade_minima)
      .map((x) => Number(x.preco_promocional));
    total += Math.min(Number(produto.preco), ...promocionais) * quantidade;
  }
  return Math.round(total * 100) / 100;
}

export async function enviarPedido(entrada: unknown): Promise<Resposta<{ codigo: string; total: number | null }>> {
  const r = esquemaPedido.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados do pedido.' };
  const { oficina, itens, observacao } = r.data;
  const whatsapp = normalizarTelefone(oficina.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Confira o WhatsApp da oficina, com DDD. É por ele que o fornecedor fala com você.' };
  if (!(await permitido('pedido', 8, 10))) return { ok: false, erro: 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.' };

  const sb = supabaseServidor();
  if (!sb) return { ok: false, erro: 'A loja ainda não está recebendo pedidos por aqui.' };

  // junta itens repetidos
  const porProduto = new Map<number, number>();
  for (const i of itens) porProduto.set(i.produtoId, Math.min(999, (porProduto.get(i.produtoId) ?? 0) + i.quantidade));

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = codigoPedido();
    const { error } = await sb.from('pedidos').insert({
      codigo,
      oficina_nome: oficina.nome,
      oficina_whatsapp: whatsapp,
      oficina_cidade: oficina.cidade || null,
      oficina_uf: oficina.uf || null,
      itens: [...porProduto].map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
      observacao: observacao || null
    });
    if (!error) return { ok: true, codigo, total: await totalNoBanco(sb, porProduto).catch(() => null) };
    if (error.code === '23505') continue; // código repetido: tenta outro
    if (error.code === 'P0001') return { ok: false, erro: 'Recebemos muitos pedidos seguidos deste WhatsApp. Espere um pouco e tente de novo.' };
    console.error('[pedido]', error);
    if (error.code === '22023') return { ok: false, erro: 'Algum produto do pedido saiu da loja. Atualize a página e confira o carrinho.' };
    return { ok: false, erro: 'Não deu para enviar agora. Tente de novo em instantes.' };
  }
  return { ok: false, erro: 'Não deu para enviar agora. Tente de novo em instantes.' };
}

const esquemaInteresse = z.object({
  tipo: z.enum(['oficina', 'fornecedor', 'motorista', 'contato']),
  nome: z.string().trim().min(2, 'Escreva o seu nome.').max(120),
  empresa: z.string().trim().max(120).optional().default(''),
  whatsapp: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  cidade: z.string().trim().max(80).optional().default(''),
  uf: z
    .string()
    .trim()
    .regex(/^([A-Z]{2})?$/)
    .optional()
    .default(''),
  plano: z.enum(['gratis', 'plus', 'vitrine', 'destaque', 'oferta', '']).optional().default(''),
  mensagem: z.string().trim().max(1000).optional().default(''),
  origem: z.string().trim().max(60).optional().default(''),
  consentimento: z.literal(true, { error: 'Marque que concorda em receber o contato.' }),
  // campo escondido: gente não preenche, robô sim
  site: z.string().max(0).optional().default('')
});

export async function registrarInteresse(entrada: unknown): Promise<Resposta> {
  const r = esquemaInteresse.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  const whatsapp = d.whatsapp ? normalizarTelefone(d.whatsapp) : null;
  if (d.whatsapp && !whatsapp) return { ok: false, erro: 'Confira o WhatsApp, com DDD.' };
  const email = d.email || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'Confira o e-mail.' };
  if (!whatsapp && !email) return { ok: false, erro: 'Deixe um WhatsApp ou um e-mail para a gente falar com você.' };
  if (!(await permitido('interesse', 6, 10))) return { ok: false, erro: 'Recebemos vários envios seguidos. Espere alguns minutos.' };

  const sb = supabaseServidor();
  if (!sb) return { ok: false, erro: 'O cadastro ainda não está ligado. Tente mais tarde.' };
  const { error } = await sb.from('interessados').insert({
    tipo: d.tipo,
    nome: d.nome,
    empresa: d.empresa || null,
    whatsapp,
    email,
    cidade: d.cidade || null,
    uf: d.uf || null,
    plano: d.plano || null,
    mensagem: d.mensagem || null,
    origem: d.origem || null,
    consentimento: true
  });
  if (error?.code === 'P0001') return { ok: false, erro: 'Já recebemos o seu contato. A gente fala com você em breve.' };
  if (error) {
    console.error('[interesse]', error);
    return { ok: false, erro: 'Não deu para enviar agora. Tente de novo em instantes.' };
  }
  return { ok: true };
}
