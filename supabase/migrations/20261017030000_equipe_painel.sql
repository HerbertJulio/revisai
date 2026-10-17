-- O painel da equipe com contas: quem pode cadastrar o segundo fator, a lista das oficinas
-- (só números, nunca os dados dos clientes delas), os números do negócio (assinaturas, coortes,
-- marketplace, uso e funil, antifraude) e a caixa de suporte. Tudo só para a equipe com segundo
-- fator recente (privado.eh_equipe), e cada papel vê o que precisa.

-- ------------------------------------------------------------------ entrada da equipe

/** A pessoa que entrou é da equipe ou tem convite (só então o painel mostra o segundo fator). */
create or replace function public.equipe_convidado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from privado.equipe e where e.user_id = auth.uid() and e.ativo)
    or exists (select 1 from privado.equipe_convites c where c.email = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

revoke all on function public.equipe_convidado() from public, anon;
grant execute on function public.equipe_convidado() to authenticated;

-- ------------------------------------------------------------------ oficinas, para a equipe

/**
 * As oficinas com plano, membros e quanto usam o app (só contagens: a equipe não lê os clientes,
 * carros e ordens de ninguém).
 */
create or replace function public.equipe_oficinas(p_busca text default null, p_limite integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := nullif(trim(coalesce(p_busca, '')), '');
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  if not privado.eh_equipe() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.criado_em desc)
      from (
        select o.id, o.nome, o.cidade, o.uf, o.whatsapp, o.cnpj, o.pro_ate as "proAte", o.teste_ate as "testeAte", o.fundador, o.ativa,
               o.excluir_em as "excluirEm", o.criado_em,
               privado.plano_da_oficina(o.id) as plano,
               (select count(*) from public.oficina_membros m where m.oficina_id = o.id) as membros,
               (select m.email from public.oficina_membros m where m.oficina_id = o.id and m.papel = 'dono' order by m.criado_em limit 1) as dono,
               (select count(*) from public.registros r where r.oficina_id = o.id and r.colecao = 'clientes' and not r.apagado) as clientes,
               (select count(*) from public.registros r where r.oficina_id = o.id and r.colecao = 'documentos' and not r.apagado) as documentos,
               (select max(r.atualizado_em) from public.registros r where r.oficina_id = o.id) as "ultimoUso",
               coalesce((select u.quantidade from public.uso_mensal u where u.oficina_id = o.id and u.mes = v_mes and u.recurso = 'montagem'), 0) as "montagensMes",
               coalesce((select sum(pf.subtotal) from public.pedidos_fornecedores pf where pf.oficina_id = o.id and pf.status <> 'cancelado'), 0) as compras
          from public.oficinas o
         where v_busca is null
            or o.nome ilike '%' || v_busca || '%'
            or o.cidade ilike '%' || v_busca || '%'
            or o.whatsapp like '%' || regexp_replace(v_busca, '\D', '', 'g') || '%' and regexp_replace(v_busca, '\D', '', 'g') <> ''
            or exists (select 1 from public.oficina_membros m where m.oficina_id = o.id and m.email ilike '%' || v_busca || '%')
         order by o.criado_em desc
         limit least(greatest(coalesce(p_limite, 500), 1), 1000)
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.equipe_oficinas(text, integer) from public, anon;
grant execute on function public.equipe_oficinas(text, integer) to authenticated;

-- ------------------------------------------------------------------ números: assinaturas

/**
 * MRR, pagantes, churn do mês, conversão e a série dos últimos 6 meses. O valor de cada oficina
 * no Pro sai da última assinatura paga que ainda vale (valor / meses); sem ela, do preço da
 * tabela (o de fundador para as fundadoras), que o app passa.
 */
create or replace function public.equipe_metricas_assinatura(p_preco numeric default 39.9, p_preco_fundador numeric default 29.9)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_res jsonb;
begin
  if not privado.eh_equipe(array['financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  with ativas as (
    select o.id, o.fundador,
           (select a.valor / nullif(a.meses, 0)
              from public.assinaturas a
             where a.oficina_id = o.id and a.ate >= v_hoje and a.valor is not null
             order by a.criado_em desc limit 1) as mensal_pago
      from public.oficinas o
     where o.pro_ate >= v_hoje and o.ativa
  ),
  numeros as (
    select count(*) as pagantes,
           count(*) filter (where mensal_pago is not null) as com_assinatura,
           round(coalesce(sum(coalesce(mensal_pago, case when fundador then p_preco_fundador else p_preco end)), 0), 2) as mrr
      from ativas
  ),
  meses as (
    select generate_series(v_inicio - interval '5 months', v_inicio, interval '1 month')::date as mes
  )
  select jsonb_build_object(
    'pagantes', n.pagantes,
    'comAssinatura', n.com_assinatura,
    'mrr', n.mrr,
    'receitaMedia', case when n.pagantes > 0 then round(n.mrr / n.pagantes, 2) else 0 end,
    'teste', (select count(*) from public.oficinas o where o.ativa and o.teste_ate >= v_hoje and (o.pro_ate is null or o.pro_ate < v_hoje)),
    'gratis', (select count(*) from public.oficinas o where o.ativa and (o.pro_ate is null or o.pro_ate < v_hoje) and (o.teste_ate is null or o.teste_ate < v_hoje)),
    'receitaMes', (select coalesce(sum(a.valor), 0) from public.assinaturas a where (a.criado_em at time zone 'America/Sao_Paulo')::date >= v_inicio),
    'churnMes', jsonb_build_object(
      'sairam', (select count(*) from public.oficinas o where o.pro_ate >= v_inicio and o.pro_ate < v_hoje),
      'base', (select count(*) from public.oficinas o where o.pro_ate >= v_inicio)
    ),
    'conversao', jsonb_build_object(
      'cadastradas', (select count(*) from public.oficinas),
      'testaram', (select count(*) from public.oficinas where teste_ate is not null),
      'pro', (select count(*) from public.oficinas where pro_ate is not null)
    ),
    'serie', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'receita', (select coalesce(sum(a.valor), 0) from public.assinaturas a where date_trunc('month', a.criado_em at time zone 'America/Sao_Paulo')::date = m.mes),
        'assinaturas', (select count(*) from public.assinaturas a where date_trunc('month', a.criado_em at time zone 'America/Sao_Paulo')::date = m.mes),
        'oficinasNovas', (select count(*) from public.oficinas o where date_trunc('month', o.criado_em at time zone 'America/Sao_Paulo')::date = m.mes)
      ) order by m.mes), '[]'::jsonb)
        from meses m
    )
  )
  into v_res
  from numeros n;
  return v_res;
