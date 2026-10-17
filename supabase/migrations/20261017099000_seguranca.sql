-- Ajustes de segurança depois da revisão independente: o que a oficina e a loja mudam na própria
-- linha vira uma lista do que pode (e não do que não pode); a suspensão da equipe não cai com o
-- "apagar e desistir"; o WhatsApp de quem sai da oficina sai junto; o CNPJ não fica preso por loja
-- em análise; clique de anúncio só é cobrado de oficina de verdade; impulso só pelo dono e no preço
-- da tabela; teto de tamanho na ficha dos produtos e de arquivos por oficina nos links; e a
-- exportação do titular traz as respostas da pesquisa de satisfação.

-- ------------------------------------------------------------------ oficina: o que o dono muda

alter table public.oficinas add column if not exists suspensa boolean not null default false;
comment on column public.oficinas.suspensa is 'A equipe desativou a oficina (diferente do pedido de exclusão do dono). Só a equipe muda.';

/**
 * Pela API, quem é da oficina muda só o cadastro (nome, contato, endereço, CNPJ, avaliação). Plano,
 * teste, situação, criação, exclusão, limite de compra e o resto só a equipe, o sistema ou as
 * funções do próprio banco. Quando a equipe desativa ou reativa, a suspensão anda junto.
 */
create or replace function privado.proteger_oficina()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pode constant text[] := array['nome', 'whatsapp', 'cidade', 'uf', 'endereco', 'cnpj', 'link_avaliacao', 'atualizado_em'];
begin
  if privado.so_desligou(to_jsonb(old), to_jsonb(new), array['criado_por']) then
    return new;
  end if;
  if not privado.veio_da_api() or privado.sistema_autorizado() or privado.eh_equipe(array['financeiro']) then
    if privado.eh_equipe() and new.ativa is distinct from old.ativa then
      new.suspensa := not new.ativa;
    end if;
    new.atualizado_em := now();
    return new;
  end if;
  if (to_jsonb(new) - v_pode) is distinct from (to_jsonb(old) - v_pode) then
    raise exception 'Só a equipe muda isso na oficina' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

/** O dono desiste de apagar a oficina: ela volta, menos quando a equipe suspendeu. */
create or replace function public.oficina_cancelar_exclusao(p_oficina uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') <> 'dono' then
    raise exception 'Só o dono' using errcode = '42501';
  end if;
  update public.oficinas set excluir_em = null, ativa = not suspensa where id = p_oficina and excluir_em > now();
  return found;
end;
$$;

-- ------------------------------------------------------------------ loja: o que o dono muda

/**
 * Pela API, a loja muda só o cadastro e as condições dela (contato, descrição, prazo, pedido mínimo,
 * cashback, avisos). Ativar, aprovar, Destaque, CNPJ, criação e o resto são da equipe.
 */
create or replace function privado.proteger_fornecedor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pode constant text[] := array['nome', 'cidade', 'uf', 'whatsapp', 'descricao', 'email', 'prazo_entrega_horas',
                                  'avisar_whatsapp', 'pedido_minimo', 'cashback_percentual', 'atualizado_em'];
begin
  if not privado.veio_da_api() or privado.sistema_autorizado() or privado.eh_equipe(array['suporte', 'financeiro']) then
    new.atualizado_em := now();
    return new;
  end if;
  if (to_jsonb(new) - v_pode) is distinct from (to_jsonb(old) - v_pode) then
    raise exception 'Só a equipe muda isso na loja' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- o CNPJ fica com a loja aprovada; lojas em análise ou recusadas não prendem o número
do $$
begin
  if not exists (select 1 from public.fornecedores where verificacao = 'aprovada' and cnpj is not null group by cnpj having count(*) > 1) then
    create unique index if not exists fornecedores_cnpj_aprovada on public.fornecedores (cnpj) where verificacao = 'aprovada' and cnpj is not null;
  else
    raise notice 'Há CNPJ repetido entre lojas aprovadas: o índice único fica para depois da limpeza';
  end if;
end $$;

create or replace function public.criar_loja(p_nome text, p_cnpj text, p_whatsapp text default null, p_cidade text default null, p_uf text default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if (select count(*) from public.fornecedor_membros m where m.user_id = v_uid and m.papel = 'dono') >= 3 then
    raise exception 'Limite de lojas por conta' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fornecedores f where f.cnpj = p_cnpj and (f.verificacao = 'aprovada' or f.ativo)) then
    raise exception 'Esse CNPJ já tem loja no Revisaí' using errcode = '23505';
  end if;
  -- a mesma conta não abre a mesma loja duas vezes enquanto a primeira está em análise
  if exists (select 1 from public.fornecedores f join public.fornecedor_membros m on m.fornecedor_id = f.id
              where f.cnpj = p_cnpj and m.user_id = v_uid) then
    raise exception 'Você já pediu uma loja com esse CNPJ: ela está em análise' using errcode = '23505';
  end if;
  insert into public.fornecedores (nome, cnpj, whatsapp, cidade, uf, ativo, demonstracao, verificacao, email)
  values (trim(p_nome), p_cnpj, nullif(p_whatsapp, ''), nullif(trim(p_cidade), ''), nullif(p_uf, ''), false, false, 'pendente', lower(auth.jwt() ->> 'email'))
  returning id into v_id;
  insert into public.fornecedores_contrato (fornecedor_id, plano, comissao_percentual, mensalidade, email)
  values (v_id, 'vitrine', 5, 0, lower(auth.jwt() ->> 'email'))
  on conflict (fornecedor_id) do nothing;
  insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email)
  values (v_id, v_uid, 'dono', lower(auth.jwt() ->> 'email'));
  return v_id;
