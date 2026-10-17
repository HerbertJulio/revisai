-- Cobrança: a assinatura do Pro (Pix Automático, Pix, cartão ou boleto, por um gateway), cada
-- pagamento com a nota fiscal (NFS-e), a mensalidade e a comissão das lojas, e os avisos dos
-- gateways (webhooks) guardados para não aplicar o mesmo evento duas vezes.
-- Quem escreve é o servidor, com a chave do sistema, depois de falar com o gateway; a oficina e a
-- loja só leem o que é delas; a equipe (financeiro) lê tudo e lança à mão o que for preciso.

-- ------------------------------------------------------------------ assinaturas do Pro

create table public.assinaturas_pro (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas (id) on delete cascade,
  provedor text not null check (provedor in ('asaas', 'efi', 'teste')),
  metodo text not null check (metodo in ('pix_automatico', 'pix', 'cartao', 'boleto')),
  cliente_externo text check (char_length(cliente_externo) <= 120),
  assinatura_externa text check (char_length(assinatura_externa) <= 120),
  valor numeric(10, 2) not null check (valor > 0 and valor <= 10000),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'ativa', 'atrasada', 'cancelada')),
  documento text check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  nome_nota text check (char_length(nome_nota) <= 120),
  email_nota text check (char_length(email_nota) <= 160),
  proximo_vencimento date,
  -- o código do Pix Automático para o pagador autorizar no banco dele (copia e cola)
  autorizacao text check (char_length(autorizacao) <= 600),
  cancelar_no_fim boolean not null default false,
  cancelada_em timestamptz,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, assinatura_externa)
);

comment on table public.assinaturas_pro is 'Assinatura do Pro de cada oficina no gateway de pagamento. Só o servidor (chave do sistema) grava.';

-- uma assinatura viva por oficina
create unique index assinaturas_pro_uma_viva on public.assinaturas_pro (oficina_id) where situacao <> 'cancelada';
create index assinaturas_pro_situacao_idx on public.assinaturas_pro (situacao, proximo_vencimento);

-- ------------------------------------------------------------------ pagamentos

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pro', 'loja')),
  oficina_id uuid references public.oficinas (id) on delete set null,
  fornecedor_id bigint references public.fornecedores (id) on delete set null,
  assinatura_id uuid references public.assinaturas_pro (id) on delete set null,
  provedor text not null check (provedor in ('asaas', 'efi', 'teste', 'manual')),
  externo text check (char_length(externo) <= 120),
  -- o mês da cobrança da loja ('AAAA-MM'); no Pro, o mês do vencimento
  referencia text check (referencia ~ '^[0-9]{4}-[0-9]{2}$'),
  metodo text check (metodo in ('pix_automatico', 'pix', 'cartao', 'boleto', 'manual')),
  valor numeric(10, 2) not null check (valor >= 0 and valor <= 1000000),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'pago', 'atrasado', 'cancelado', 'estornado')),
  vencimento date,
  pago_em timestamptz,
  descricao text check (char_length(descricao) <= 300),
  link_pagamento text check (char_length(link_pagamento) <= 500 and link_pagamento ~ '^https://'),
  pix_copia_cola text check (char_length(pix_copia_cola) <= 600),
  boleto_linha text check (char_length(boleto_linha) <= 80),
  nota_externa text check (char_length(nota_externa) <= 120),
  nota_numero text check (char_length(nota_numero) <= 40),
  nota_url text check (char_length(nota_url) <= 500 and nota_url ~ '^https://'),
  nota_situacao text check (nota_situacao in ('agendada', 'emitida', 'erro', 'cancelada')),
  nota_erro text check (char_length(nota_erro) <= 300),
  -- o mês de Pro deste pagamento já entrou na oficina
  periodo_aplicado boolean not null default false,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, externo),
  check ((tipo = 'pro' and oficina_id is not null) or (tipo = 'loja' and fornecedor_id is not null))
);

comment on table public.pagamentos is 'Cada cobrança (Pro das oficinas e mensal das lojas), com a nota fiscal. Só o servidor e o financeiro gravam.';