end;
$$;

-- ------------------------------------------------------------------ números: coortes de GMV

/**
 * Quanto cada turma de oficinas (mês da primeira compra na loja) gastou em cada mês depois.
 * Conta as partes dos pedidos que não foram canceladas.
 */
create or replace function public.equipe_coortes_gmv(p_meses integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date - make_interval(months => least(greatest(coalesce(p_meses, 6), 1), 24) - 1);
begin
  if not privado.eh_equipe(array['financeiro', 'suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    with partes as (
      select pf.oficina_id, date_trunc('month', pf.criado_em at time zone 'America/Sao_Paulo')::date as mes, pf.subtotal
        from public.pedidos_fornecedores pf
       where pf.oficina_id is not null and pf.status <> 'cancelado'
    ),
    primeiro as (
      select oficina_id, min(mes) as coorte from partes group by oficina_id
    ),
    base as (
      select p.coorte, x.oficina_id, x.subtotal,
             ((extract(year from x.mes) - extract(year from p.coorte)) * 12 + extract(month from x.mes) - extract(month from p.coorte))::integer as idade
        from partes x join primeiro p using (oficina_id)
       where p.coorte >= v_inicio
    ),
    por_idade as (
      select coorte, idade, round(sum(subtotal), 2) as gmv, count(distinct oficina_id) as ativas
        from base group by coorte, idade
    )
    select jsonb_agg(jsonb_build_object(
             'coorte', to_char(c.coorte, 'YYYY-MM'),
             'oficinas', (select count(*) from primeiro p where p.coorte = c.coorte),
             'meses', (select jsonb_agg(jsonb_build_object('idade', pi.idade, 'gmv', pi.gmv, 'ativas', pi.ativas) order by pi.idade) from por_idade pi where pi.coorte = c.coorte)
           ) order by c.coorte)
      from (select distinct coorte from base) c
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------------ números: marketplace

/**
 * O marketplace na janela de p_dias (e na janela anterior, para comparar): GMV, comissão e take
 * rate, pedidos, ticket, recompra em 30/60/90 dias, tempo até a primeira compra, prazo de
 * confirmação até a entrega, cancelamentos e as lojas que mais venderam.
 */
create or replace function public.equipe_painel_marketplace(p_dias integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_agora timestamptz := now();
  v_ini timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365));
  v_ant timestamptz := now() - make_interval(days => 2 * least(greatest(coalesce(p_dias, 30), 1), 365));
begin
  if not privado.eh_equipe(array['financeiro', 'suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (
    with partes as (
      select pf.*, round(pf.subtotal * pf.comissao_percentual / 100, 2) as comissao
        from public.pedidos_fornecedores pf
    ),
    janela as (
      select
        coalesce(sum(subtotal) filter (where status <> 'cancelado' and criado_em >= v_ini), 0) as gmv,
        coalesce(sum(comissao) filter (where status <> 'cancelado' and criado_em >= v_ini), 0) as comissao,
        coalesce(sum(subtotal) filter (where status <> 'cancelado' and criado_em >= v_ant and criado_em < v_ini), 0) as gmv_anterior,
        count(distinct pedido_id) filter (where status <> 'cancelado' and criado_em >= v_ini) as pedidos,
        count(distinct oficina_id) filter (where status <> 'cancelado' and criado_em >= v_ini) as compradoras,
        count(*) filter (where criado_em >= v_ini) as partes,
        count(*) filter (where criado_em >= v_ini and status = 'cancelado') as canceladas,
        count(*) filter (where criado_em >= v_ini and status = 'cancelado' and cancelado_por = 'loja') as canceladas_loja
      from partes
    ),
    compras as (
      select oficina_id, min(criado_em) as primeira
        from partes where status <> 'cancelado' and oficina_id is not null group by oficina_id
    ),
    recompra as (
      select n,
             count(*) filter (where c.primeira <= v_agora - make_interval(days => n)) as base,
             -- as partes de um mesmo pedido têm o mesmo instante: depois da primeira é outro pedido
             count(*) filter (where c.primeira <= v_agora - make_interval(days => n)
                               and exists (select 1 from partes p where p.oficina_id = c.oficina_id and p.status <> 'cancelado'
                                              and p.criado_em > c.primeira and p.criado_em <= c.primeira + make_interval(days => n))) as voltaram
        from compras c, unnest(array[30, 60, 90]) as n
       group by n
    ),
    entregas as (
      select h.parte_id,
             min(h.quando) filter (where h.para = 'confirmado') as confirmado,
             min(h.quando) filter (where h.para = 'entregue') as entregue
        from public.pedidos_historico h
        join public.pedidos_fornecedores pf on pf.id = h.parte_id and pf.criado_em >= v_ini
       where h.campo = 'status'
       group by h.parte_id
    ),
    lojas as (
      select f.id, f.nome, coalesce(sum(p.subtotal) filter (where p.status <> 'cancelado'), 0) as gmv,
             count(*) as partes, count(*) filter (where p.status = 'cancelado') as canceladas
        from partes p join public.fornecedores f on f.id = p.fornecedor_id
       where p.criado_em >= v_ini
       group by f.id, f.nome
    )
    select jsonb_build_object(
      'dias', v_dias,
      'gmv', j.gmv,
      'gmvAnterior', j.gmv_anterior,
      'comissao', j.comissao,
      'takeRate', case when j.gmv > 0 then round(j.comissao / j.gmv * 100, 2) else 0 end,
      'pedidos', j.pedidos,
      'compradoras', j.compradoras,
      'ticket', case when j.pedidos > 0 then round(j.gmv / j.pedidos, 2) else 0 end,
      'cancelamento', jsonb_build_object('partes', j.partes, 'canceladas', j.canceladas, 'pelaLoja', j.canceladas_loja),
      'recompra', coalesce((select jsonb_object_agg(r.n::text, jsonb_build_object('base', r.base, 'voltaram', r.voltaram)) from recompra r), '{}'::jsonb),
      'diasAtePrimeiraCompra', (
        select percentile_cont(0.5) within group (order by extract(epoch from c.primeira - o.criado_em) / 86400)
          from compras c join public.oficinas o on o.id = c.oficina_id
      ),
      'horasConfirmacaoEntrega', (
        select round(avg(extract(epoch from e.entregue - e.confirmado) / 3600)::numeric, 1)
          from entregas e where e.confirmado is not null and e.entregue is not null and e.entregue >= e.confirmado
      ),
      'lojas', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'gmv', l.gmv, 'partes', l.partes, 'canceladas', l.canceladas) order by l.gmv desc)
                           from (select * from lojas order by gmv desc limit 10) l), '[]'::jsonb)
    )
    from janela j
  );
