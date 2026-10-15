-- Alerta de preço, Pix direto para o fornecedor, acompanhamento da entrega e a voz do passo a passo.
--
-- Alerta de preço: a oficina pede um produto por um preço; as lojas do mesmo estado veem no painel e
-- respondem (aceito, contraproposta com quantidade mínima, ou não dá). A oficina escolhe uma resposta e
-- o pedido sai com o preço combinado (o gatilho do pedido confere a resposta). Cota por mês: o Pro tem
-- mais; pacotes extras viram créditos que a equipe libera depois do pagamento.
--
-- Pix: o fornecedor cadastra a chave; a oficina vê o QR e o copia e cola do valor da parte dela no pedido,
-- avisa que pagou e o fornecedor confirma. O dinheiro vai direto para o fornecedor.
--
-- Entrega: o fornecedor marca que saiu para entrega e manda um link para o entregador; o celular do
-- entregador manda a posição, e a oficina acompanha no mapa até a entrega.
--
-- Tudo passa pelo servidor do site, com a chave da equipe no cabeçalho (privado.equipe_autorizada()).

-- 1. Pedido: o aparelho da oficina (para ela acompanhar) e o endereço da entrega.
alter table public.pedidos
  add column aparelho_id uuid,
  add column oficina_endereco text check (char_length(oficina_endereco) <= 160);

create index pedidos_aparelho_idx on public.pedidos (aparelho_id, criado_em) where aparelho_id is not null;

-- 2. A parte de cada fornecedor: saiu para entrega, posição do entregador e pagamento.
alter table public.pedidos_fornecedores drop constraint pedidos_fornecedores_status_check;
alter table public.pedidos_fornecedores add constraint pedidos_fornecedores_status_check
  check (status in ('novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado'));

alter table public.pedidos_fornecedores
  add column entrega_hash text unique check (entrega_hash ~ '^[0-9a-f]{64}$'),
  add column entrega_previsao text check (char_length(entrega_previsao) <= 40),
  add column entrega_saiu_em timestamptz,
  add column entrega_lat double precision check (entrega_lat between -90 and 90),
  add column entrega_lng double precision check (entrega_lng between -180 and 180),
  add column entrega_precisao real check (entrega_precisao >= 0),
  add column entrega_posicao_em timestamptz,
  add column entregue_em timestamptz,
  add column pagamento text not null default 'pendente' check (pagamento in ('pendente', 'informado', 'confirmado')),
  add column pagamento_em timestamptz;

comment on column public.pedidos_fornecedores.entrega_hash is 'Hash SHA-256 do código do link do entregador. Some quando a entrega termina.';

grant update (entrega_hash, entrega_previsao, entrega_saiu_em, entrega_lat, entrega_lng, entrega_precisao, entrega_posicao_em, entregue_em, pagamento, pagamento_em)
  on public.pedidos_fornecedores to anon;

-- 3. Chave Pix do fornecedor. Só a equipe e o servidor leem: a oficina recebe o código do valor do pedido.
create table public.fornecedores_pix (
  fornecedor_id bigint primary key references public.fornecedores (id),
  tipo text not null check (tipo in ('cnpj', 'cpf', 'email', 'telefone', 'aleatoria')),
  chave text not null check (char_length(chave) between 5 and 77),
  nome text not null check (char_length(nome) between 2 and 25),
  cidade text not null check (char_length(cidade) between 2 and 15),
  atualizado_em timestamptz not null default now()
);

comment on table public.fornecedores_pix is 'Chave Pix de cada fornecedor, para a oficina pagar o pedido direto a ele.';

alter table public.fornecedores_pix enable row level security;
grant select, insert, update on public.fornecedores_pix to anon;

create policy "Equipe vê as chaves Pix" on public.fornecedores_pix for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor grava a chave Pix" on public.fornecedores_pix for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor troca a chave Pix" on public.fornecedores_pix for update to anon
  using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