create index pagamentos_oficina_idx on public.pagamentos (oficina_id, criado_em desc);
create index pagamentos_fornecedor_idx on public.pagamentos (fornecedor_id, referencia);
create index pagamentos_assinatura_idx on public.pagamentos (assinatura_id);
create index pagamentos_situacao_idx on public.pagamentos (situacao, vencimento);

-- ------------------------------------------------------------------ avisos dos gateways

create table privado.webhooks_recebidos (
  id bigint generated always as identity primary key,
  provedor text not null check (provedor in ('asaas', 'efi', 'teste')),
  evento_id text not null check (char_length(evento_id) between 1 and 200),
  tipo text check (char_length(tipo) <= 80),
  recebido_em timestamptz not null default now(),
  corpo jsonb not null,
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text check (char_length(erro) <= 500),
  unique (provedor, evento_id)
);
create index webhooks_recebidos_pendentes_idx on privado.webhooks_recebidos (recebido_em) where processado_em is null;

alter table privado.webhooks_recebidos enable row level security;
create policy "Ninguém pela API" on privado.webhooks_recebidos as restrictive for all to public using (false) with check (false);
revoke all on privado.webhooks_recebidos from public, anon, authenticated;

-- ------------------------------------------------------------------ quem lê

alter table public.assinaturas_pro enable row level security;
alter table public.pagamentos enable row level security;
revoke all on public.assinaturas_pro, public.pagamentos from anon, authenticated;
grant select on public.assinaturas_pro, public.pagamentos to authenticated;

create policy "Dono e gerente veem a assinatura" on public.assinaturas_pro for select to authenticated
  using (privado.papel_na_oficina(oficina_id) in ('dono', 'gerente') or (select privado.eh_equipe(array['financeiro'])));

create policy "Dono e gerente veem os pagamentos" on public.pagamentos for select to authenticated
  using (
    (oficina_id is not null and privado.papel_na_oficina(oficina_id) in ('dono', 'gerente'))
    or (fornecedor_id is not null and privado.papel_no_fornecedor(fornecedor_id) = 'dono')
    or (select privado.eh_equipe(array['financeiro']))
  );

create trigger auditar after insert or update or delete on public.assinaturas_pro for each row execute function privado.auditar();
create trigger auditar after insert or update or delete on public.pagamentos for each row execute function privado.auditar();

-- ------------------------------------------------------------------ preço

