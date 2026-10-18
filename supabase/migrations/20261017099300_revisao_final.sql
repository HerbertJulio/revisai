-- O que a segunda revisão de segurança pediu antes de as lojas e as oficinas entrarem de verdade:
--   1. só o dono ou o gerente compra faturado ou usa o cashback da oficina, e o pedido de quem não é
--      da gestão vai sempre para o endereço da oficina (o mecânico não manda peça para casa dele);
--   2. denúncia de conta nova não tira produto da vitrine: só contam oficinas com mais de 30 dias e
--      uma compra entregue, de donos diferentes, e não de novo logo depois de a equipe mostrar o produto;
--   3. as fotos dos links têm teto por oficina (em arquivos e em espaço, maior no Pro) e por conta no dia;
--   4. a loja que deu crédito a uma oficina pode apagar a conta do dono (a LGPD pede que dê).

-- ------------------------------------------------------------------ 1. quem compra com o dinheiro da oficina

-- quem mandou é a oficina da conta: nome e contato vêm do cadastro dela, não do formulário; quem não é
-- dono nem gerente compra só no Pix, sem o cashback, e a entrega vai para o endereço da oficina
create or replace function privado.preencher_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.oficinas%rowtype;
  v_gestao boolean;
begin
  if new.oficina_id is null then
    raise exception 'Entre na sua conta para fazer pedidos' using errcode = '28000';
  end if;
  select * into o from public.oficinas where id = new.oficina_id and ativa;
  if not found then
    raise exception 'Oficina inválida' using errcode = '42501';
  end if;
  v_gestao := coalesce(privado.papel_na_oficina(new.oficina_id), '') in ('dono', 'gerente');
  if not v_gestao then
    if exists (
      select 1 from jsonb_each_text(case when jsonb_typeof(new.pagamentos) = 'object' then new.pagamentos else '{}'::jsonb end) e
       where e.value = 'faturado'
    ) then
      raise exception 'Só o dono ou o gerente da oficina compra faturado' using errcode = '42501';
    end if;
    if exists (
      select 1 from jsonb_each_text(case when jsonb_typeof(new.cashback) = 'object' then new.cashback else '{}'::jsonb end) e
       where e.value ~ '^[0-9]+(\.[0-9]+)?$' and e.value::numeric > 0
    ) then
      raise exception 'Só o dono ou o gerente da oficina usa o cashback' using errcode = '42501';
    end if;
  end if;
  new.oficina_nome := o.nome;
  new.oficina_whatsapp := coalesce(o.whatsapp, new.oficina_whatsapp);
  if v_gestao then
    new.oficina_cidade := coalesce(nullif(new.oficina_cidade, ''), o.cidade);
    new.oficina_uf := coalesce(nullif(new.oficina_uf, ''), o.uf);
    new.oficina_endereco := coalesce(nullif(new.oficina_endereco, ''), o.endereco);
  else
    new.oficina_cidade := o.cidade;
    new.oficina_uf := o.uf;
    new.oficina_endereco := o.endereco;
  end if;
  new.criado_por := auth.uid();
  new.aparelho_id := null;
  return new;
end;
$$;

-- ------------------------------------------------------------------ 2. denúncias que tiram da vitrine

