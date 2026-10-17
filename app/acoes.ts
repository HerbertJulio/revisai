'use server';

// Ações do servidor: pedido da loja, cadastro de interesse, sugestão para a base de prazos e a
// previsão de compras. O pedido, a sugestão e a previsão saem como a pessoa que entrou, pela
// oficina escolhida (o banco aplica as regras dela e recalcula os preços no gatilho
// calcular_pedido); o cadastro de interesse do site é público.

import { after } from 'next/server';
import { z } from 'zod';
import { itensFechados, type ItemFechado } from '@/lib/alertas';
import { CATEGORIAS } from '@/lib/catalogo';
import { codigoPedido } from '@/lib/codigo-pedido';
import { acessoDaOficina } from '@/lib/conta';
import { mensagemDoBanco } from '@/lib/conta-dados';
import { normalizarTelefone } from '@/lib/formatos';
import { permitido } from '@/lib/limite';
import { avisarLojasDoPedido } from '@/lib/loja/avisos';
import { esquemaContatoDoPedido, mensagemDoPedido } from '@/lib/marketplace-dados';
import { clienteSistema } from '@/lib/supabase-servidor';
import type { Categoria } from '@/lib/tipos';

/** `semConta`: a pessoa não entrou (ou saiu); a tela manda para o login. */
type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string; semConta?: boolean };

const esquemaPedido = z.object({
  itens: z
    .array(z.object({ produtoId: z.number().int().positive(), quantidade: z.number().int().min(1).max(999) }))
    .min(1, 'O pedido está vazio.')
    .max(50),
  observacao: z.string().trim().max(500).optional().default(''),
  contato: esquemaContatoDoPedido,
  /** Quanto do cashback usar em cada loja ({ "<loja>": valor }); o banco confere o saldo. */
  cashback: z
    .record(z.string().regex(/^[1-9]\d{0,17}$/, 'Loja inválida no cashback.'), z.number().min(0).max(1_000_000))
    .optional()
    .default({})
    .transform((c) => Object.fromEntries(Object.entries(c).map(([loja, v]) => [loja, Math.round(v * 100) / 100]).filter(([, v]) => (v as number) > 0)) as Record<string, number>)
});

/**
 * O pedido da oficina para as lojas. Sai como a pessoa que entrou, pela oficina escolhida; o banco
 * põe o nome e o WhatsApp do cadastro da oficina, confere os produtos, calcula os preços e divide
 * o pedido entre as lojas. Volta com os itens como o banco calculou.
 */
export async function enviarPedido(entrada: unknown): Promise<Resposta<{ codigo: string; total: number; itens: ItemFechado[]; cashback: number }>> {
  const r = esquemaPedido.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados do pedido.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  const { itens, observacao, contato, cashback } = r.data;
  const whatsapp = normalizarTelefone(a.oficina.whatsapp ?? '') ?? normalizarTelefone(contato.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Confira o WhatsApp da oficina, com DDD. É por ele que a loja fala com você.' };
  if (!(await permitido('pedido', 8, 10))) return { ok: false, erro: 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.' };

  // junta itens repetidos
  const porProduto = new Map<number, number>();
  for (const i of itens) porProduto.set(i.produtoId, Math.min(999, (porProduto.get(i.produtoId) ?? 0) + i.quantidade));

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = codigoPedido();
    const { data, error } = await a.sb
      .from('pedidos')
      .insert({
        codigo,
        oficina_id: a.oficina.id,
        oficina_nome: a.oficina.nome,
        oficina_whatsapp: whatsapp,
        oficina_cidade: contato.cidade || null,
        oficina_uf: contato.uf || null,
        oficina_endereco: contato.endereco || null,
        itens: [...porProduto].map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
        observacao: observacao || null,
        cashback: Object.keys(cashback).length ? cashback : null
      })
      .select('id, itens, total')
      .single();
    if (!error && data) {
      const pedido = data as { id: number | string; itens: unknown; total: number | string };
      // o aviso no WhatsApp das lojas sai depois da resposta (sem o modelo configurado, não sai nada)
      after(async () => {
        try {
          await avisarLojasDoPedido(a.sb, Number(pedido.id));
        } catch (e) {
          console.error('[pedido] aviso às lojas', e);
        }
      });
      const usado = Math.round(Object.values(cashback).reduce((s, v) => s + v, 0) * 100) / 100;
      return { ok: true, codigo, total: Number(pedido.total), itens: itensFechados(pedido.itens), cashback: usado };
    }
    if (error?.code === '23505') continue; // código repetido: tenta outro
    const m = mensagemDoPedido(error);
    if (m) return { ok: false, erro: m, ...(error?.code === '28000' ? { semConta: true } : {}) };
    console.error('[pedido]', error);
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

  // o banco só aceita o cadastro pelo servidor (com o limite por IP acima)
  const sb = clienteSistema();
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
 * A oficina sugere um produto dela para a base de prazos. Entra como não aprovado: a equipe
 * confere a fonte antes de aparecer para as outras oficinas.
 */
export async function sugerirParaBase(entrada: unknown): Promise<Resposta> {
  const r = esquemaSugestao.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: 'Entre na sua conta para sugerir produtos para a base.', semConta: true };
  if (!(await permitido('sugestao', 10, 60))) return { ok: false, erro: 'Recebemos várias sugestões seguidas. Tente de novo mais tarde.' };
  const d = r.data;
  const { error } = await a.sb.from('produtos_referencia').insert({
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
    if (error.code !== '42501') console.error('[sugestao]', error);
    return { ok: false, erro: mensagemDoBanco(error, 'Não deu para enviar agora. Tente de novo em instantes.') };
  }
  return { ok: true };
}

const esquemaDemanda = z.object({
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
 * Previsão de compras dos próximos 30 dias, da oficina que aceitou compartilhar. Vai só o que
 * comprar, a cidade e o estado; uma linha por oficina (o id é o da oficina). As lojas veem só a
 * soma da região.
 */
export async function enviarDemanda(entrada: unknown): Promise<Resposta> {
  const r = esquemaDemanda.safeParse(entrada);
  if (!r.success) return { ok: false, erro: 'Previsão inválida.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido('demanda', 6, 60))) return { ok: false, erro: 'Envios demais. Tente mais tarde.' };
  const d = r.data;
  const { error } = await a.sb.from('demandas').upsert(
    {
      id: a.oficina.id,
      oficina_id: a.oficina.id,
      uf: d.uf || (a.oficina.uf && /^[A-Z]{2}$/.test(a.oficina.uf) ? a.oficina.uf : null),
      cidade: (d.cidade || a.oficina.cidade || '').slice(0, 80) || null,
      itens: d.itens,
      atualizado_em: new Date().toISOString()
    },
    { onConflict: 'id' }
  );
  if (error) {
    console.error('[demanda]', error);
    return { ok: false, erro: 'Não deu para enviar agora.' };
  }
  return { ok: true };
}
