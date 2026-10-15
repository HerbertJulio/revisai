'use server';

// Ações do servidor: pedido da loja e cadastro de interesse. O navegador manda só o que a pessoa
// escolheu; o banco confere os produtos e recalcula preços (gatilho calcular_pedido).

import { z } from 'zod';
import { CATEGORIAS } from '@/lib/catalogo';
import { codigoPedido } from '@/lib/codigo-pedido';
import { clienteEquipe } from '@/lib/equipe';
import { normalizarTelefone } from '@/lib/formatos';
import { permitido } from '@/lib/limite';
import { supabaseServidor } from '@/lib/supabase';
import type { Categoria } from '@/lib/tipos';

type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

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
  observacao: z.string().trim().max(500).optional().default(''),
  /** Número aleatório do aparelho: com ele e o código, a oficina acompanha o pedido. */
  aparelhoId: z.uuid().optional(),
  endereco: z.string().trim().max(160).optional().default('')
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
  const { oficina, itens, observacao, aparelhoId, endereco } = r.data;
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
      observacao: observacao || null,
      aparelho_id: aparelhoId ?? null,
      oficina_endereco: endereco || null
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

const esquemaSugestao = z
  .object({
    categoria: z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]),
    marca: z.string().trim().min(1, 'Escreva a marca do produto.').max(80),
    nome: z.string().trim().min(2, 'Escreva o nome do produto.').max(160),
    intervaloKm: z.number().int().min(100).max(500000).nullable(),
    intervaloMeses: z.number().int().min(1).max(240).nullable(),
    observacao: z.string().trim().max(600).optional().default('')
  })
  .refine((x) => x.intervaloKm != null || x.intervaloMeses != null, { message: 'Informe o prazo em km ou em meses.' });

/**
 * A oficina sugere um produto dela para a base de prazos. Entra como não aprovado:
 * a equipe confere a fonte antes de aparecer para as outras oficinas.
 */
export async function sugerirParaBase(entrada: unknown): Promise<Resposta> {
  const r = esquemaSugestao.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  if (!(await permitido('sugestao', 10, 60))) return { ok: false, erro: 'Recebemos várias sugestões seguidas. Tente de novo mais tarde.' };
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: 'A base ainda não está ligada. Tente mais tarde.' };
  const d = r.data;
  const { error } = await sb.from('produtos_referencia').insert({
    categoria: d.categoria,
    marca: d.marca,
    linha: d.nome,
    intervalo_km: d.intervaloKm,
    intervalo_meses: d.intervaloMeses,
    observacao: d.observacao || null,
    fonte_nome: 'Sugestão de oficina pelo app',
    confianca: 'oficina',
    origem: 'oficina',
    aprovado: false
  });
  if (error) {
    console.error('[sugestao]', error);
    return { ok: false, erro: 'Não deu para enviar agora. Tente de novo em instantes.' };
  }
  return { ok: true };
}

const esquemaDemanda = z.object({
  id: z.uuid(),
  uf: z
    .string()
    .trim()
    .regex(/^([A-Z]{2})?$/)
    .optional()
    .default(''),
  cidade: z.string().trim().max(80).optional().default(''),
  itens: z
    .array(
      z.object({
        categoria: z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]),
        titulo: z.string().trim().min(1).max(120),
        quantidade: z.number().min(0).max(100000),
        unidade: z.enum(['L', 'un']),
        carros: z.number().int().min(1).max(10000)
      })
    )
    .max(200)
});

/**
 * Previsão de compras dos próximos 30 dias, de uma oficina que aceitou compartilhar.
 * Vai só o que comprar, a cidade e o estado; o id é um número aleatório do aparelho.
 */
export async function enviarDemanda(entrada: unknown): Promise<Resposta> {
  const r = esquemaDemanda.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Previsão inválida.' };
  if (!(await permitido('demanda', 6, 60))) return { ok: false, erro: 'Envios demais. Tente mais tarde.' };
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: 'Ainda não está ligado.' };
  const d = r.data;
  const { error } = await sb
    .from('demandas')
    .upsert({ id: d.id, uf: d.uf || null, cidade: d.cidade || null, itens: d.itens, atualizado_em: new Date().toISOString() }, { onConflict: 'id' });
  if (error) {
    console.error('[demanda]', error);
    return { ok: false, erro: 'Não deu para enviar agora.' };
  }
  return { ok: true };
}
