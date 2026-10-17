// A conta de quem entrou, como o banco devolve (minha_conta) e como o app usa.
// Sem nada de servidor aqui, para os componentes do navegador usarem os mesmos tipos.

import { z } from 'zod';

export const PAPEIS_OFICINA = [
  { id: 'dono', nome: 'Dono', descricao: 'Tudo, inclusive plano, equipe e apagar a oficina' },
  { id: 'gerente', nome: 'Gerente', descricao: 'Tudo do dia a dia e convidar mecânicos' },
  { id: 'mecanico', nome: 'Mecânico', descricao: 'Clientes, carros, ordens e estoque' }
] as const;
export type PapelOficina = (typeof PAPEIS_OFICINA)[number]['id'];

export const PAPEIS_LOJA = [
  { id: 'dono', nome: 'Dono', descricao: 'Tudo, inclusive chave Pix e equipe' },
  { id: 'vendedor', nome: 'Vendedor', descricao: 'Produtos, promoções, pedidos e alertas' }
] as const;
export type PapelLoja = (typeof PAPEIS_LOJA)[number]['id'];

export const PAPEIS_EQUIPE = [
  { id: 'admin', nome: 'Admin', descricao: 'Tudo, inclusive a equipe e o histórico' },
  { id: 'suporte', nome: 'Suporte', descricao: 'Oficinas, lojas, cadastros, pedidos e base' },
  { id: 'financeiro', nome: 'Financeiro', descricao: 'Planos, assinaturas, comissões e cobranças' }
] as const;
export type PapelEquipe = (typeof PAPEIS_EQUIPE)[number]['id'];

const data = z.string().nullish().transform((v) => v ?? null);

const esquemaOficina = z.object({
  id: z.uuid(),
  nome: z.string(),
  papel: z.enum(['dono', 'gerente', 'mecanico']),
  cidade: z.string().nullish().transform((v) => v ?? null),
  uf: z.string().nullish().transform((v) => v ?? null),
  whatsapp: z.string().nullish().transform((v) => v ?? null),
  endereco: z.string().nullish().transform((v) => v ?? null),
  proAte: data,
  testeAte: data,
  fundador: z.boolean().default(false),
  ativa: z.boolean().default(true),
  plano: z.enum(['pro', 'teste', 'gratis'])
});
export type OficinaDaConta = z.infer<typeof esquemaOficina>;

const esquemaLoja = z.object({
  id: z.coerce.number(),
  nome: z.string(),
  papel: z.enum(['dono', 'vendedor']),
  ativo: z.boolean(),
  verificacao: z.enum(['pendente', 'aprovada', 'recusada']).default('aprovada')
});
export type LojaDaConta = z.infer<typeof esquemaLoja>;

const esquemaConvite = z.object({
  id: z.uuid(),
  tipo: z.enum(['oficina', 'fornecedor']),
  papel: z.string(),
  nome: z.string().nullish().transform((v) => v ?? ''),
  expiraEm: z.string()
});
export type ConviteDaConta = z.infer<typeof esquemaConvite>;

export const esquemaConta = z.object({
  usuario: z.object({ id: z.uuid(), email: z.string() }),
  oficinas: z.array(esquemaOficina).default([]),
  fornecedores: z.array(esquemaLoja).default([]),
  convites: z.array(esquemaConvite).default([]),
  equipe: z.enum(['admin', 'suporte', 'financeiro']).nullish().transform((v) => v ?? null)
});
export type Conta = z.infer<typeof esquemaConta>;

export function lerConta(dados: unknown): Conta | null {
  const r = esquemaConta.safeParse(dados);
  return r.success ? r.data : null;
}

/** Para onde a pessoa vai depois de entrar, conforme o que ela tem. */
export function destinoDaConta(c: Conta, pedido: string | null): string {
  const seguro = pedido && /^\/(oficina|fornecedor)(\/[a-z0-9-]*)*$/.test(pedido) ? pedido : null;
  if (seguro?.startsWith('/oficina') && c.oficinas.length) return seguro;
  if (seguro?.startsWith('/fornecedor') && c.fornecedores.length) return seguro;
  if (c.convites.length) return '/conta';
  if (c.oficinas.length && !c.fornecedores.length) return '/oficina';
  if (c.fornecedores.length && !c.oficinas.length) return '/fornecedor';
  return '/conta';
}

export function nomeDoPapel(tipo: 'oficina' | 'fornecedor' | 'equipe', papel: string): string {
  const lista: readonly { id: string; nome: string }[] = tipo === 'oficina' ? PAPEIS_OFICINA : tipo === 'fornecedor' ? PAPEIS_LOJA : PAPEIS_EQUIPE;
  return lista.find((p) => p.id === papel)?.nome ?? papel;
}

/** Os erros do banco que viram mensagem para a pessoa (o resto vira "tente de novo"). */
export function mensagemDoBanco(e: { code?: string; message?: string } | null | undefined, padrao = 'Não deu para fazer isso agora. Tente de novo.'): string {
  if (!e) return padrao;
  const m = e.message ?? '';
  if (e.code === '28000') return 'Sua sessão terminou. Entre de novo.';
  if (e.code === '42501') return /[A-ZÀ-Ú]/.test(m.charAt(0)) && !/permission denied|violates row-level/i.test(m) ? m + '.' : 'Você não tem permissão para isso.';
  if (e.code === 'P0001' || /^RV\d{3}$/.test(e.code ?? '')) return m.endsWith('.') ? m : `${m}.`;
  if (e.code === '23505') return 'Isso já existe.';
  return padrao;
}
