// Ajudas dos testes do banco para a venda faturada, a API das lojas, a moderação e o limite de
// compra. Tudo dentro da transação do teste (emTransacao): nada fica no banco compartilhado.

import { criarLoja, criarOficina, criarPessoa, linhas, pessoa, tentar, type Banco, type Pessoa } from './ajuda';

/** Código de pedido de 6 letras e números que não repete entre chamadas. */
let contador = 0;
export function codigoNovo(): string {
  contador += 1;
  const base = (Date.now().toString(36) + Math.random().toString(36).slice(2)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${base.slice(-3)}${String(contador % 1000).padStart(3, '0')}`.slice(0, 6);
}

export interface Cenario {
  donoOficina: Pessoa;
  oficina: string;
  lojista: Pessoa;
  loja: { fornecedorId: number; produtoId: number };
}

/** Oficina com dono, loja com dono e um produto (preço 100). Com `comprou`, já há um pedido entre elas. */
export async function cenario(b: Banco, opcoes: { comprou?: boolean; preco?: number } = {}): Promise<Cenario> {
  const donoOficina = await criarPessoa(b, pessoa('oficina'));
  const lojista = await criarPessoa(b, pessoa('lojista'));
  const oficina = await criarOficina(b, donoOficina);
  const loja = await criarLoja(b, lojista, { preco: opcoes.preco ?? 100 });
  const c = { donoOficina, oficina, lojista, loja };
  if (opcoes.comprou) await pedir(b, c, [{ produto_id: loja.produtoId, quantidade: 1 }]);
  return c;
}

export interface Pedido {
  pedidoId: number;
  partes: { id: number; fornecedorId: number; subtotal: number; forma: string; prazo: number | null }[];
}

/** O pedido como a oficina manda (pelo papel dela); lança o erro do banco quando ele recusa. */
export async function pedir(
  b: Banco,
  c: { donoOficina: Pessoa; oficina: string },
  itens: { produto_id: number; quantidade: number }[],
  pagamentos: Record<string, unknown> | null = null,
  cashback: Record<string, number> | null = null
): Promise<Pedido> {
  const [p] = await linhas(
    b,
    c.donoOficina,
    `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens, pagamentos, cashback)
     values ($1, $2, 'x', '5521911112222', $3::jsonb, $4::jsonb, $5::jsonb) returning id`,
    [codigoNovo(), c.oficina, JSON.stringify(itens), pagamentos ? JSON.stringify(pagamentos) : null, cashback ? JSON.stringify(cashback) : null]
  );
  const r = await b.query('select id, fornecedor_id, subtotal, forma_pagamento, prazo_dias from public.pedidos_fornecedores where pedido_id = $1 order by fornecedor_id', [p.id]);
  return {
    pedidoId: Number(p.id),
    partes: r.rows.map((x) => ({ id: Number(x.id), fornecedorId: Number(x.fornecedor_id), subtotal: Number(x.subtotal), forma: String(x.forma_pagamento), prazo: x.prazo_dias == null ? null : Number(x.prazo_dias) }))
  };
}

/** O mesmo pedido, devolvendo o erro do banco (código, mensagem, detail e hint) em vez de lançar. */
export async function tentarPedir(
  b: Banco,
  c: { donoOficina: Pessoa; oficina: string },
  itens: { produto_id: number; quantidade: number }[],
  pagamentos: Record<string, unknown> | null = null,
  cashback: Record<string, number> | null = null
): Promise<{ codigo: string | null; erro: string | null; detail: string | null; hint: string | null; pedido: Pedido | null }> {
  try {
    const pedido = await pedir(b, c, itens, pagamentos, cashback);
    return { codigo: null, erro: null, detail: null, hint: null, pedido };
  } catch (e) {
    const x = e as { code?: string; message?: string; detail?: string; hint?: string };
    return { codigo: x.code ?? null, erro: x.message ?? String(e), detail: x.detail ?? null, hint: x.hint ?? null, pedido: null };
  }
}

/** A loja muda a parte do pedido (como o lojista). */
export function mudarParte(b: Banco, p: Pessoa, parte: number, sql: string) {
  return tentar(b, p, `update public.pedidos_fornecedores set ${sql} where id = $1`, [parte]);
}

/** O dono da loja dá (ou muda) o crédito da oficina, como o painel faz. */
export function darCredito(b: Banco, p: Pessoa, fornecedorId: number, oficinaId: string, limite: number, prazo: number, ativo = true) {
  return tentar(
    b,
    p,
    `insert into public.lojas_credito (fornecedor_id, oficina_id, limite, prazo_dias, ativo) values ($1, $2, $3, $4, $5)
     on conflict (fornecedor_id, oficina_id) do update set limite = excluded.limite, prazo_dias = excluded.prazo_dias, ativo = excluded.ativo
     returning id`,
    [fornecedorId, oficinaId, limite, prazo, ativo]
  );
}

/** Põe um vendedor na loja (convite aceito). */
export async function vendedorDaLoja(b: Banco, dono: Pessoa, fornecedorId: number): Promise<Pessoa> {
  const vendedor = await criarPessoa(b, pessoa('vendedor'));
  await linhas(b, dono, `select public.convidar('fornecedor', $1, $2, 'vendedor')`, [String(fornecedorId), vendedor.email]);
  await linhas(b, vendedor, 'select public.aceitar_convite()');
  return vendedor;
}
