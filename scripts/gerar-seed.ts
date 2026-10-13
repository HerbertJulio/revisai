// Gera supabase/seed.sql a partir do catálogo de exemplo (lib/catalogo-demo.ts).
// Uso: npm run seed. Depois rode o arquivo no SQL Editor do Supabase (ou supabase db reset).
import { writeFileSync } from 'node:fs';
import { CATALOGO_EXEMPLO } from '../lib/catalogo-demo.ts';

function q(v: unknown): string {
  if (v == null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function linhas(valores: unknown[][]): string {
  return valores.map((v) => `  (${v.map(q).join(', ')})`).join(',\n');
}

const { fornecedores, produtos, promocoes } = CATALOGO_EXEMPLO;

const sql = `-- Catálogo de exemplo, gerado por "npm run seed" a partir de lib/catalogo-demo.ts.
-- Fornecedores fictícios (demonstracao = true) e preços ilustrativos.

insert into public.fornecedores (id, nome, cidade, uf, demonstracao) values
${linhas(fornecedores.map((f) => [f.id, f.nome, f.cidade, f.uf, f.demonstracao]))}
on conflict (id) do update set nome = excluded.nome, cidade = excluded.cidade, uf = excluded.uf, demonstracao = excluded.demonstracao;

insert into public.produtos (id, fornecedor_id, categoria, nome, marca, descricao, unidade, conteudo, preco, especificacao, intervalo_km, intervalo_meses) values
${linhas(produtos.map((p) => [p.id, p.fornecedorId, p.categoria, p.nome, p.marca, p.descricao, p.unidade, p.conteudo, p.preco, p.especificacao, p.intervaloKm, p.intervaloMeses]))}
on conflict (id) do update set fornecedor_id = excluded.fornecedor_id, categoria = excluded.categoria, nome = excluded.nome, marca = excluded.marca,
  descricao = excluded.descricao, unidade = excluded.unidade, conteudo = excluded.conteudo, preco = excluded.preco,
  especificacao = excluded.especificacao, intervalo_km = excluded.intervalo_km, intervalo_meses = excluded.intervalo_meses;

insert into public.promocoes (id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim) values
${linhas(promocoes.map((p) => [p.id, p.produtoId, p.titulo, p.precoPromocional, p.quantidadeMinima, p.inicio, p.fim]))}
on conflict (id) do update set produto_id = excluded.produto_id, titulo = excluded.titulo, preco_promocional = excluded.preco_promocional,
  quantidade_minima = excluded.quantidade_minima, inicio = excluded.inicio, fim = excluded.fim;

select setval(pg_get_serial_sequence('public.fornecedores', 'id'), (select max(id) from public.fornecedores));
select setval(pg_get_serial_sequence('public.produtos', 'id'), (select max(id) from public.produtos));
select setval(pg_get_serial_sequence('public.promocoes', 'id'), (select max(id) from public.promocoes));
`;

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log(`supabase/seed.sql: ${fornecedores.length} fornecedores, ${produtos.length} produtos, ${promocoes.length} promoções`);