end;
$$;

-- ------------------------------------------------------------------ WhatsApp de quem sai da oficina

alter table public.whatsapp_codigos add column if not exists criado_por uuid references auth.users (id) on delete cascade;
alter table public.whatsapp_vinculos add column if not exists criado_por uuid references auth.users (id) on delete cascade;
comment on column public.whatsapp_vinculos.criado_por is 'Quem da oficina gerou o código que ligou este número (sai junto quando a pessoa sai da oficina).';

create or replace function public.whatsapp_gerar_codigo(p_oficina uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text;
  v_nome text;
begin
  if privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if (select count(*) from public.whatsapp_codigos where oficina_id = p_oficina and criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos códigos seguidos' using errcode = 'P0001';
  end if;
  select nome into v_nome from public.oficinas where id = p_oficina and ativa;
  if v_nome is null then
    raise exception 'Oficina não encontrada' using errcode = '42501';
  end if;
  delete from public.whatsapp_codigos where oficina_id = p_oficina;
  loop
    v_codigo := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint) % 100000000)::text, 8, '0');
    begin
      insert into public.whatsapp_codigos (codigo, oficina_id, oficina_nome, expira_em, criado_por)
      values (v_codigo, p_oficina, v_nome, now() + interval '15 minutes', auth.uid());
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_codigo;
end;
$$;