create or replace function public.denunciar(p_oficina uuid, p_produto bigint, p_fornecedor bigint, p_motivo text, p_texto text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_loja bigint;
  v_id uuid;
  v_quantas integer;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  if p_oficina is null or privado.papel_na_oficina(p_oficina) is null then
    raise exception 'Você não é desta oficina' using errcode = '42501';
  end if;
  if not exists (select 1 from public.oficinas o where o.id = p_oficina and o.ativa) then
    raise exception 'Esta oficina está desativada' using errcode = '42501';
  end if;
  if coalesce(p_motivo, '') not in ('falsificado', 'preco_enganoso', 'nao_entregou', 'conteudo_improprio', 'outro') then
    raise exception 'Escolha o motivo da denúncia' using errcode = '22023';
  end if;
  if p_produto is not null then
    select p.fornecedor_id into v_loja from public.produtos p where p.id = p_produto;
    if v_loja is null or (p_fornecedor is not null and p_fornecedor <> v_loja) then
      raise exception 'Produto não encontrado' using errcode = '22023';
    end if;
  else
    v_loja := p_fornecedor;
    if v_loja is null or not exists (select 1 from public.fornecedores f where f.id = v_loja) then
      raise exception 'Loja não encontrada' using errcode = '22023';
    end if;
    if not exists (select 1 from public.pedidos_fornecedores pf where pf.fornecedor_id = v_loja and pf.oficina_id = p_oficina) then
      raise exception 'Só dá para denunciar a loja depois de comprar dela. Para um produto, denuncie o produto' using errcode = 'RV065';
    end if;
  end if;
  if (select count(*) from public.denuncias d where d.oficina_id = p_oficina and d.criado_em > now() - interval '1 day') >= 10 then
    raise exception 'Muitas denúncias seguidas. Tente amanhã ou fale com a equipe do Revisaí' using errcode = 'P0001';
  end if;
  begin
    insert into public.denuncias (oficina_id, fornecedor_id, produto_id, motivo, texto, criado_por)
    values (p_oficina, v_loja, p_produto, p_motivo, nullif(left(trim(coalesce(p_texto, '')), 1000), ''), v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta oficina já denunciou %. A equipe do Revisaí está olhando', case when p_produto is null then 'esta loja' else 'este produto' end
      using errcode = 'RV064';
  end;
  if p_produto is not null then
    -- só contam denúncias de oficinas com mais de 30 dias e uma compra entregue, de pessoas e de
    -- donos diferentes, e não as de quem teve denúncia deste produto descartada pela equipe nos
    -- últimos 30 dias: contas novas não tiram um produto da vitrine, nem de novo depois da equipe
    select least(count(distinct d.oficina_id), count(distinct d.criado_por), count(distinct o.criado_por)) into v_quantas
      from public.denuncias d
      join public.oficinas o on o.id = d.oficina_id
     where d.produto_id = p_produto and d.situacao in ('nova', 'em_analise')
       and o.criado_em < now() - interval '30 days'
       and exists (select 1 from public.pedidos_fornecedores pf where pf.oficina_id = d.oficina_id and pf.status = 'entregue')
       and not exists (
         select 1 from public.denuncias d2
          where d2.produto_id = p_produto and d2.oficina_id = d.oficina_id and d2.situacao = 'descartada'
            and d2.resolvido_em > now() - interval '30 days'
       );
    if v_quantas >= 3 then
      update public.produtos set oculto_moderacao = true where id = p_produto and not oculto_moderacao;
    end if;
  end if;
  return v_id;
end;
$$;


-- ------------------------------------------------------------------ 3. teto das fotos dos links

-- por oficina: mil arquivos e 200 MB no grátis, 10 mil e 2 GB no Pro (ou no teste); por conta, 300
-- arquivos por dia. O tamanho de cada foto já é limitado pelo bucket (1 MB).
create or replace function privado.cabe_mais_arquivo(p_pasta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with uso as (
    select count(*) as n, coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0) as bytes
      from storage.objects o
     where o.bucket_id = 'links' and o.name like p_pasta || '/%'
  ), plano as (
    select exists (
      select 1 from public.oficinas f
       where f.id::text = p_pasta
         and (f.pro_ate >= (now() at time zone 'America/Sao_Paulo')::date or f.teste_ate >= (now() at time zone 'America/Sao_Paulo')::date)
    ) as pro
  ), dia as (
    select count(*) as n
      from storage.objects o
     where o.bucket_id = 'links'
       and coalesce(o.owner_id, o.owner::text) = auth.uid()::text
       and o.created_at > now() - interval '1 day'
  )
  select case when plano.pro then uso.n < 10000 and uso.bytes < 2147483648 else uso.n < 1000 and uso.bytes < 209715200 end
         and dia.n < 300
    from uso, plano, dia;
$$;
revoke all on function privado.cabe_mais_arquivo(text) from public, anon;
grant execute on function privado.cabe_mais_arquivo(text) to authenticated;

-- ------------------------------------------------------------------ 4. apagar a conta de quem deu crédito

-- o crédito não muda de loja nem de oficina; quem criou e quando ficam como estão (menos quando a conta
-- de quem criou é apagada: aí a chave estrangeira só desliga a pessoa)
create or replace function privado.loja2_regras_do_credito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and privado.so_desligou(to_jsonb(old), to_jsonb(new), array['criado_por']) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_em := now();
  elsif new.fornecedor_id is distinct from old.fornecedor_id or new.oficina_id is distinct from old.oficina_id
        or new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em then
    raise exception 'O crédito não muda de loja nem de oficina' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
