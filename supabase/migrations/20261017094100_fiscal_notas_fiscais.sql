-- Notas fiscais da oficina, emitidas por um emissor de notas (provedor fiscal): a NFS-e da mão
-- de obra (padrão nacional ou da prefeitura) e a NF-e das peças (modelo 55). Cada oficina é uma
-- empresa no emissor. O certificado A1 e a senha vão direto para o emissor: nada disso fica aqui.
-- Quem grava é o servidor (chave do sistema), depois de conferir que a pessoa é dona ou gerente
-- da oficina; o dono e o gerente só leem. Nota fiscal é do Pro (ou do teste do Pro).
-- Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------------ cadastro fiscal da oficina

create table if not exists public.oficinas_fiscal (
  oficina_id uuid primary key references public.oficinas (id) on delete cascade,
  provedor text not null check (provedor in ('focus', 'teste')),
  -- o id da empresa no emissor
  provedor_empresa_id text check (char_length(provedor_empresa_id) <= 120),
  -- CNPJ: desde julho de 2026 pode ter letras nas 12 primeiras posições
  cnpj text not null check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  razao_social text not null check (char_length(razao_social) between 2 and 150),
  regime text not null check (regime in ('mei', 'simples', 'normal')),
  inscricao_municipal text check (inscricao_municipal ~ '^[0-9A-Za-z./-]{1,20}$'),
  inscricao_estadual text check (inscricao_estadual ~ '^[0-9A-Za-z./-]{1,20}$'),
  -- código IBGE da cidade da oficina (7 números)
  codigo_municipio text check (codigo_municipio ~ '^[0-9]{7}$'),
  -- NFS-e no padrão nacional (Emissor Nacional) ou no sistema da prefeitura
  padrao_nfse text not null default 'nacional' check (padrao_nfse in ('nacional', 'municipal')),
  -- item da lista da LC 116 (14.01: conserto e manutenção de veículos)
  codigo_servico text not null default '14.01' check (codigo_servico ~ '^[0-9]{2}\.[0-9]{2}$'),
  codigo_tributacao_nacional text not null default '140101' check (codigo_tributacao_nacional ~ '^[0-9]{6}$'),
  codigo_tributacao_municipal text check (char_length(codigo_tributacao_municipal) <= 20),
  aliquota_iss numeric(5, 2) check (aliquota_iss >= 0 and aliquota_iss <= 5),
  cnae text check (cnae ~ '^[0-9]{7}$'),
  -- o resto (NF-e das peças, IBS/CBS): o app confere antes de gravar
  opcoes jsonb not null default '{}'::jsonb check (jsonb_typeof(opcoes) = 'object' and pg_column_size(opcoes) <= 4000),
  ambiente text not null default 'homologacao' check (ambiente in ('homologacao', 'producao')),
  certificado_valido_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.oficinas_fiscal is 'Cadastro fiscal de cada oficina no emissor de notas. Só o servidor grava; dono e gerente leem.';

-- as credenciais da empresa no emissor (cifradas pelo servidor): ninguém lê pela API
create table if not exists privado.fiscal_credenciais (
  oficina_id uuid primary key references public.oficinas (id) on delete cascade,
  provedor text not null check (provedor in ('focus', 'teste')),
  dados jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 8000),
  atualizado_em timestamptz not null default now()
);

-- ------------------------------------------------------------------ notas

create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  documento_id text check (char_length(documento_id) between 1 and 100),
  tipo text not null check (tipo in ('nfse', 'nfe')),
  provedor text not null check (provedor in ('focus', 'teste')),
  -- a referência da nota no emissor (única por emissor)
  externo text not null check (externo ~ '^[A-Za-z0-9_-]{6,80}$'),
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  situacao text not null default 'processando' check (situacao in ('processando', 'autorizada', 'erro', 'cancelada')),
  numero text check (char_length(numero) <= 40),
  serie text check (char_length(serie) <= 10),
  chave text check (char_length(chave) <= 80),
  url_pdf text check (char_length(url_pdf) <= 600 and url_pdf ~ '^https://'),
  url_xml text check (char_length(url_xml) <= 600 and url_xml ~ '^https://'),
  valor numeric(12, 2) not null check (valor > 0 and valor <= 10000000),
  -- quem recebe a nota: {nome, documento, email}
  tomador jsonb not null default '{}'::jsonb check (jsonb_typeof(tomador) = 'object' and pg_column_size(tomador) <= 4000),
  mensagem text check (char_length(mensagem) <= 1000),
  autorizada_em timestamptz,
  cancelada_em timestamptz,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, externo)
);

comment on table public.notas_fiscais is 'NFS-e e NF-e emitidas pela oficina no emissor de notas. Só o servidor grava; dono e gerente leem.';