create or replace function public.whatsapp_vincular(p_telefone text, p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.whatsapp_codigos%rowtype;
  v_nome text;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_telefone !~ '^55[0-9]{10,11}$' or p_codigo !~ '^[0-9]{6,10}$' then
    return null;
  end if;
  select * into c from public.whatsapp_codigos where codigo = p_codigo for update;
  if not found or c.oficina_id is null or c.expira_em < now() then
    return null;
  end if;
  delete from public.whatsapp_codigos where codigo = p_codigo;
  select nome into v_nome from public.oficinas where id = c.oficina_id and ativa;
  if v_nome is null then
    return null;
  end if;
  if (select count(*) from public.whatsapp_vinculos where oficina_id = c.oficina_id and telefone <> p_telefone) >= 20 then
    raise exception 'Números demais ligados à oficina' using errcode = 'P0001';
  end if;
  insert into public.whatsapp_vinculos (telefone, oficina_id, oficina_nome, aparelho_id, criado_em, criado_por)
  values (p_telefone, c.oficina_id, v_nome, null, now(), c.criado_por)
  on conflict (telefone) do update set oficina_id = excluded.oficina_id, oficina_nome = excluded.oficina_nome, aparelho_id = null,
    criado_em = now(), criado_por = excluded.criado_por;
  return jsonb_build_object('oficinaId', c.oficina_id, 'oficina', v_nome);
end;
$$;

-- quem sai da oficina (removido, saiu ou apagou a conta) leva junto os números que ligou
create or replace function privado.desligar_whatsapp_de_quem_saiu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.whatsapp_vinculos where oficina_id = old.oficina_id and criado_por = old.user_id;
  return null;
end;
$$;
revoke all on function privado.desligar_whatsapp_de_quem_saiu() from public, anon, authenticated;

drop trigger if exists oficina_membros_whatsapp on public.oficina_membros;
create trigger oficina_membros_whatsapp after delete on public.oficina_membros
  for each row execute function privado.desligar_whatsapp_de_quem_saiu();

-- ------------------------------------------------------------------ anúncios e impulsos

/**
 * Clique num anúncio. Uma vez por oficina por anúncio por dia. No anúncio por clique, cobra o valor
 * do clique enquanto couber no teto do dia, e só de oficina de verdade: que viu o anúncio hoje, tem
 * mais de 30 dias e já comprou pela loja ou paga o Pro, e cuja conta não teve outro clique cobrado
 * neste anúncio hoje. Os outros cliques ficam registrados sem custo.
 */
create or replace function public.registrar_clique(p_impulso bigint, p_oficina uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_oficina uuid := privado.oficina_da_vitrine(p_oficina);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_imp public.impulsos%rowtype;
  v_of public.oficinas%rowtype;
  v_gasto numeric(10, 2) := 0;
  v_custo numeric(10, 2) := 0;
  v_conta_valida boolean := false;
  v_id bigint;
begin
  if v_oficina is null then
    raise exception 'Só oficinas registram cliques' using errcode = '42501';
  end if;
  -- trava o anúncio: dois cliques ao mesmo tempo não passam do teto
  select * into v_imp from public.impulsos
   where id = p_impulso and status = 'ativo' and v_hoje between inicio and fim
   for update;
  if not found then
    return jsonb_build_object('registrado', false, 'motivo', 'fora_do_ar');
  end if;
  if v_imp.cpc is not null then
    select * into v_of from public.oficinas where id = v_oficina;
    v_conta_valida :=
      exists (select 1 from public.anuncios_impressoes i where i.impulso_id = p_impulso and i.oficina_id = v_oficina and i.dia = v_hoje)
      and v_of.criado_em < now() - interval '30 days'
      and (coalesce(v_of.pro_ate, v_hoje - 1) >= v_hoje
           or exists (select 1 from public.pedidos_fornecedores pf where pf.oficina_id = v_oficina and pf.status = 'entregue'))
      and not exists (select 1 from public.anuncios_cliques c join public.oficinas o2 on o2.id = c.oficina_id
                       where c.impulso_id = p_impulso and c.dia = v_hoje and c.custo > 0
                         and o2.criado_por is not distinct from v_of.criado_por and v_of.criado_por is not null);
    if v_conta_valida then
      select coalesce(sum(custo), 0) into v_gasto from public.anuncios_cliques where impulso_id = p_impulso and dia = v_hoje;
      if v_gasto + v_imp.cpc <= v_imp.orcamento_diario then
        v_custo := v_imp.cpc;
      end if;
    end if;
  end if;
  insert into public.anuncios_cliques (impulso_id, oficina_id, dia, custo)
  values (p_impulso, v_oficina, v_hoje, v_custo)
  on conflict (impulso_id, oficina_id, dia) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('registrado', false, 'motivo', 'repetido');
  end if;
  return jsonb_build_object(
    'registrado', true,
    'cobrado', v_custo,
    'esgotado', v_imp.cpc is not null and v_gasto + v_custo + v_imp.cpc > v_imp.orcamento_diario
  );
end;
$$;

/**
 * Pedido de impulso pela loja: só o dono, e no preço da tabela (7, 15 ou 30 dias por R$ 29, 49 ou
 * 89); por clique, o período sai de graça e o clique custa de R$ 0,30 a R$ 100. A equipe ajusta
 * depois, se combinar outro preço.
 */
create or replace function privado.regras_do_pedido_de_impulso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not privado.veio_da_api() or privado.sistema_autorizado() or privado.eh_equipe(array['suporte', 'financeiro']) then
    return new;
  end if;
  if coalesce(privado.papel_no_fornecedor(new.fornecedor_id), '') <> 'dono' then
    raise exception 'Só o dono da loja pede impulso' using errcode = '42501';
  end if;
  if new.dias not in (7, 15, 30) then
    raise exception 'Escolha 7, 15 ou 30 dias' using errcode = '22023';
  end if;
  if new.cpc is null then
    new.valor := case new.dias when 7 then 29 when 15 then 49 else 89 end;
  else
    if new.cpc < 0.30 or new.cpc > 100 then
      raise exception 'O clique vai de R$ 0,30 a R$ 100' using errcode = '22023';
    end if;
    new.valor := 0;
  end if;
  return new;
end;
$$;
revoke all on function privado.regras_do_pedido_de_impulso() from public, anon, authenticated;

drop trigger if exists impulsos_pedido on public.impulsos;
create trigger impulsos_pedido before insert on public.impulsos
  for each row execute function privado.regras_do_pedido_de_impulso();

-- ------------------------------------------------------------------ tetos de tamanho

-- a ficha do produto (especificação) tem teto; as que já existem ficam como estão
alter table public.produtos drop constraint if exists produtos_especificacao_tamanho;
alter table public.produtos add constraint produtos_especificacao_tamanho check (pg_column_size(especificacao) <= 16384) not valid;

-- fotos dos links: até 5 mil arquivos por oficina (checklists, garantias e devoluções)
create or replace function privado.cabe_mais_arquivo(p_pasta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from storage.objects o where o.bucket_id = 'links' and o.name like p_pasta || '/%') < 5000;
$$;
revoke all on function privado.cabe_mais_arquivo(text) from public, anon;
grant execute on function privado.cabe_mais_arquivo(text) to authenticated;

drop policy if exists "Oficina guarda fotos dos links" on storage.objects;
create policy "Oficina guarda fotos dos links" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'links'
    and (storage.foldername(name))[1] in (select privado.minhas_oficinas()::text)
    and privado.cabe_mais_arquivo((storage.foldername(name))[1])
  );

-- ------------------------------------------------------------------ titular (LGPD)

/** Tudo o que o Revisaí guarda sobre um e-mail (pedido de titular, LGPD art. 18). */
create or replace function public.titular_exportar(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not privado.eh_equipe(array['suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro)
  select auth.uid(), e.email, e.papel, 'exportou_titular', 'auth.users', v_email from privado.equipe e where e.user_id = auth.uid();
  return jsonb_build_object(
    'email', v_email,
    'conta', (select jsonb_build_object('id', u.id, 'criadaEm', u.created_at, 'ultimoAcesso', u.last_sign_in_at) from auth.users u where u.id = v_user),
    'oficinas', coalesce((select jsonb_agg(jsonb_build_object('oficina', o.nome, 'papel', m.papel, 'desde', m.criado_em)) from public.oficina_membros m join public.oficinas o on o.id = m.oficina_id where m.user_id = v_user), '[]'::jsonb),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object('loja', f.nome, 'papel', m.papel, 'desde', m.criado_em)) from public.fornecedor_membros m join public.fornecedores f on f.id = m.fornecedor_id where m.user_id = v_user), '[]'::jsonb),
    'cadastros', coalesce((select jsonb_agg(to_jsonb(i) - 'id') from public.interessados i where lower(i.email) = v_email), '[]'::jsonb),
    'aceites', coalesce((select jsonb_agg(jsonb_build_object('documento', a.documento, 'versao', a.versao, 'em', a.aceito_em)) from public.aceites a where a.user_id = v_user), '[]'::jsonb),
    'pesquisas', coalesce((select jsonb_agg(jsonb_build_object('nota', n.nota, 'comentario', n.comentario, 'em', n.criado_em) order by n.criado_em) from public.nps_respostas n where n.user_id = v_user), '[]'::jsonb),
    -- os IPs de acesso ficam em sigilo (Marco Civil): só o admin, pela consulta com motivo
    'acessos', jsonb_build_object('quantidade', (select count(*) from privado.acessos where user_id = v_user),
                                  'aviso', 'Os registros de acesso (data, hora e IP) só saem por pedido formal, pela consulta da equipe com o motivo.')
  );
end;
$$;

-- ------------------------------------------------------------------ IP que vale como prova

/**
 * O IP de quem fez a requisição, só quando o servidor do Revisaí assinou: o cabeçalho
 * x-revisai-ip qualquer um manda direto para a API; a assinatura (HMAC do IP com o hash da chave
 * do sistema, que só o servidor e o banco conhecem) não. Sem assinatura certa, null.
 */
create or replace function privado.ip_confiavel()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_h json;
  v_ip text;
  v_prova text;
  v_segredo text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  v_ip := left(v_h ->> 'x-revisai-ip', 64);
  v_prova := lower(v_h ->> 'x-revisai-ip-prova');
  if v_ip is null or v_prova is null then
    return null;
  end if;
  select hash into v_segredo from privado.chaves where nome = 'sistema';
  if v_segredo is null then
    return null;
  end if;
  if encode(extensions.hmac(convert_to(v_ip, 'UTF8'), convert_to(v_segredo, 'UTF8'), 'sha256'), 'hex') = v_prova then
    return v_ip;
  end if;
  return null;
end;
$$;
revoke all on function privado.ip_confiavel() from public, anon, authenticated;

/** Grava quem da equipe (ou o sistema) mudou o quê, com o IP assinado pelo servidor. */
create or replace function privado.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_equipe privado.equipe%rowtype;
  v_chave text;
begin
  select * into v_equipe from privado.equipe e where e.user_id = v_uid;
  if not found and not privado.sistema_autorizado() then
    return coalesce(new, old);
  end if;
  v_chave := coalesce(to_jsonb(coalesce(new, old)) ->> 'id', to_jsonb(coalesce(new, old)) ->> 'fornecedor_id', to_jsonb(coalesce(new, old)) ->> 'user_id', to_jsonb(coalesce(new, old)) ->> 'codigo');
  insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, antes, depois, ip)
  values (
    v_uid,
    v_equipe.email,
    coalesce(v_equipe.papel, 'sistema'),
    lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    left(v_chave, 120),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    privado.ip_confiavel()
  );
  return coalesce(new, old);