end;
$$;

-- ------------------------------------------------------------------ números: uso e funil

/**
 * O funil (cadastro, primeiros dados, 10 clientes, teste, Pro) e o uso de cada oficina (contagens
 * por tipo de dado e a IA do mês), das mais ativas para as menos.
 */
create or replace function public.equipe_funil_uso(p_limite integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
begin
  if not privado.eh_equipe(array['suporte', 'financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return (
    with contagens as (
      select r.oficina_id,
             count(*) filter (where r.colecao = 'clientes' and not r.apagado) as clientes,
             count(*) filter (where r.colecao = 'veiculos' and not r.apagado) as carros,
             count(*) filter (where r.colecao = 'atendimentos' and not r.apagado) as servicos,
             count(*) filter (where r.colecao = 'documentos' and not r.apagado) as documentos,
             count(*) filter (where r.colecao = 'contatos' and not r.apagado) as avisos,
             max(r.atualizado_em) as ultimo
        from public.registros r
       group by r.oficina_id
    ),
    lista as (
      select o.id, o.nome, o.cidade, o.uf, o.criado_em, privado.plano_da_oficina(o.id) as plano,
             coalesce(c.clientes, 0) as clientes, coalesce(c.carros, 0) as carros, coalesce(c.servicos, 0) as servicos,
             coalesce(c.documentos, 0) as documentos, coalesce(c.avisos, 0) as avisos, c.ultimo,
             coalesce((select u.quantidade from public.uso_mensal u where u.oficina_id = o.id and u.mes = v_mes and u.recurso = 'montagem'), 0) as montagens,
             coalesce((select u.quantidade from public.uso_mensal u where u.oficina_id = o.id and u.mes = v_mes and u.recurso = 'transcricao'), 0) as transcricoes
        from public.oficinas o
        left join contagens c on c.oficina_id = o.id
    )
    select jsonb_build_object(
      'funil', jsonb_build_object(
        'cadastradas', (select count(*) from public.oficinas),
        'comDados', (select count(*) from lista where clientes + carros + servicos + documentos > 0),
        'com10Clientes', (select count(*) from lista where clientes >= 10),
        'testaram', (select count(*) from public.oficinas where teste_ate is not null),
        'pro', (select count(*) from public.oficinas where pro_ate is not null)
      ),
      'oficinas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'nome', l.nome, 'cidade', l.cidade, 'uf', l.uf, 'criadoEm', l.criado_em, 'plano', l.plano,
                 'clientes', l.clientes, 'carros', l.carros, 'servicos', l.servicos, 'documentos', l.documentos, 'avisos', l.avisos,
                 'montagens', l.montagens, 'transcricoes', l.transcricoes, 'ultimoUso', l.ultimo
               ) order by l.ultimo desc nulls last, l.criado_em desc)
          from (select * from lista order by ultimo desc nulls last, criado_em desc limit least(greatest(coalesce(p_limite, 300), 1), 1000)) l
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ------------------------------------------------------------------ números: antifraude

/**
 * Sinais para a equipe olhar (só lista, não bloqueia): conta nova comprando ou vendendo muito,
 * muitos pedidos cancelados e alertas de preço em série.
 */
create or replace function public.equipe_antifraude()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.eh_equipe(array['suporte', 'financeiro']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(s order by s.criado desc)
      from (
        select 'oficina' as tipo, o.id::text as id, o.nome, o.criado_em as criado, 'compras_conta_nova' as sinal,
               'Conta com menos de 30 dias comprando mais de R$ 2.000 em 7 dias' as motivo, round(sum(pf.subtotal), 2) as valor
          from public.oficinas o
          join public.pedidos_fornecedores pf on pf.oficina_id = o.id and pf.criado_em > now() - interval '7 days' and pf.status <> 'cancelado'
         where o.criado_em > now() - interval '30 days'
         group by o.id, o.nome, o.criado_em
        having sum(pf.subtotal) > 2000
        union all
        select 'loja', f.id::text, f.nome, f.criado_em, 'vendas_loja_nova',
               'Loja com menos de 30 dias vendendo mais de R$ 2.000 em 7 dias', round(sum(pf.subtotal), 2)
          from public.fornecedores f
          join public.pedidos_fornecedores pf on pf.fornecedor_id = f.id and pf.criado_em > now() - interval '7 days' and pf.status <> 'cancelado'
         where f.criado_em > now() - interval '30 days' and not f.demonstracao
         group by f.id, f.nome, f.criado_em
        having sum(pf.subtotal) > 2000
        union all
        select 'oficina', o.id::text, o.nome, o.criado_em, 'cancelados',
               'Metade ou mais dos pedidos de 30 dias cancelados (3 ou mais)', count(*) filter (where pf.status = 'cancelado')
          from public.oficinas o
          join public.pedidos_fornecedores pf on pf.oficina_id = o.id and pf.criado_em > now() - interval '30 days'
         group by o.id, o.nome, o.criado_em
        having count(*) filter (where pf.status = 'cancelado') >= 3
           and count(*) filter (where pf.status = 'cancelado') * 2 >= count(*)
        union all
        select 'loja', f.id::text, f.nome, f.criado_em, 'loja_cancelando',
               'A loja cancelou 3 ou mais pedidos em 30 dias', count(*)
          from public.fornecedores f
          join public.pedidos_fornecedores pf on pf.fornecedor_id = f.id and pf.criado_em > now() - interval '30 days'
                                              and pf.status = 'cancelado' and pf.cancelado_por = 'loja'
         group by f.id, f.nome, f.criado_em
        having count(*) >= 3
        union all
        select 'oficina', o.id::text, o.nome, o.criado_em, 'alertas',
               '15 ou mais alertas de preço em 7 dias', count(*)
          from public.oficinas o
          join public.alertas_preco a on a.oficina_id = o.id and a.criado_em > now() - interval '7 days'
         group by o.id, o.nome, o.criado_em
        having count(*) >= 15
      ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.equipe_metricas_assinatura(numeric, numeric), public.equipe_coortes_gmv(integer), public.equipe_painel_marketplace(integer),
  public.equipe_funil_uso(integer), public.equipe_antifraude() from public, anon;
grant execute on function public.equipe_metricas_assinatura(numeric, numeric), public.equipe_coortes_gmv(integer), public.equipe_painel_marketplace(integer),
  public.equipe_funil_uso(integer), public.equipe_antifraude() to authenticated;

-- ------------------------------------------------------------------ suporte

create table public.suporte_chamados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text check (char_length(email) <= 160),
  oficina_id uuid references public.oficinas (id) on delete set null,
  fornecedor_id bigint references public.fornecedores (id) on delete set null,
  assunto text not null check (char_length(assunto) between 2 and 120),
  situacao text not null default 'novo' check (situacao in ('novo', 'respondido', 'fechado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  respondido_em timestamptz
);

comment on table public.suporte_chamados is 'Pedidos de ajuda das oficinas e lojas. Quem abriu vê o seu; a equipe (suporte) vê e responde todos.';

create table public.suporte_mensagens (
  id bigint generated always as identity primary key,
  chamado_id uuid not null references public.suporte_chamados (id) on delete cascade,
  autor text not null check (autor in ('cliente', 'equipe')),
  user_id uuid references auth.users (id) on delete set null,
  email text check (char_length(email) <= 160),
  texto text not null check (char_length(texto) between 1 and 4000),
  criado_em timestamptz not null default now()
);

create index suporte_chamados_user_idx on public.suporte_chamados (user_id, atualizado_em desc);
create index suporte_chamados_situacao_idx on public.suporte_chamados (situacao, atualizado_em desc);
create index suporte_mensagens_chamado_idx on public.suporte_mensagens (chamado_id, id);

alter table public.suporte_chamados enable row level security;
alter table public.suporte_mensagens enable row level security;
revoke all on public.suporte_chamados, public.suporte_mensagens from anon, authenticated;
grant select on public.suporte_chamados, public.suporte_mensagens to authenticated;

create policy "Quem abriu e a equipe veem o chamado" on public.suporte_chamados for select to authenticated
  using (user_id = auth.uid() or (select privado.eh_equipe(array['suporte'])));
create policy "Quem vê o chamado vê as mensagens" on public.suporte_mensagens for select to authenticated
  using (exists (select 1 from public.suporte_chamados c where c.id = chamado_id));

/**
 * Abre um pedido de ajuda (até 10 por dia por pessoa). A oficina ou a loja, quando vierem,
 * têm de ser da pessoa.
 */
create or replace function public.suporte_abrir(p_assunto text, p_texto text, p_oficina uuid default null, p_fornecedor bigint default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if p_oficina is not null and privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if p_fornecedor is not null and privado.papel_no_fornecedor(p_fornecedor) is null then
    raise exception 'Você não é desta loja' using errcode = '42501';
  end if;
  if (select count(*) from public.suporte_chamados c where c.user_id = v_uid and c.criado_em > now() - interval '1 day') >= 10 then
    raise exception 'Muitos pedidos de ajuda seguidos' using errcode = 'P0001';
  end if;
  insert into public.suporte_chamados (user_id, email, oficina_id, fornecedor_id, assunto)
  values (v_uid, nullif(v_email, ''), p_oficina, p_fornecedor, left(trim(p_assunto), 120))
  returning id into v_id;
  insert into public.suporte_mensagens (chamado_id, autor, user_id, email, texto)
  values (v_id, 'cliente', v_uid, nullif(v_email, ''), left(trim(p_texto), 4000));
  return v_id;
end;
$$;

/** Uma mensagem no chamado: de quem abriu (volta para "novo") ou da equipe (fica "respondido"). */
create or replace function public.suporte_responder(p_chamado uuid, p_texto text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.suporte_chamados%rowtype;
  v_uid uuid := auth.uid();
  v_equipe boolean := privado.eh_equipe(array['suporte']);
begin
  select * into c from public.suporte_chamados where id = p_chamado for update;
  if not found or not (c.user_id = v_uid or v_equipe) then
    raise exception 'Chamado não encontrado' using errcode = '42501';
  end if;
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'Escreva a mensagem' using errcode = '22023';
  end if;
  if (select count(*) from public.suporte_mensagens m where m.chamado_id = p_chamado and m.criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'Muitas mensagens seguidas' using errcode = 'P0001';
  end if;
  insert into public.suporte_mensagens (chamado_id, autor, user_id, email, texto)
  values (p_chamado, case when v_equipe and c.user_id is distinct from v_uid then 'equipe' else 'cliente' end, v_uid,
          nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''), left(trim(p_texto), 4000));
  if v_equipe and c.user_id is distinct from v_uid then
    update public.suporte_chamados set situacao = 'respondido', respondido_em = now(), atualizado_em = now() where id = p_chamado;
  else
    update public.suporte_chamados set situacao = 'novo', atualizado_em = now() where id = p_chamado;
  end if;
  return true;
end;
$$;

/** Fecha o chamado (quem abriu ou a equipe) ou abre de novo (a equipe). */
create or replace function public.suporte_situacao(p_chamado uuid, p_situacao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.suporte_chamados%rowtype;
  v_equipe boolean := privado.eh_equipe(array['suporte']);
begin
  select * into c from public.suporte_chamados where id = p_chamado for update;
  if not found or not (c.user_id = auth.uid() or v_equipe) then
    raise exception 'Chamado não encontrado' using errcode = '42501';
  end if;
  if p_situacao not in ('novo', 'respondido', 'fechado') or (not v_equipe and p_situacao <> 'fechado') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  update public.suporte_chamados set situacao = p_situacao, atualizado_em = now() where id = p_chamado;
  return true;
end;
$$;

revoke all on function public.suporte_abrir(text, text, uuid, bigint), public.suporte_responder(uuid, text), public.suporte_situacao(uuid, text) from public, anon;
grant execute on function public.suporte_abrir(text, text, uuid, bigint), public.suporte_responder(uuid, text), public.suporte_situacao(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.suporte_mensagens;
  end if;
end $$;