create index if not exists notas_fiscais_documento_idx on public.notas_fiscais (oficina_id, documento_id);
create index if not exists notas_fiscais_atualizadas_idx on public.notas_fiscais (oficina_id, atualizado_em desc);
create index if not exists notas_fiscais_processando_idx on public.notas_fiscais (criado_em) where situacao = 'processando';

-- os avisos do emissor (webhooks), guardados uma vez cada
create table if not exists privado.fiscal_eventos (
  id bigint generated always as identity primary key,
  provedor text not null check (provedor in ('focus', 'teste')),
  evento_id text not null check (char_length(evento_id) between 1 and 200),
  externo text check (char_length(externo) <= 120),
  recebido_em timestamptz not null default now(),
  corpo jsonb not null,
  aplicado boolean not null default false,
  unique (provedor, evento_id)
);

-- ------------------------------------------------------------------ quem lê

alter table public.oficinas_fiscal enable row level security;
alter table public.notas_fiscais enable row level security;
alter table privado.fiscal_credenciais enable row level security;
alter table privado.fiscal_eventos enable row level security;

revoke all on public.oficinas_fiscal, public.notas_fiscais from anon, authenticated;
revoke all on privado.fiscal_credenciais, privado.fiscal_eventos from public, anon, authenticated;
grant select on public.oficinas_fiscal, public.notas_fiscais to authenticated, anon;

drop policy if exists "Ninguém pela API" on privado.fiscal_credenciais;
create policy "Ninguém pela API" on privado.fiscal_credenciais as restrictive for all to public using (false) with check (false);
drop policy if exists "Ninguém pela API" on privado.fiscal_eventos;
create policy "Ninguém pela API" on privado.fiscal_eventos as restrictive for all to public using (false) with check (false);

drop policy if exists "Dono e gerente veem o cadastro fiscal" on public.oficinas_fiscal;
create policy "Dono e gerente veem o cadastro fiscal" on public.oficinas_fiscal for select to authenticated
  using (privado.papel_na_oficina(oficina_id) in ('dono', 'gerente') or (select privado.eh_equipe(array['financeiro'])));
drop policy if exists "O sistema lê o cadastro fiscal" on public.oficinas_fiscal;
create policy "O sistema lê o cadastro fiscal" on public.oficinas_fiscal for select to anon
  using ((select privado.sistema_autorizado()));

drop policy if exists "Dono e gerente veem as notas" on public.notas_fiscais;
create policy "Dono e gerente veem as notas" on public.notas_fiscais for select to authenticated
  using (privado.papel_na_oficina(oficina_id) in ('dono', 'gerente') or (select privado.eh_equipe(array['financeiro'])));
drop policy if exists "O sistema lê as notas" on public.notas_fiscais;
create policy "O sistema lê as notas" on public.notas_fiscais for select to anon
  using ((select privado.sistema_autorizado()));

drop trigger if exists auditar on public.oficinas_fiscal;
create trigger auditar after insert or update or delete on public.oficinas_fiscal for each row execute function privado.auditar();

-- ------------------------------------------------------------------ regras

/** A pessoa é dona ou gerente da oficina (o servidor manda quem pediu). */
create or replace function privado.fiscal_gestao(p_oficina uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.oficina_membros m join public.oficinas o on o.id = m.oficina_id
     where m.oficina_id = p_oficina and m.user_id = p_user and m.papel in ('dono', 'gerente') and o.ativa
  );
$$;
revoke all on function privado.fiscal_gestao(uuid, uuid) from public, anon, authenticated;

