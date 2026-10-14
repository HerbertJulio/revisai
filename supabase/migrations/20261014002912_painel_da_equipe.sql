-- Painel da equipe: ler os pedidos da loja e mudar a situação de cada um.
-- A tabela de pedidos continua fechada para o público. As duas funções abaixo só respondem
-- com a chave do painel, que fica no servidor (variável EQUIPE_CHAVE na Vercel); o banco guarda
-- apenas o hash dela, num esquema que a API não expõe.

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table privado.chaves (
  nome text primary key check (nome ~ '^[a-z_]{2,40}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now()
);

comment on table privado.chaves is 'Hash SHA-256 das chaves de acesso do servidor (a chave em si fica só na Vercel).';

alter table privado.chaves enable row level security;
revoke all on privado.chaves from public, anon, authenticated;

create or replace function privado.chave_confere(p_nome text, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(char_length(p_chave) between 32 and 200, false)
     and exists (
       select 1
         from privado.chaves c
        where c.nome = p_nome
          and c.hash = encode(sha256(convert_to(p_chave, 'UTF8')), 'hex')
     );
$$;

revoke all on function privado.chave_confere(text, text) from public, anon, authenticated;

-- Os 500 pedidos mais recentes.
create or replace function public.equipe_pedidos(p_chave text)
returns setof public.pedidos
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.chave_confere('equipe', p_chave) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select * from public.pedidos order by criado_em desc, id desc limit 500;
end;
$$;

-- Muda só a situação; itens, preços e total ficam como o banco calculou na hora do pedido.
create or replace function public.equipe_mudar_situacao(p_chave text, p_id bigint, p_status text)
returns public.pedidos
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  if not privado.chave_confere('equipe', p_chave) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('novo', 'em_contato', 'confirmado', 'entregue', 'cancelado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  update public.pedidos set status = p_status where id = p_id returning * into v_pedido;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  return v_pedido;
end;
$$;

-- O servidor do site fala com o banco pela chave publicável (papel anon); sem a chave do painel,
-- as funções recusam.
revoke all on function public.equipe_pedidos(text) from public, anon, authenticated;
revoke all on function public.equipe_mudar_situacao(text, bigint, text) from public, anon, authenticated;
grant execute on function public.equipe_pedidos(text) to anon;
grant execute on function public.equipe_mudar_situacao(text, bigint, text) to anon;