-- 4. Alertas de preço e as respostas das lojas.
create table public.alertas_preco (
  id uuid primary key default gen_random_uuid(),
  aparelho_id uuid not null,
  codigo_pro text check (codigo_pro ~ '^[0-9A-Z]{16}$'),
  oficina_nome text not null check (char_length(oficina_nome) between 2 and 120),
  oficina_whatsapp text not null check (oficina_whatsapp ~ '^55[0-9]{10,11}$'),
  oficina_cidade text check (char_length(oficina_cidade) <= 80),
  oficina_uf text not null check (oficina_uf ~ '^[A-Z]{2}$'),
  categoria text not null check (categoria in (
    'oleo_motor', 'filtro_oleo', 'filtro_ar', 'filtro_cabine', 'filtro_combustivel', 'vela',
    'correia_dentada', 'correia_acessorios', 'pastilha_freio', 'disco_freio', 'fluido_freio',
    'arrefecimento', 'pneu', 'bateria', 'amortecedor', 'fluido_cambio', 'higienizacao_ar', 'palheta', 'outros'
  )),
  titulo text not null check (char_length(titulo) between 2 and 160),
  produto_id bigint references public.produtos (id) on delete set null,
  chave text check (char_length(chave) <= 200),
  especificacao jsonb not null default '{}'::jsonb check (jsonb_typeof(especificacao) = 'object'),
  quantidade integer not null check (quantidade between 1 and 999),
  preco_alvo numeric(10, 2) not null check (preco_alvo > 0),
  preco_pago numeric(10, 2) check (preco_pago > 0),
  mensagem text check (char_length(mensagem) <= 300),
  usou_credito boolean not null default false,
  status text not null default 'aberto' check (status in ('aberto', 'fechado', 'cancelado')),
  resposta_escolhida uuid,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.alertas_preco is 'A oficina pede um produto por um preço; as lojas do estado dela respondem pelo painel.';

create index alertas_preco_uf_idx on public.alertas_preco (oficina_uf, status, expira_em);
create index alertas_preco_aparelho_idx on public.alertas_preco (aparelho_id, criado_em);
create index alertas_preco_codigo_idx on public.alertas_preco (codigo_pro, criado_em) where codigo_pro is not null;
create index alertas_preco_whatsapp_idx on public.alertas_preco (oficina_whatsapp, criado_em);

create table public.alertas_respostas (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas_preco (id) on delete cascade,
  fornecedor_id bigint not null references public.fornecedores (id),
  tipo text not null check (tipo in ('aceita', 'contraproposta', 'recusa')),
  produto_id bigint references public.produtos (id) on delete set null,
  preco numeric(10, 2) check (preco > 0),
  quantidade_minima integer check (quantidade_minima between 1 and 999),
  prazo_entrega text check (char_length(prazo_entrega) <= 60),
  mensagem text check (char_length(mensagem) <= 300),
  status text not null default 'enviada' check (status in ('enviada', 'escolhida', 'descartada')),
  pedido_id bigint references public.pedidos (id),
  criado_em timestamptz not null default now(),
  unique (alerta_id, fornecedor_id),
  check (tipo = 'recusa' or (preco is not null and quantidade_minima is not null and produto_id is not null))
);

create index alertas_respostas_fornecedor_idx on public.alertas_respostas (fornecedor_id, criado_em);

alter table public.alertas_preco
  add constraint alertas_preco_resposta_fk foreign key (resposta_escolhida) references public.alertas_respostas (id) on delete set null;

-- Pacotes de alertas extras, liberados pela equipe depois do pagamento (valem para o código do Pro).
create table public.alertas_creditos (
  id bigint generated always as identity primary key,
  codigo_pro text not null check (codigo_pro ~ '^[0-9A-Z]{16}$'),
  quantidade integer not null check (quantidade between 1 and 1000),
  valor numeric(10, 2) check (valor >= 0),
  observacao text check (char_length(observacao) <= 200),
  criado_em timestamptz not null default now()
);

create index alertas_creditos_codigo_idx on public.alertas_creditos (codigo_pro);

alter table public.alertas_preco enable row level security;
alter table public.alertas_respostas enable row level security;
alter table public.alertas_creditos enable row level security;
grant select, insert, update on public.alertas_preco, public.alertas_respostas to anon;
grant select, insert on public.alertas_creditos to anon;

create policy "Servidor lê os alertas" on public.alertas_preco for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor cria alertas" on public.alertas_preco for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor muda alertas" on public.alertas_preco for update to anon
  using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

create policy "Servidor lê as respostas" on public.alertas_respostas for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor grava respostas" on public.alertas_respostas for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor muda respostas" on public.alertas_respostas for update to anon
  using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

create policy "Equipe vê os créditos" on public.alertas_creditos for select to anon using ((select privado.equipe_autorizada()));
create policy "Equipe libera créditos" on public.alertas_creditos for insert to anon with check ((select privado.equipe_autorizada()));

-- 5. Pedido com o preço combinado no alerta: o item traz resposta_id e o banco confere que a resposta
-- é para aquele produto, daquela oficina (aparelho), e que a quantidade alcança o mínimo combinado.
-- A leitura da resposta segue as regras das tabelas: só o servidor (com a chave da equipe) chega nela.
create or replace function public.calcular_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_calculados jsonb := '[]'::jsonb;
  v_produto_id bigint;
  v_quantidade integer;
  v_nome text;
  v_preco numeric(10, 2);
  v_fornecedor_id bigint;
  v_fornecedor text;
  v_promocional numeric(10, 2);
  v_combinado numeric(10, 2);
  v_unitario numeric(10, 2);
  v_soma numeric(12, 2) := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for v_item in select value from jsonb_array_elements(new.itens)
  loop
    if jsonb_typeof(v_item -> 'produto_id') is distinct from 'number'
       or jsonb_typeof(v_item -> 'quantidade') is distinct from 'number' then
      raise exception 'Item de pedido inválido' using errcode = '22023';
    end if;
    v_produto_id := (v_item ->> 'produto_id')::bigint;
    v_quantidade := (v_item ->> 'quantidade')::integer;
    if v_quantidade < 1 or v_quantidade > 999 then
      raise exception 'Quantidade inválida' using errcode = '22023';
    end if;

    select p.nome, p.preco, p.fornecedor_id, f.nome
      into v_nome, v_preco, v_fornecedor_id, v_fornecedor
      from public.produtos p
      join public.fornecedores f on f.id = p.fornecedor_id
     where p.id = v_produto_id and p.ativo and f.ativo;
    if not found then
      raise exception 'Produto % indisponível', v_produto_id using errcode = '22023';
    end if;

    select min(pr.preco_promocional) into v_promocional
      from public.promocoes pr
     where pr.produto_id = v_produto_id
       and pr.ativo
       and v_hoje between pr.inicio and pr.fim
       and v_quantidade >= pr.quantidade_minima;

    v_combinado := null;
    if jsonb_typeof(v_item -> 'resposta_id') = 'string' and new.aparelho_id is not null then
      select r.preco into v_combinado
        from public.alertas_respostas r
        join public.alertas_preco a on a.id = r.alerta_id
       where r.id = (v_item ->> 'resposta_id')::uuid
         and r.tipo in ('aceita', 'contraproposta')
         and r.produto_id = v_produto_id
         and r.fornecedor_id = v_fornecedor_id
         and a.aparelho_id = new.aparelho_id
         and a.status in ('aberto', 'fechado')
         and v_quantidade >= coalesce(r.quantidade_minima, 1);
    end if;

    v_unitario := least(v_preco, coalesce(v_promocional, v_preco), coalesce(v_combinado, v_preco));
    v_soma := v_soma + v_unitario * v_quantidade;
    v_calculados := v_calculados || jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto_id,
      'nome', v_nome,
      'fornecedor_id', v_fornecedor_id,
      'fornecedor', v_fornecedor,
      'quantidade', v_quantidade,
      'preco_unitario', v_unitario,
      'promocao', coalesce(v_promocional < v_preco, false),
      'combinado', coalesce(v_combinado is not null and v_combinado <= least(v_preco, coalesce(v_promocional, v_preco)), false)
    ));
  end loop;

  new.itens := v_calculados;
  new.total := v_soma;
  new.status := 'novo';
  new.criado_em := now();
  return new;
end;
$$;

revoke all on function public.calcular_pedido() from public, anon, authenticated;

-- 6. Pedido de pacote de alertas extras entra como cadastro para a equipe.
alter table public.interessados drop constraint interessados_plano_check;
alter table public.interessados add constraint interessados_plano_check
  check (plano in ('gratis', 'plus', 'vitrine', 'destaque', 'oferta', 'alertas'));

-- 7. A voz natural das perguntas do passo a passo, gerada uma vez e guardada (bucket público).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voz', 'voz', true, 2097152, array['audio/wav', 'audio/mpeg', 'audio/ogg'])
on conflict (id) do nothing;

create policy "Servidor guarda a voz" on storage.objects for insert to anon
  with check (bucket_id = 'voz' and (select privado.equipe_autorizada()));
