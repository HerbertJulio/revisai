-- Limite de compra das oficinas novas (antifraude): nos primeiros 30 dias, a oficina compra até
-- R$ 2.000 a cada 7 dias (janela que anda) pela loja do Revisaí, ou o limite que a equipe der em
-- oficinas.limite_compra_7d. O banco confere ao gravar o pedido (RV060), depois do cálculo dos
-- itens. A tentativa barrada fica em privado.antifraude_bloqueios pela função
-- public.compra_registrar_bloqueio, que o servidor chama quando recebe o RV060 (o erro desfaz a
-- transação do pedido, então o registro sai numa chamada separada, que confere tudo de novo).

alter table public.oficinas
  add column if not exists limite_compra_7d numeric(12, 2);
alter table public.oficinas drop constraint if exists oficinas_limite_compra_7d_check;
alter table public.oficinas add constraint oficinas_limite_compra_7d_check check (limite_compra_7d >= 0 and limite_compra_7d <= 10000000);

comment on column public.oficinas.limite_compra_7d is 'Limite de compras na loja a cada 7 dias nos primeiros 30 dias da oficina (vazio = R$ 2.000). Só a equipe muda.';

create table if not exists privado.antifraude_bloqueios (
  id bigint generated always as identity primary key,
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  valor numeric(12, 2) not null,
  usado numeric(12, 2),
  limite numeric(12, 2),
  criado_por uuid,
  criado_em timestamptz not null default now()
);

comment on table privado.antifraude_bloqueios is 'Pedidos barrados pelo limite de compra das oficinas novas. A equipe vê na página de antifraude.';

create index if not exists antifraude_bloqueios_quando_idx on privado.antifraude_bloqueios (criado_em desc);
create index if not exists antifraude_bloqueios_oficina_idx on privado.antifraude_bloqueios (oficina_id, criado_em desc);

alter table privado.antifraude_bloqueios enable row level security;
drop policy if exists "Ninguém pela API" on privado.antifraude_bloqueios;
create policy "Ninguém pela API" on privado.antifraude_bloqueios as restrictive for all to public using (false) with check (false);
revoke all on privado.antifraude_bloqueios from public, anon, authenticated;

-- ------------------------------------------------------------------ a regra

/**
 * O limite que vale agora para a oficina: null quando ela já passou dos 30 dias (sem limite); senão
 * {limite, usado (partes não canceladas dos últimos 7 dias), livre, ate (fim dos 30 dias), daEquipe}.
 */