/** Fundadoras pagam menos enquanto houver vaga (as 100 primeiras assinantes). */
create or replace function public.cobranca_preco(p_oficina uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fundador boolean;
  v_vagas integer;
begin
  if privado.papel_na_oficina(p_oficina) is null and not privado.sistema_autorizado() and not privado.eh_equipe() then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  select fundador into v_fundador from public.oficinas where id = p_oficina;
  v_vagas := greatest(100 - (select count(*) from public.oficinas where fundador), 0);
  return jsonb_build_object(
    'fundadora', coalesce(v_fundador, false),
    'vagas', v_vagas,
    'valor', case when coalesce(v_fundador, false) or v_vagas > 0 then 29.90 else 39.90 end
  );
end;
$$;

-- ------------------------------------------------------------------ gravação pelo servidor

/** O servidor guarda a assinatura que acabou de criar no gateway (troca a viva, se houver). */
create or replace function public.cobranca_registrar_assinatura(
  p_oficina uuid, p_provedor text, p_metodo text, p_cliente text, p_assinatura text, p_valor numeric,
  p_documento text, p_nome text, p_email text, p_vencimento date, p_autorizacao text, p_user uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.assinaturas_pro set situacao = 'cancelada', cancelada_em = now(), atualizado_em = now()
   where oficina_id = p_oficina and situacao <> 'cancelada';
  insert into public.assinaturas_pro (oficina_id, provedor, metodo, cliente_externo, assinatura_externa, valor, documento, nome_nota, email_nota,
    proximo_vencimento, autorizacao, criado_por)
  values (p_oficina, p_provedor, p_metodo, nullif(p_cliente, ''), nullif(p_assinatura, ''), round(p_valor, 2), nullif(p_documento, ''),
    nullif(left(trim(coalesce(p_nome, '')), 120), ''), nullif(lower(trim(coalesce(p_email, ''))), ''), p_vencimento, nullif(left(p_autorizacao, 600), ''), p_user)
  returning id into v_id;
  return v_id;
end;
$$;

/** Atualiza o que o gateway diz da assinatura (código de autorização, próximo vencimento). */
create or replace function public.cobranca_atualizar_assinatura(p_id uuid, p_situacao text default null, p_vencimento date default null, p_autorizacao text default null, p_externa text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.assinaturas_pro
     set situacao = coalesce(p_situacao, situacao),
         proximo_vencimento = coalesce(p_vencimento, proximo_vencimento),
         autorizacao = coalesce(nullif(left(p_autorizacao, 600), ''), autorizacao),
         assinatura_externa = coalesce(nullif(p_externa, ''), assinatura_externa),
         cancelada_em = case when p_situacao = 'cancelada' then coalesce(cancelada_em, now()) else cancelada_em end,
         atualizado_em = now()
   where id = p_id;
  return found;
end;
$$;

/**
 * Guarda (ou atualiza) uma cobrança que o gateway criou. A oficina ou a loja vem da assinatura
 * quando ela existe. Devolve o id do pagamento.
 */
create or replace function public.cobranca_registrar_pagamento(
  p_provedor text, p_externo text, p_tipo text, p_oficina uuid, p_fornecedor bigint, p_assinatura uuid,
  p_valor numeric, p_vencimento date, p_metodo text, p_descricao text, p_link text, p_pix text, p_boleto text,
  p_referencia text default null, p_user uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_oficina uuid := p_oficina;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if v_oficina is null and p_assinatura is not null then
    select oficina_id into v_oficina from public.assinaturas_pro where id = p_assinatura;
  end if;
  insert into public.pagamentos as pg (tipo, oficina_id, fornecedor_id, assinatura_id, provedor, externo, referencia, metodo, valor, vencimento,
    descricao, link_pagamento, pix_copia_cola, boleto_linha, criado_por)
  values (p_tipo, v_oficina, p_fornecedor, p_assinatura, p_provedor, nullif(p_externo, ''),
    coalesce(p_referencia, to_char(coalesce(p_vencimento, (now() at time zone 'America/Sao_Paulo')::date), 'YYYY-MM')),
    p_metodo, round(p_valor, 2), p_vencimento, left(p_descricao, 300),
    case when p_link ~ '^https://' then left(p_link, 500) end, nullif(left(p_pix, 600), ''), nullif(left(p_boleto, 80), ''), p_user)
  on conflict (provedor, externo) do update
    set valor = excluded.valor,
        vencimento = coalesce(excluded.vencimento, pg.vencimento),
        link_pagamento = coalesce(excluded.link_pagamento, pg.link_pagamento),
        pix_copia_cola = coalesce(excluded.pix_copia_cola, pg.pix_copia_cola),
        boleto_linha = coalesce(excluded.boleto_linha, pg.boleto_linha),
        assinatura_id = coalesce(pg.assinatura_id, excluded.assinatura_id),
        oficina_id = coalesce(pg.oficina_id, excluded.oficina_id),
        atualizado_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * O pagamento foi confirmado: marca como pago e, no Pro, soma um mês (de quando venceria, ou de
 * hoje se o Pro já tinha acabado). Rodar de novo não soma outro mês. A primeira cobrança paga de
 * uma oficina, enquanto há vaga, faz dela fundadora (o preço fica o de fundador).
 */
create or replace function public.cobranca_pagamento_confirmado(p_provedor text, p_externo text, p_pago_em timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.pagamentos%rowtype;
  o public.oficinas%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pago date;
  v_ate date;
  v_codigo text;
  v_valor_fundador numeric := 29.90;
begin
  if not privado.sistema_autorizado() and not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into p from public.pagamentos where provedor = p_provedor and externo = p_externo for update;
  if not found then
    return jsonb_build_object('achou', false);
  end if;
  v_pago := coalesce((p_pago_em at time zone 'America/Sao_Paulo')::date, v_hoje);
  update public.pagamentos
     set situacao = 'pago', pago_em = coalesce(p_pago_em, pago_em, now()), atualizado_em = now()
   where id = p.id;
  if p.tipo <> 'pro' or p.periodo_aplicado then
    return jsonb_build_object('achou', true, 'aplicado', false);
  end if;
  select * into o from public.oficinas where id = p.oficina_id for update;
  if not found then
    return jsonb_build_object('achou', true, 'aplicado', false);
  end if;
  v_ate := (greatest(coalesce(o.pro_ate, v_pago), v_pago) + interval '1 month')::date;
  update public.oficinas
     set pro_ate = v_ate,
         fundador = o.fundador or (p.valor <= v_valor_fundador and (select count(*) from public.oficinas where fundador) < 100)
   where id = o.id;
  update public.pagamentos set periodo_aplicado = true where id = p.id;
  if p.assinatura_id is not null then
    update public.assinaturas_pro
       set situacao = case when situacao = 'cancelada' then situacao else 'ativa' end,
           proximo_vencimento = greatest(coalesce(proximo_vencimento, v_ate), v_ate),
           atualizado_em = now()
     where id = p.assinatura_id;
  end if;
  -- o histórico de períodos pagos (o painel de números da equipe soma por aqui)
  for i in 1 .. 5 loop
    v_codigo := privado.codigo_curto(16);
    begin
      insert into public.assinaturas (oficina_id, oficina_nome, oficina_whatsapp, meses, valor, ate, codigo, observacao, ativacoes)
      values (o.id, o.nome, o.whatsapp, 1, p.valor, v_ate, v_codigo, left('Pagamento ' || p.provedor || ' ' || coalesce(p.externo, ''), 300), 1);
      exit;
    exception when unique_violation then
      if i = 5 then
        raise;
      end if;
    end;
  end loop;
  return jsonb_build_object('achou', true, 'aplicado', true, 'ate', v_ate);
end;
$$;

/**
 * Venceu sem pagar: o Pro continua 5 dias depois do vencimento (carência) e a assinatura fica
 * atrasada até pagar.
 */
create or replace function public.cobranca_pagamento_atrasado(p_provedor text, p_externo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.pagamentos%rowtype;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into p from public.pagamentos where provedor = p_provedor and externo = p_externo for update;
  if not found or p.situacao in ('pago', 'cancelado', 'estornado') then
    return false;
  end if;
  update public.pagamentos set situacao = 'atrasado', atualizado_em = now() where id = p.id;
  if p.tipo = 'pro' and p.oficina_id is not null then
    update public.oficinas
       set pro_ate = greatest(coalesce(pro_ate, (now() at time zone 'America/Sao_Paulo')::date), coalesce(p.vencimento, (now() at time zone 'America/Sao_Paulo')::date) + 5)
     where id = p.oficina_id
       -- carência só para quem já é assinante (teve um mês pago)
       and exists (select 1 from public.pagamentos x where x.oficina_id = p.oficina_id and x.tipo = 'pro' and x.situacao = 'pago');
    if p.assinatura_id is not null then
      update public.assinaturas_pro set situacao = 'atrasada', atualizado_em = now() where id = p.assinatura_id and situacao <> 'cancelada';
    end if;
  end if;
  return true;
end;
$$;

/** A cobrança sumiu no gateway (apagada) ou foi devolvida (estorno). O estorno tira o mês de volta. */
create or replace function public.cobranca_pagamento_desfeito(p_provedor text, p_externo text, p_situacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.pagamentos%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_situacao not in ('cancelado', 'estornado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  select * into p from public.pagamentos where provedor = p_provedor and externo = p_externo for update;
  if not found then
    return false;
  end if;
  update public.pagamentos set situacao = p_situacao, atualizado_em = now() where id = p.id;
  if p_situacao = 'estornado' and p.tipo = 'pro' and p.periodo_aplicado then
    update public.oficinas set pro_ate = greatest((pro_ate - interval '1 month')::date, v_hoje - 1) where id = p.oficina_id;
    update public.pagamentos set periodo_aplicado = false where id = p.id;
  end if;
  return true;
end;
$$;

/** A nota fiscal do pagamento (agendada, emitida, com erro ou cancelada). */
create or replace function public.cobranca_nota(p_provedor text, p_externo text, p_nota text, p_numero text, p_url text, p_situacao text, p_erro text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.pagamentos
     set nota_externa = coalesce(nullif(p_nota, ''), nota_externa),
         nota_numero = coalesce(nullif(left(p_numero, 40), ''), nota_numero),
         nota_url = coalesce(case when p_url ~ '^https://' then left(p_url, 500) end, nota_url),
         nota_situacao = coalesce(p_situacao, nota_situacao),
         nota_erro = case when p_situacao = 'erro' then left(p_erro, 300) else null end,
         atualizado_em = now()
   where provedor = p_provedor and (externo = p_externo or (p_nota is not null and nota_externa = p_nota));
  return found;
end;
$$;

/** A assinatura acabou no gateway (cancelada pela oficina, pela equipe ou pelo banco do pagador). O Pro já pago continua até o fim. */
create or replace function public.cobranca_assinatura_cancelada(p_provedor text, p_externa text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.assinaturas_pro set situacao = 'cancelada', cancelada_em = coalesce(cancelada_em, now()), atualizado_em = now()
   where provedor = p_provedor and assinatura_externa = p_externa and situacao <> 'cancelada';
  update public.pagamentos set situacao = 'cancelado', atualizado_em = now()
   where assinatura_id in (select id from public.assinaturas_pro where provedor = p_provedor and assinatura_externa = p_externa)
     and situacao = 'pendente';
  return found;
end;
$$;

-- ------------------------------------------------------------------ avisos dos gateways

/** Guarda o aviso do gateway. Devolve false quando o mesmo aviso já chegou antes (repetido). */
create or replace function public.cobranca_webhook_guardar(p_provedor text, p_evento text, p_tipo text, p_corpo jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  insert into privado.webhooks_recebidos (provedor, evento_id, tipo, corpo)
  values (p_provedor, left(p_evento, 200), left(p_tipo, 80), p_corpo)
  on conflict (provedor, evento_id) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.cobranca_webhook_resultado(p_provedor text, p_evento text, p_erro text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update privado.webhooks_recebidos
     set processado_em = case when p_erro is null then now() else processado_em end,
         erro = left(p_erro, 500),
         tentativas = tentativas + 1
   where provedor = p_provedor and evento_id = p_evento;
  return found;
end;
$$;

/** Os avisos que falharam (para tentar de novo). */
create or replace function public.cobranca_webhooks_pendentes(p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.sistema_autorizado() and not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('provedor', w.provedor, 'evento', w.evento_id, 'tipo', w.tipo, 'recebidoEm', w.recebido_em,
             'tentativas', w.tentativas, 'erro', w.erro, 'corpo', w.corpo) order by w.recebido_em)
      from (select * from privado.webhooks_recebidos where processado_em is null order by recebido_em limit least(greatest(p_limite, 1), 200)) w
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------------ financeiro, à mão

/** O financeiro lança a mensalidade e a comissão de uma loja (sem gateway, ou antes de gerar o Pix). */
create or replace function public.cobranca_lancar_loja(p_fornecedor bigint, p_mes text, p_valor numeric, p_descricao text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_mes !~ '^[0-9]{4}-[0-9]{2}$' or p_valor is null or p_valor < 0 then
    raise exception 'Confira o mês e o valor' using errcode = '22023';
  end if;
  insert into public.pagamentos (tipo, fornecedor_id, provedor, externo, referencia, metodo, valor, vencimento, descricao, criado_por)
  values ('loja', p_fornecedor, 'manual', 'manual-loja-' || p_fornecedor || '-' || p_mes || '-' || substr(md5(random()::text), 1, 6), p_mes, 'manual',
          round(p_valor, 2), ((p_mes || '-01')::date + interval '1 month' + interval '9 days')::date,
          coalesce(nullif(left(trim(coalesce(p_descricao, '')), 300), ''), 'Revisaí: mensalidade e comissão de ' || p_mes), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

/** O financeiro marca uma cobrança como paga (Pix recebido por fora, por exemplo). No Pro, soma o mês. */
create or replace function public.cobranca_marcar_pago(p_pagamento uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.pagamentos%rowtype;
begin
  if not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  select * into p from public.pagamentos where id = p_pagamento;
  if not found then
    raise exception 'Cobrança não encontrada' using errcode = 'P0001';
  end if;
  if p.situacao = 'pago' then
    return jsonb_build_object('achou', true, 'aplicado', false);
  end if;
  if p.externo is null then
    update public.pagamentos set externo = 'manual-' || p.id where id = p.id;
    p.externo := 'manual-' || p.id;
  end if;
  return public.cobranca_pagamento_confirmado(p.provedor, p.externo, now());
end;
$$;

/** O financeiro cancela uma cobrança que não vale mais. */
create or replace function public.cobranca_cancelar_pagamento(p_pagamento uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.pagamentos set situacao = 'cancelado', atualizado_em = now() where id = p_pagamento and situacao in ('pendente', 'atrasado');
  return found;
end;
$$;

revoke all on function
  public.cobranca_preco(uuid),
  public.cobranca_registrar_assinatura(uuid, text, text, text, text, numeric, text, text, text, date, text, uuid),
  public.cobranca_atualizar_assinatura(uuid, text, date, text, text),
  public.cobranca_registrar_pagamento(text, text, text, uuid, bigint, uuid, numeric, date, text, text, text, text, text, text, uuid),
  public.cobranca_pagamento_confirmado(text, text, timestamptz),
  public.cobranca_pagamento_atrasado(text, text),
  public.cobranca_pagamento_desfeito(text, text, text),
  public.cobranca_nota(text, text, text, text, text, text, text),
  public.cobranca_assinatura_cancelada(text, text),
  public.cobranca_webhook_guardar(text, text, text, jsonb),
  public.cobranca_webhook_resultado(text, text, text),
  public.cobranca_webhooks_pendentes(integer),
  public.cobranca_lancar_loja(bigint, text, numeric, text),
  public.cobranca_marcar_pago(uuid),
  public.cobranca_cancelar_pagamento(uuid)
from public;

-- o servidor (chave do sistema) entra como anon
grant execute on function
  public.cobranca_preco(uuid),
  public.cobranca_registrar_assinatura(uuid, text, text, text, text, numeric, text, text, text, date, text, uuid),
  public.cobranca_atualizar_assinatura(uuid, text, date, text, text),
  public.cobranca_registrar_pagamento(text, text, text, uuid, bigint, uuid, numeric, date, text, text, text, text, text, text, uuid),
  public.cobranca_pagamento_confirmado(text, text, timestamptz),
  public.cobranca_pagamento_atrasado(text, text),
  public.cobranca_pagamento_desfeito(text, text, text),
  public.cobranca_nota(text, text, text, text, text, text, text),
  public.cobranca_assinatura_cancelada(text, text),
  public.cobranca_webhook_guardar(text, text, text, jsonb),
  public.cobranca_webhook_resultado(text, text, text),
  public.cobranca_webhooks_pendentes(integer)
to anon;

-- a oficina vê o preço; o financeiro lança, marca e consulta
grant execute on function
  public.cobranca_preco(uuid),
  public.cobranca_pagamento_confirmado(text, text, timestamptz),
  public.cobranca_webhooks_pendentes(integer),
  public.cobranca_lancar_loja(bigint, text, numeric, text),
  public.cobranca_marcar_pago(uuid),
  public.cobranca_cancelar_pagamento(uuid)
to authenticated;

-- tempo real: a tela da assinatura vê o pagamento cair
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pagamentos, public.assinaturas_pro;
  end if;
end $$;
