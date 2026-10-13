-- Catálogo de exemplo, gerado por "npm run seed" a partir de lib/catalogo-demo.ts.
-- Fornecedores fictícios (demonstracao = true) e preços ilustrativos.

insert into public.fornecedores (id, nome, cidade, uf, demonstracao) values
  (1, 'Distribuidora de Lubrificantes', 'Rio de Janeiro', 'RJ', true),
  (2, 'Central de Filtros', 'Duque de Caxias', 'RJ', true),
  (3, 'Freios & Suspensão', 'Niterói', 'RJ', true),
  (4, 'Pneus & Baterias', 'Nova Iguaçu', 'RJ', true)
on conflict (id) do update set nome = excluded.nome, cidade = excluded.cidade, uf = excluded.uf, demonstracao = excluded.demonstracao;

insert into public.produtos (id, fornecedor_id, categoria, nome, marca, descricao, unidade, conteudo, preco, especificacao, intervalo_km, intervalo_meses) values
  (101, 1, 'oleo_motor', 'Óleo 5W-30 sintético API SP dexos1 Gen 3', null, 'Para motores GM que pedem dexos1, como o Onix 1.0 turbo.', 'L', 1, 46.9, '{"viscosidade":"5W-30","base":"sintetico","api":"SP","ilsac":"GF-6A","normas":["GM dexos1 Gen 3"]}'::jsonb, null, null),
  (102, 1, 'oleo_motor', 'Óleo 0W-20 sintético API SP dexos1 Gen 3', null, 'Para motores que pedem 0W-20 API SP ou dexos1, como o Onix aspirado e o Firefly.', 'L', 1, 52.9, '{"viscosidade":"0W-20","base":"sintetico","api":"SP","ilsac":"GF-6A","normas":["GM dexos1 Gen 3"]}'::jsonb, null, null),
  (103, 1, 'oleo_motor', 'Óleo 5W-40 sintético VW 508 88', null, 'Para os motores TSI da Volkswagen (Polo, Virtus, Nivus, T-Cross).', 'L', 1, 54.9, '{"viscosidade":"5W-40","base":"sintetico","api":"SP","acea":["A3/B4"],"normas":["VW 508 88"]}'::jsonb, null, null),
  (104, 1, 'oleo_motor', 'Óleo 0W-30 sintético ACEA C2 Fiat 9.55535-GS1', null, 'Para os turbo T200 e T270 (Strada, Pulse, Fastback, Compass, Renegade).', 'L', 1, 59.9, '{"viscosidade":"0W-30","base":"sintetico","acea":["C2"],"normas":["Fiat 9.55535-GS1"]}'::jsonb, null, null),
  (105, 1, 'oleo_motor', 'Óleo 5W-30 sintético API SP ACEA A5/B5', null, null, 'L', 1, 42.9, '{"viscosidade":"5W-30","base":"sintetico","api":"SP","acea":["A5/B5"]}'::jsonb, null, null),
  (106, 1, 'oleo_motor', 'Óleo 0W-30 sintético API SP', null, null, 'L', 1, 49.9, '{"viscosidade":"0W-30","base":"sintetico","api":"SP","ilsac":"GF-6A"}'::jsonb, null, null),
  (107, 1, 'oleo_motor', 'Óleo 10W-40 semissintético API SN', null, null, 'L', 1, 34.9, '{"viscosidade":"10W-40","base":"semissintetico","api":"SN"}'::jsonb, null, null),
  (108, 1, 'oleo_motor', 'Óleo 15W-40 semissintético API SL', null, null, 'L', 1, 31.9, '{"viscosidade":"15W-40","base":"semissintetico","api":"SL"}'::jsonb, null, null),
  (109, 1, 'oleo_motor', 'Óleo 20W-50 mineral API SL', null, 'Para motores antigos que pedem óleo mineral. Prazo menor: 5.000 km ou 6 meses.', 'L', 1, 26.9, '{"viscosidade":"20W-50","base":"mineral","api":"SL"}'::jsonb, 5000, 6),
  (110, 1, 'oleo_motor', 'Óleo 5W-30 sintético API SP dexos1 Gen 3', null, null, 'L', 4, 169.9, '{"viscosidade":"5W-30","base":"sintetico","api":"SP","ilsac":"GF-6A","normas":["GM dexos1 Gen 3"]}'::jsonb, null, null),
  (111, 1, 'oleo_motor', 'Kit troca de óleo 5W-30 dexos1 Gen 3 (4 L e filtro)', null, 'Quatro litros e o filtro de óleo. Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'kit', 4, 199.9, '{"viscosidade":"5W-30","base":"sintetico","api":"SP","ilsac":"GF-6A","normas":["GM dexos1 Gen 3"]}'::jsonb, null, null),
  (112, 1, 'arrefecimento', 'Líquido de arrefecimento pronto para uso (1 L)', null, 'Não misture com outro tipo de aditivo.', 'un', null, 27.9, '{}'::jsonb, null, null),
  (113, 1, 'fluido_cambio', 'Fluido ATF para câmbio automático', null, 'Confira a norma do câmbio no manual.', 'L', 1, 69.9, '{}'::jsonb, null, null),
  (114, 1, 'fluido_cambio', 'Óleo para câmbio manual 75W-80 GL-4', null, null, 'L', 1, 49.9, '{}'::jsonb, null, null),
  (201, 2, 'filtro_oleo', 'Filtro de óleo blindado', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 29.9, '{}'::jsonb, null, null),
  (202, 2, 'filtro_oleo', 'Filtro de óleo refil (elemento)', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 24.9, '{}'::jsonb, null, null),
  (203, 2, 'filtro_ar', 'Filtro de ar do motor', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 44.9, '{}'::jsonb, null, null),
  (204, 2, 'filtro_cabine', 'Filtro de cabine com carvão ativado', null, 'Segura também cheiros e gases. Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 49.9, '{}'::jsonb, null, null),
  (205, 2, 'filtro_cabine', 'Filtro de cabine comum', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 34.9, '{}'::jsonb, null, null),
  (206, 2, 'filtro_combustivel', 'Filtro de combustível flex', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 32.9, '{}'::jsonb, null, null),
  (207, 2, 'higienizacao_ar', 'Higienizador de ar-condicionado em espuma', null, null, 'un', null, 39.9, '{}'::jsonb, null, null),
  (208, 2, 'vela', 'Velas de ignição de níquel (jogo com 4)', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'jogo', null, 89.9, '{"tipo":"níquel"}'::jsonb, 30000, 36),
  (209, 2, 'vela', 'Vela de ignição de irídio', null, 'Vida longa, de 40 a 100 mil km conforme o motor. Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 89.9, '{"tipo":"irídio"}'::jsonb, 60000, 60),
  (210, 2, 'correia_dentada', 'Kit correia dentada com tensor', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'kit', null, 289.9, '{}'::jsonb, null, null),
  (211, 2, 'correia_acessorios', 'Correia de acessórios (poli-V)', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'un', null, 79.9, '{}'::jsonb, null, null),
  (301, 3, 'pastilha_freio', 'Pastilhas de freio dianteiras', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'jogo', null, 139.9, '{}'::jsonb, null, null),
  (302, 3, 'disco_freio', 'Discos de freio dianteiros ventilados', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'par', null, 329.9, '{}'::jsonb, null, null),
  (303, 3, 'fluido_freio', 'Fluido de freio DOT 4 (500 ml)', null, null, 'un', null, 34.9, '{"tipo":"DOT 4"}'::jsonb, null, null),
  (304, 3, 'amortecedor', 'Amortecedores dianteiros', null, 'Troque sempre em pares. Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'par', null, 589.9, '{}'::jsonb, null, null),
  (401, 4, 'pneu', 'Pneu 175/70 R14', null, null, 'un', null, 359.9, '{"medida":"175/70 R14"}'::jsonb, 40000, 60),
  (402, 4, 'pneu', 'Pneu 185/65 R15', null, null, 'un', null, 419.9, '{"medida":"185/65 R15"}'::jsonb, 40000, 60),
  (403, 4, 'pneu', 'Pneu 195/55 R16', null, null, 'un', null, 489.9, '{"medida":"195/55 R16"}'::jsonb, 40000, 60),
  (404, 4, 'pneu', 'Pneu 205/60 R16', null, null, 'un', null, 529.9, '{"medida":"205/60 R16"}'::jsonb, 40000, 60),
  (405, 4, 'bateria', 'Bateria 45 Ah', null, 'Teste a cada revisão a partir de 2 anos.', 'un', null, 429.9, '{"amperagem":45}'::jsonb, null, 24),
  (406, 4, 'bateria', 'Bateria 60 Ah', null, 'Teste a cada revisão a partir de 2 anos.', 'un', null, 549.9, '{"amperagem":60}'::jsonb, null, 24),
  (407, 4, 'palheta', 'Palhetas dianteiras', null, 'Consulte a aplicação pelo modelo, ano e motor antes de pedir.', 'par', null, 69.9, '{}'::jsonb, null, null)
on conflict (id) do update set fornecedor_id = excluded.fornecedor_id, categoria = excluded.categoria, nome = excluded.nome, marca = excluded.marca,
  descricao = excluded.descricao, unidade = excluded.unidade, conteudo = excluded.conteudo, preco = excluded.preco,
  especificacao = excluded.especificacao, intervalo_km = excluded.intervalo_km, intervalo_meses = excluded.intervalo_meses;

insert into public.promocoes (id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim) values
  (1, 101, 'Semana do óleo', 39.9, 4, '2026-10-01', '2026-10-31'),
  (2, 111, 'Kit com desconto', 179.9, 1, '2026-10-01', '2026-11-30'),
  (3, 102, 'Lançamento 0W-20', 46.9, 1, '2026-10-01', '2026-11-15'),
  (4, 201, 'Caixa com 10', 22.9, 10, '2026-10-01', '2027-01-31'),
  (5, 203, 'Oferta da semana', 36.9, 1, '2026-10-01', '2026-11-30'),
  (6, 301, 'Freio em dia', 119.9, 1, '2026-10-01', '2026-12-15'),
  (7, 406, 'Bateria com desconto', 499.9, 1, '2026-10-01', '2026-11-30'),
  (8, 402, 'Leve 4 pneus', 389.9, 4, '2026-10-01', '2027-01-31'),
  (9, 103, 'Linha TSI', 49.9, 4, '2026-10-01', '2026-12-31'),
  (10, 204, 'Verão sem cheiro', 42.9, 1, '2026-10-01', '2027-02-28')
on conflict (id) do update set produto_id = excluded.produto_id, titulo = excluded.titulo, preco_promocional = excluded.preco_promocional,
  quantidade_minima = excluded.quantidade_minima, inicio = excluded.inicio, fim = excluded.fim;

select setval(pg_get_serial_sequence('public.fornecedores', 'id'), (select max(id) from public.fornecedores));
select setval(pg_get_serial_sequence('public.produtos', 'id'), (select max(id) from public.produtos));
select setval(pg_get_serial_sequence('public.promocoes', 'id'), (select max(id) from public.promocoes));