end;
$$;

/** O aceite dos termos, com o IP assinado pelo servidor (o que vem do navegador não vale como prova). */
create or replace function public.aceitar_termos(p_documentos text[], p_ip text default null, p_agente text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_doc text;
  v_n integer := 0;
  v_ip text := coalesce(privado.ip_confiavel(), case when privado.sistema_autorizado() then left(p_ip, 64) end);
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  foreach v_doc in array p_documentos loop
    if public.versoes_dos_termos() ? v_doc then
      insert into public.aceites (user_id, documento, versao, ip, agente)
      values (auth.uid(), v_doc, public.versoes_dos_termos() ->> v_doc, v_ip, left(p_agente, 300))
      on conflict (user_id, documento, versao) do nothing;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function public.equipe_entrar(p_aparelho text, p_descricao text default null, p_ip text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_conv privado.equipe_convites%rowtype;
  v_papel text;
  v_novo boolean := false;
  v_ip text := privado.ip_confiavel();
begin
  if v_uid is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return jsonb_build_object('papel', null);
  end if;
  select * into v_conv from privado.equipe_convites where email = v_email;
  if found then
    insert into privado.equipe (user_id, email, nome, papel, criado_por)
    values (v_uid, v_email, v_conv.nome, v_conv.papel, v_conv.criado_por)
    on conflict (user_id) do update set papel = excluded.papel, ativo = true;
    delete from privado.equipe_convites where email = v_email;
  end if;
  select papel into v_papel from privado.equipe where user_id = v_uid and ativo;
  if v_papel is null then
    return jsonb_build_object('papel', null);
  end if;
  if p_aparelho ~ '^[0-9a-f]{64}$' then
    insert into privado.equipe_aparelhos (user_id, aparelho, descricao, ip)
    values (v_uid, p_aparelho, left(p_descricao, 200), v_ip)
    on conflict (user_id, aparelho) do update set ultimo_em = now(), ip = excluded.ip
    returning (xmax = 0) into v_novo;
    if v_novo then
      insert into privado.auditoria (user_id, email, papel, acao, tabela, registro, depois, ip)
      values (v_uid, v_email, v_papel, 'aparelho_novo', 'privado.equipe_aparelhos', left(p_aparelho, 16), jsonb_build_object('descricao', left(p_descricao, 200)), v_ip);
    end if;
  end if;
  insert into privado.auditoria (user_id, email, papel, acao, ip) values (v_uid, v_email, v_papel, 'entrou', v_ip);
  return jsonb_build_object('papel', v_papel, 'aparelhoNovo', v_novo);
end;
$$;

/**
 * O cliente responde pelo link (aprova ou recusa o orçamento, assina o checklist, avisa que pagou).
 * Só pelo servidor do Revisaí, com a chave do sistema: o IP e o aparelho guardados como prova vêm
 * dele, e não de quem chamasse a API direto. Os itens recusados têm que ser do orçamento mostrado.
 */
create or replace function public.responder_link(p_token text, p_resposta jsonb, p_ip text default null, p_agente text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.links_publicos%rowtype;
  -- sem ação, a ação é vazia: um NULL não pode pular nenhuma das conferências abaixo
  v_acao text := coalesce(p_resposta ->> 'acao', '');
  v_cobranca boolean;
  v_ids text[];
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_token !~ '^[A-Za-z0-9_-]{43}$' or jsonb_typeof(p_resposta) is distinct from 'object' or pg_column_size(p_resposta) > 120000 then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  select * into l from public.links_publicos
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and not revogado and expira_em > now()
   for update;
  if not found then
    raise exception 'O link não vale mais' using errcode = 'RV050';
  end if;
  if l.tipo = 'orcamento' and v_acao not in ('aprovar', 'recusar') then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  if l.tipo = 'orcamento' and p_resposta ? 'recusadas' then
    if jsonb_typeof(p_resposta -> 'recusadas') is distinct from 'array' then
      raise exception 'Resposta inválida' using errcode = '22023';
    end if;
    select coalesce(array_agg(x ->> 'id'), '{}') into v_ids
      from jsonb_array_elements(case when jsonb_typeof(l.dados -> 'linhas') = 'array' then l.dados -> 'linhas' else '[]'::jsonb end) x;
    if exists (select 1 from jsonb_array_elements(p_resposta -> 'recusadas') r
                where jsonb_typeof(r) <> 'string' or not ((r #>> '{}') = any (v_ids))) then
      raise exception 'Resposta inválida' using errcode = '22023';
    end if;
  end if;
  if l.tipo = 'checklist' and v_acao <> 'assinar' then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  v_cobranca := l.tipo in ('pagamento', 'clube');
  if v_cobranca and v_acao is distinct from 'paguei' then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  if l.tipo = 'clube' and coalesce(p_resposta ->> 'competencia', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Resposta inválida' using errcode = '22023';
  end if;
  if l.tipo not in ('orcamento', 'checklist', 'pagamento', 'clube') then
    raise exception 'Este link não recebe resposta' using errcode = '22023';
  end if;
  if l.respondido_em is not null and not coalesce(v_cobranca and l.processado_em is not null, false) then
    raise exception 'Já respondido' using errcode = 'RV051';
  end if;
  if l.respondido_em is not null then
    -- o aviso anterior já foi tratado: limpa antes, para a oficina ser avisada de novo
    update public.links_publicos set resposta = null, respondido_em = null, processado_em = null where id = l.id;
  end if;
  update public.links_publicos
     set resposta = p_resposta || jsonb_build_object(
           'quando', now(), 'ip', left(p_ip, 64), 'agente', left(p_agente, 300),
           'versao', l.atualizado_em, 'hashDoQueViu', encode(sha256(convert_to(l.dados::text, 'UTF8')), 'hex')),
         respondido_em = now()
   where id = l.id;
  return jsonb_build_object('ok', true, 'quando', now());
end;
$$;

-- ------------------------------------------------------------------ cadastros do site só pelo servidor

-- o formulário do site manda pelo servidor (com limite por IP); sem conta, direto pela API, ninguém
-- grava. Quem tem conta (a loja pedindo o Destaque, a oficina pedindo pacote) continua gravando.
drop policy if exists "Interessados se cadastram com consentimento" on public.interessados;
drop policy if exists "Sistema guarda os interessados" on public.interessados;
drop policy if exists "Contas mandam cadastros" on public.interessados;
create policy "Sistema guarda os interessados" on public.interessados for insert to anon
  with check ((select privado.sistema_autorizado()) and consentimento and situacao = 'novo');
create policy "Contas mandam cadastros" on public.interessados for insert to authenticated
  with check (consentimento and situacao = 'novo');