create or replace function privado.loja2_limite_da_oficina(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_criada timestamptz;
  v_proprio numeric(12, 2);
  v_limite numeric(12, 2);
  v_usado numeric(12, 2);
begin
  select o.criado_em, o.limite_compra_7d into v_criada, v_proprio from public.oficinas o where o.id = p_oficina;
  if v_criada is null or v_criada <= now() - interval '30 days' then
    return null;
  end if;
  v_limite := coalesce(v_proprio, 2000);
  select coalesce(sum(pf.subtotal), 0) into v_usado
    from public.pedidos_fornecedores pf
   where pf.oficina_id = p_oficina and pf.status <> 'cancelado' and pf.criado_em > now() - interval '7 days';
  return jsonb_build_object('limite', v_limite, 'usado', v_usado, 'livre', greatest(v_limite - v_usado, 0),
                            'ate', v_criada + interval '30 days', 'daEquipe', v_proprio is not null);
end;
$$;

revoke all on function privado.loja2_limite_da_oficina(uuid) from public, anon, authenticated;

/** O pedido da oficina nova passa do limite: RV060 (detail com limite, usado, livre e valor, em JSON). */
create or replace function privado.loja2_limite_de_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_limite numeric;
  v_usado numeric;
  v_livre numeric;
begin
  -- quem não é da oficina é barrado depois (política do pedido e privado.preencher_pedido), sem
  -- saber nada do limite dela
  if new.oficina_id is null or privado.papel_na_oficina(new.oficina_id) is null then
    return new;
  end if;
  -- dois pedidos da mesma oficina ao mesmo tempo esperam um pelo outro (o segundo vê o primeiro)
  perform pg_advisory_xact_lock(hashtextextended('loja2-compra:' || new.oficina_id::text, 0));
  v := privado.loja2_limite_da_oficina(new.oficina_id);
  if v is null then
    return new;
  end if;
  v_limite := (v ->> 'limite')::numeric;
  v_usado := (v ->> 'usado')::numeric;
  v_livre := (v ->> 'livre')::numeric;
  if v_usado + coalesce(new.total, 0) > v_limite then
    raise exception 'Nos primeiros 30 dias, a oficina compra até R$ % a cada 7 dias pela loja do Revisaí. Nesta semana ainda cabem R$ %. Para comprar mais, fale com a equipe do Revisaí',
      privado.loja2_reais(v_limite), privado.loja2_reais(v_livre)
      using errcode = 'RV060',
            detail = jsonb_build_object('limite', v_limite, 'usado', v_usado, 'livre', v_livre, 'valor', coalesce(new.total, 0))::text;
  end if;
  return new;
end;
$$;

revoke all on function privado.loja2_limite_de_compra() from public, anon, authenticated;

-- depois de pedidos_calcular (o total já vem do banco)
drop trigger if exists pedidos_loja2_limite on public.pedidos;
create trigger pedidos_loja2_limite before insert on public.pedidos
  for each row execute function privado.loja2_limite_de_compra();

/** O limite é da equipe (e do sistema): a oficina não muda o próprio. */
create or replace function privado.loja2_proteger_limite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.limite_compra_7d is distinct from old.limite_compra_7d
     and privado.veio_da_api() and not privado.sistema_autorizado() and not coalesce(privado.eh_equipe(array['suporte', 'financeiro']), false) then
    raise exception 'Só a equipe do Revisaí muda o limite de compra' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function privado.loja2_proteger_limite() from public, anon, authenticated;

drop trigger if exists oficinas_limite_compra on public.oficinas;
create trigger oficinas_limite_compra before update on public.oficinas
  for each row execute function privado.loja2_proteger_limite();

-- ------------------------------------------------------------------ para a oficina e a equipe

/** O limite que vale para a oficina agora (null = sem limite), para mostrar antes do pedido. */
create or replace function public.compra_limite(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_oficina is null or (privado.papel_na_oficina(p_oficina) is null and not coalesce(privado.eh_equipe(), false)) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return privado.loja2_limite_da_oficina(p_oficina);
end;
$$;

/**
 * O servidor recebeu RV060 no pedido: registra a tentativa barrada. Confere tudo de novo (só grava
 * se o valor passa mesmo do limite agora), junta repetidas (mesmo valor em 2 minutos) e grava no
 * máximo 50 por dia por oficina. Devolve se a tentativa está registrada.
 */
create or replace function public.compra_registrar_bloqueio(p_oficina uuid, p_valor numeric)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_valor numeric(12, 2) := round(coalesce(p_valor, 0), 2);
begin
  if p_oficina is null or privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_valor <= 0 or v_valor > 10000000 then
    return false;
  end if;
  v := privado.loja2_limite_da_oficina(p_oficina);
  if v is null or (v ->> 'usado')::numeric + v_valor <= (v ->> 'limite')::numeric then
    return false;
  end if;
  if exists (select 1 from privado.antifraude_bloqueios b where b.oficina_id = p_oficina and b.valor = v_valor and b.criado_em > now() - interval '2 minutes') then
    return true;
  end if;
  if (select count(*) from privado.antifraude_bloqueios b where b.oficina_id = p_oficina and b.criado_em > now() - interval '1 day') >= 50 then
    return true;
  end if;
  insert into privado.antifraude_bloqueios (oficina_id, valor, usado, limite, criado_por)
  values (p_oficina, v_valor, (v ->> 'usado')::numeric, (v ->> 'limite')::numeric, auth.uid());
  return true;
end;
$$;

/** As tentativas barradas pelo limite (últimos p_dias), para a página de antifraude da equipe. */
create or replace function public.equipe_bloqueios_de_compra(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(privado.eh_equipe(array['suporte', 'financeiro']), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'oficinaId', b.oficina_id, 'nome', o.nome, 'cidade', o.cidade, 'uf', o.uf, 'criada', o.criado_em,
             'limiteDaEquipe', o.limite_compra_7d, 'valor', b.valor, 'usado', b.usado, 'limite', b.limite, 'quando', b.criado_em
           ) order by b.criado_em desc)
      from (select * from privado.antifraude_bloqueios x
             where x.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365))
             order by x.criado_em desc limit 500) b
      join public.oficinas o on o.id = b.oficina_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.compra_limite(uuid), public.compra_registrar_bloqueio(uuid, numeric), public.equipe_bloqueios_de_compra(integer) from public, anon;
grant execute on function public.compra_limite(uuid), public.compra_registrar_bloqueio(uuid, numeric), public.equipe_bloqueios_de_compra(integer) to authenticated;