/** Confere a chave do sistema, quem pediu e o plano (nota fiscal é do Pro e do teste do Pro). */
create or replace function privado.fiscal_conferir(p_oficina uuid, p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_user is null or not privado.fiscal_gestao(p_oficina, p_user) then
    raise exception 'Só o dono e o gerente cuidam das notas fiscais' using errcode = '42501';
  end if;
  if coalesce(privado.plano_da_oficina(p_oficina), 'gratis') not in ('pro', 'teste') then
    raise exception 'As notas fiscais são do Pro' using errcode = 'RV090';
  end if;
end;
$$;
revoke all on function privado.fiscal_conferir(uuid, uuid) from public, anon, authenticated;

/** A situação depois do aviso: a cancelada não volta, a autorizada não volta a processar. */
create or replace function privado.fiscal_proxima_situacao(p_atual text, p_nova text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_nova is null or p_nova not in ('processando', 'autorizada', 'erro', 'cancelada') then p_atual
    when p_atual = 'cancelada' then 'cancelada'
    when p_atual = 'autorizada' and p_nova in ('processando', 'erro') then 'autorizada'
    else p_nova end;
$$;

-- ------------------------------------------------------------------ gravação pelo servidor

/** Grava o cadastro fiscal da oficina (depois de cadastrar a empresa no emissor). */
create or replace function public.fiscal_salvar_config(p_oficina uuid, p_user uuid, p_config jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_config, '{}'::jsonb);
  r public.oficinas_fiscal%rowtype;
begin
  perform privado.fiscal_conferir(p_oficina, p_user);
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Cadastro inválido' using errcode = '22023';
  end if;
  insert into public.oficinas_fiscal as f (oficina_id, provedor, provedor_empresa_id, cnpj, razao_social, regime, inscricao_municipal,
    inscricao_estadual, codigo_municipio, padrao_nfse, codigo_servico, codigo_tributacao_nacional, codigo_tributacao_municipal,
    aliquota_iss, cnae, opcoes, ambiente)
  values (p_oficina, c ->> 'provedor', nullif(c ->> 'provedorEmpresaId', ''), c ->> 'cnpj', trim(c ->> 'razaoSocial'), c ->> 'regime',
    nullif(c ->> 'inscricaoMunicipal', ''), nullif(c ->> 'inscricaoEstadual', ''), nullif(c ->> 'codigoMunicipio', ''),
    coalesce(nullif(c ->> 'padraoNfse', ''), 'nacional'), coalesce(nullif(c ->> 'codigoServico', ''), '14.01'),
    coalesce(nullif(c ->> 'codigoTributacaoNacional', ''), '140101'), nullif(c ->> 'codigoTributacaoMunicipal', ''),
    (c ->> 'aliquotaIss')::numeric, nullif(c ->> 'cnae', ''), coalesce(c -> 'opcoes', '{}'::jsonb),
    coalesce(nullif(c ->> 'ambiente', ''), 'homologacao'))
  on conflict (oficina_id) do update
    set provedor = excluded.provedor,
        provedor_empresa_id = coalesce(excluded.provedor_empresa_id, case when f.provedor = excluded.provedor then f.provedor_empresa_id end),
        cnpj = excluded.cnpj, razao_social = excluded.razao_social, regime = excluded.regime,
        inscricao_municipal = excluded.inscricao_municipal, inscricao_estadual = excluded.inscricao_estadual,
        codigo_municipio = excluded.codigo_municipio, padrao_nfse = excluded.padrao_nfse, codigo_servico = excluded.codigo_servico,
        codigo_tributacao_nacional = excluded.codigo_tributacao_nacional, codigo_tributacao_municipal = excluded.codigo_tributacao_municipal,
        aliquota_iss = excluded.aliquota_iss, cnae = excluded.cnae, opcoes = excluded.opcoes, ambiente = excluded.ambiente,
        -- outro CNPJ é outra empresa: o certificado antigo não vale para ela
        certificado_valido_ate = case when f.cnpj = excluded.cnpj then f.certificado_valido_ate end,
        atualizado_em = now()
  returning * into r;
  return to_jsonb(r);
end;
$$;

/** Guarda as credenciais da empresa no emissor (já cifradas pelo servidor). */
create or replace function public.fiscal_guardar_credenciais(p_oficina uuid, p_user uuid, p_provedor text, p_dados jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.fiscal_conferir(p_oficina, p_user);
  insert into privado.fiscal_credenciais as f (oficina_id, provedor, dados)
  values (p_oficina, p_provedor, coalesce(p_dados, '{}'::jsonb))
  on conflict (oficina_id) do update set provedor = excluded.provedor, dados = excluded.dados, atualizado_em = now();
  return true;
end;
$$;

/** As credenciais da empresa no emissor, para o servidor falar com ele. */
create or replace function public.fiscal_credenciais(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (select jsonb_build_object('provedor', f.provedor, 'dados', f.dados) from privado.fiscal_credenciais f where f.oficina_id = p_oficina);
end;
$$;

/** O certificado A1 foi aceito pelo emissor: anota até quando ele vale (o arquivo não fica aqui). */
create or replace function public.fiscal_certificado(p_oficina uuid, p_user uuid, p_valido_ate timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.fiscal_conferir(p_oficina, p_user);
  update public.oficinas_fiscal set certificado_valido_ate = p_valido_ate, atualizado_em = now() where oficina_id = p_oficina;
  return found;
end;
$$;

/** Registra a nota que o emissor acabou de receber (ela começa processando). Devolve a nota. */
create or replace function public.fiscal_registrar_nota(
  p_oficina uuid, p_user uuid, p_documento text, p_tipo text, p_provedor text, p_externo text, p_ambiente text,
  p_valor numeric, p_tomador jsonb, p_situacao text default 'processando', p_mensagem text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n public.notas_fiscais%rowtype;
begin
  perform privado.fiscal_conferir(p_oficina, p_user);
  if not exists (select 1 from public.oficinas_fiscal where oficina_id = p_oficina) then
    raise exception 'Cadastre os dados fiscais da oficina primeiro' using errcode = 'RV091';
  end if;
  if (select count(*) from public.notas_fiscais where oficina_id = p_oficina and criado_em > now() - interval '1 hour') >= 300 then
    raise exception 'Muitas notas seguidas. Espere um pouco' using errcode = 'P0001';
  end if;
  insert into public.notas_fiscais (oficina_id, documento_id, tipo, provedor, externo, ambiente, situacao, valor, tomador, mensagem, criado_por)
  values (p_oficina, nullif(left(p_documento, 100), ''), p_tipo, p_provedor, p_externo, p_ambiente,
    coalesce(p_situacao, 'processando'), round(p_valor, 2), coalesce(p_tomador, '{}'::jsonb), left(p_mensagem, 1000), p_user)
  returning * into n;
  return to_jsonb(n);
end;
$$;

/**
 * Aplica o que o emissor disse da nota (consulta ou aviso). Repetir não muda nada; a cancelada
 * não volta e a autorizada não volta a processar. Devolve a nota (null se não achou).
 */
create or replace function public.fiscal_atualizar_nota(p_provedor text, p_externo text, p_dados jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n public.notas_fiscais%rowtype;
  d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_situacao text;
  v_pdf text := d ->> 'urlPdf';
  v_xml text := d ->> 'urlXml';
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into n from public.notas_fiscais where provedor = p_provedor and externo = p_externo for update;
  if not found then
    return null;
  end if;
  v_situacao := privado.fiscal_proxima_situacao(n.situacao, d ->> 'situacao');
  update public.notas_fiscais
     set situacao = v_situacao,
         numero = coalesce(nullif(left(d ->> 'numero', 40), ''), numero),
         serie = coalesce(nullif(left(d ->> 'serie', 10), ''), serie),
         chave = coalesce(nullif(left(d ->> 'chave', 80), ''), chave),
         url_pdf = coalesce(case when v_pdf ~ '^https://' then left(v_pdf, 600) end, url_pdf),
         url_xml = coalesce(case when v_xml ~ '^https://' then left(v_xml, 600) end, url_xml),
         mensagem = case
           when v_situacao is distinct from n.situacao then left(nullif(d ->> 'mensagem', ''), 1000)
           else coalesce(left(nullif(d ->> 'mensagem', ''), 1000), mensagem) end,
         autorizada_em = case when v_situacao = 'autorizada' then coalesce(autorizada_em, now()) else autorizada_em end,
         cancelada_em = case when v_situacao = 'cancelada' then coalesce(cancelada_em, now()) else cancelada_em end,
         atualizado_em = now()
   where id = n.id
   returning * into n;
  return to_jsonb(n);
end;
$$;

/**
 * Guarda o aviso do emissor (webhook) uma vez só e aplica na nota. Devolve {novo, nota}:
 * o mesmo aviso repetido volta com novo = false e não muda nada.
 */
create or replace function public.fiscal_webhook(p_provedor text, p_evento text, p_externo text, p_dados jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_nota jsonb;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.fiscal_eventos (provedor, evento_id, externo, corpo)
  values (p_provedor, left(p_evento, 200), left(p_externo, 120), coalesce(p_dados, '{}'::jsonb))
  on conflict (provedor, evento_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('novo', false, 'nota', null);
  end if;
  v_nota := public.fiscal_atualizar_nota(p_provedor, p_externo, p_dados);
  update privado.fiscal_eventos set aplicado = v_nota is not null where id = v_id;
  return jsonb_build_object('novo', true, 'nota', v_nota);
end;
$$;

revoke all on function
  public.fiscal_salvar_config(uuid, uuid, jsonb),
  public.fiscal_guardar_credenciais(uuid, uuid, text, jsonb),
  public.fiscal_credenciais(uuid),
  public.fiscal_certificado(uuid, uuid, timestamptz),
  public.fiscal_registrar_nota(uuid, uuid, text, text, text, text, text, numeric, jsonb, text, text),
  public.fiscal_atualizar_nota(text, text, jsonb),
  public.fiscal_webhook(text, text, text, jsonb)
from public;

-- o servidor (chave do sistema) entra como anon; cada função confere a chave
grant execute on function
  public.fiscal_salvar_config(uuid, uuid, jsonb),
  public.fiscal_guardar_credenciais(uuid, uuid, text, jsonb),
  public.fiscal_credenciais(uuid),
  public.fiscal_certificado(uuid, uuid, timestamptz),
  public.fiscal_registrar_nota(uuid, uuid, text, text, text, text, text, numeric, jsonb, text, text),
  public.fiscal_atualizar_nota(text, text, jsonb),
  public.fiscal_webhook(text, text, text, jsonb)
to anon;

-- tempo real: a ordem de serviço vê a nota sair (o banco local de testes não tem a publicação)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notas_fiscais') then
    alter publication supabase_realtime add table public.notas_fiscais;
  end if;
end $$;
