-- Ajustes de segurança: produto só aparece com fornecedor ativo, funções novas não ficam
-- executáveis por qualquer papel, e limite de envios de pedidos e cadastros por contato.

-- O privilégio padrão de EXECUTE para PUBLIC é global; revogar só no schema não adianta.
alter default privileges for role postgres revoke execute on functions from public;

alter policy "Catálogo: produtos ativos" on public.produtos
  using (ativo and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo));

create index if not exists pedidos_whatsapp_criado_em_idx on public.pedidos (oficina_whatsapp, criado_em);
create index if not exists pedidos_criado_em_idx on public.pedidos (criado_em);
create index if not exists interessados_whatsapp_criado_em_idx on public.interessados (whatsapp, criado_em);
create index if not exists interessados_email_criado_em_idx on public.interessados (email, criado_em);
create index if not exists interessados_criado_em_idx on public.interessados (criado_em);

-- Conta os envios recentes (precisa ler as tabelas, que o papel anon não lê: por isso security definer,
-- sem permissão de execução para ninguém além do gatilho).
create or replace function public.limitar_envios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contato integer;
  v_geral integer;
begin
  if tg_table_name = 'pedidos' then
    select count(*) into v_contato from public.pedidos
     where oficina_whatsapp = new.oficina_whatsapp and criado_em > now() - interval '1 hour';
    select count(*) into v_geral from public.pedidos where criado_em > now() - interval '1 minute';
    if v_contato >= 10 or v_geral >= 60 then
      raise exception 'Muitos pedidos seguidos' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_contato from public.interessados
     where ((new.whatsapp is not null and whatsapp = new.whatsapp) or (new.email is not null and email = new.email))
       and criado_em > now() - interval '1 day';
    select count(*) into v_geral from public.interessados where criado_em > now() - interval '1 minute';
    if v_contato >= 5 or v_geral >= 60 then
      raise exception 'Muitos cadastros seguidos' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.limitar_envios() from public, anon, authenticated;

create trigger pedidos_limitar
before insert on public.pedidos
for each row execute function public.limitar_envios();

create trigger interessados_limitar
before insert on public.interessados
for each row execute function public.limitar_envios();
