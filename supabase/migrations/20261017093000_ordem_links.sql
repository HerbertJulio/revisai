-- A jornada da ordem de serviço nos links do cliente: o CNPJ da oficina (digitado no app, vem do
-- cadastro config/oficina) aparece no histórico verificado e na garantia, sempre tirado do banco e
-- nunca dos dados do link; a resposta do cliente é aplicada por um aparelho só; e a oficina escuta
-- as respostas em tempo real. Pode rodar de novo sem estragar nada.

alter table public.oficinas add column if not exists cnpj text check (cnpj ~ '^[0-9]{14}$');

/** CNPJ com 14 dígitos e os dois dígitos verificadores certos. */
create or replace function privado.cnpj_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  c text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  pesos1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  pesos2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  soma int := 0;
  d1 int;
  d2 int;
begin
  if c !~ '^[0-9]{14}$' or c ~ '^(.)\1{13}$' then
    return false;
  end if;
  for i in 1 .. 12 loop
    soma := soma + substr(c, i, 1)::int * pesos1[i];
  end loop;
  d1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := 0;
  for i in 1 .. 13 loop
    soma := soma + (case when i = 13 then d1 else substr(c, i, 1)::int end) * pesos2[i];
  end loop;
  d2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  return substr(c, 13, 2) = d1::text || d2::text;
end;
$$;
revoke all on function privado.cnpj_valido(text) from public, anon, authenticated;

-- O cadastro da oficina (config/oficina) também vai para a tabela oficinas, que as lojas
-- (nos pedidos), a equipe e os links do cliente usam. O CNPJ entra só com os dígitos e conferido;
-- sem o campo no cadastro, fica o que já estava; apagado no app, sai daqui também.
create or replace function privado.registros_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := new.dados;
  v_whats text := regexp_replace(coalesce(d ->> 'whatsapp', ''), '\D', '', 'g');
  v_uf text := upper(coalesce(d ->> 'uf', ''));
  v_link text := coalesce(d ->> 'linkAvaliacao', '');
  v_cnpj text := regexp_replace(coalesce(d ->> 'cnpj', ''), '\D', '', 'g');
begin
  if new.colecao <> 'config' or new.id <> 'oficina' or new.apagado then
    return new;
  end if;
  if v_whats <> '' and v_whats !~ '^55' then
    v_whats := '55' || v_whats;
  end if;
  update public.oficinas o set
    nome = coalesce(nullif(left(trim(d ->> 'nome'), 120), ''), o.nome),
    whatsapp = case when v_whats ~ '^55[0-9]{10,11}$' then v_whats else o.whatsapp end,
    cidade = nullif(left(trim(coalesce(d ->> 'cidade', '')), 80), ''),
    uf = case when v_uf ~ '^[A-Z]{2}$' then v_uf else null end,
    endereco = nullif(left(trim(coalesce(d ->> 'endereco', '')), 160), ''),
    link_avaliacao = case when v_link ~ '^https://' and char_length(v_link) <= 300 then v_link else null end,
    cnpj = case
      when not (d ? 'cnpj') then o.cnpj
      when v_cnpj = '' then null
      when privado.cnpj_valido(v_cnpj) then v_cnpj
      else o.cnpj end
  where o.id = new.oficina_id;
  return new;
end;
$$;

/** O que o cliente vê pelo link (null se não vale mais). Conta a visita. A oficina vem do banco, com o CNPJ. */
create or replace function public.ver_link(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.links_publicos%rowtype;
  o public.oficinas%rowtype;
begin
  if p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  update public.links_publicos set vistas = vistas + 1, visto_em = now()
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and not revogado and expira_em > now()
   returning * into l;
  if not found then
    return null;
  end if;
  select * into o from public.oficinas where id = l.oficina_id;
  return jsonb_build_object(
    'tipo', l.tipo, 'dados', l.dados, 'codigo', l.codigo, 'resposta', l.resposta, 'respondidoEm', l.respondido_em,
    'atualizadoEm', l.atualizado_em, 'expiraEm', l.expira_em,
    'oficina', jsonb_build_object('nome', o.nome, 'whatsapp', o.whatsapp, 'cidade', o.cidade, 'uf', o.uf, 'endereco', o.endereco,
                                  'linkAvaliacao', o.link_avaliacao, 'cnpj', o.cnpj)
  );
end;
$$;

/** A garantia do serviço pela placa e pelo código impresso no certificado (com o CNPJ da oficina). */
create or replace function public.garantia_consultar(p_placa text, p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  return (
    select jsonb_build_object('dados', l.dados,
             'oficina', jsonb_build_object('nome', o.nome, 'whatsapp', o.whatsapp, 'cidade', o.cidade, 'uf', o.uf, 'cnpj', o.cnpj),
             'atualizadoEm', l.atualizado_em)
      from public.links_publicos l join public.oficinas o on o.id = l.oficina_id
     where l.tipo = 'garantia' and l.placa = v_placa and l.codigo = upper(trim(p_codigo)) and not l.revogado and l.expira_em > now()
     limit 1
  );
end;
$$;

/**
 * A oficina marca que já aplicou a resposta do cliente (aprovação do orçamento, assinatura do
 * checklist). Só a primeira marca vale: devolve true para o aparelho que pegou a resposta e false
 * para os outros, então dois aparelhos abertos não aplicam a mesma aprovação duas vezes.
 */
create or replace function public.link_processado(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.links_publicos set processado_em = now()
   where id = p_id and oficina_id in (select privado.minhas_oficinas()) and processado_em is null;
  return found;
end;
$$;

revoke all on function public.ver_link(text), public.garantia_consultar(text, text), public.link_processado(uuid) from public;
grant execute on function public.ver_link(text), public.garantia_consultar(text, text) to anon, authenticated;
grant execute on function public.link_processado(uuid) to authenticated;

-- tempo real: a oficina escuta as respostas dos links (o banco local de testes não tem o tempo
-- real ligado; aí, e se a tabela já estiver na publicação, segue sem erro)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'links_publicos') then
    alter publication supabase_realtime add table public.links_publicos;
  end if;
exception when others then
  raise notice 'links_publicos fora do tempo real: %', sqlerrm;
end $$;
