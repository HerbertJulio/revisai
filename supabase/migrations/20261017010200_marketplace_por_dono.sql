-- Loja, pedidos, alertas e agente do WhatsApp passam a valer por conta: a oficina pelo
-- oficina_id, a loja pelos membros dela, a equipe pelo papel com segundo fator, e o servidor
-- (webhook, rotina diária) pela chave do sistema. Tudo que antes era liberado pela chave única
-- da equipe sai. As tabelas estão vazias ou só com dados de demonstração, então dá para
-- mudar colunas sem migrar dados.

-- ------------------------------------------------------------------ fora: o acesso antigo

drop policy if exists "Catálogo: fornecedores ativos" on public.fornecedores;
drop policy if exists "Equipe cadastra fornecedores" on public.fornecedores;
drop policy if exists "Equipe edita fornecedores" on public.fornecedores;
drop policy if exists "Equipe cria acessos" on public.fornecedores_acesso;
drop policy if exists "Equipe troca acessos" on public.fornecedores_acesso;
drop policy if exists "Equipe vê os acessos" on public.fornecedores_acesso;
drop policy if exists "Equipe cria contratos" on public.fornecedores_contrato;
drop policy if exists "Equipe muda contratos" on public.fornecedores_contrato;
drop policy if exists "Equipe vê os contratos" on public.fornecedores_contrato;
drop policy if exists "Equipe vê as chaves Pix" on public.fornecedores_pix;
drop policy if exists "Servidor grava a chave Pix" on public.fornecedores_pix;
drop policy if exists "Servidor troca a chave Pix" on public.fornecedores_pix;
drop policy if exists "Equipe vê o histórico do Pix" on public.fornecedores_pix_historico;
drop policy if exists "Catálogo: produtos ativos" on public.produtos;
drop policy if exists "Equipe cadastra produtos" on public.produtos;
drop policy if exists "Equipe edita produtos" on public.produtos;
drop policy if exists "Catálogo: promoções em vigor" on public.promocoes;
drop policy if exists "Equipe cadastra promoções" on public.promocoes;
drop policy if exists "Equipe edita promoções" on public.promocoes;
drop policy if exists "Equipe e servidor registram impulsos" on public.impulsos;
drop policy if exists "Equipe muda impulsos" on public.impulsos;
drop policy if exists "Loja: impulsos em vigor" on public.impulsos;
drop policy if exists "Equipe muda a situação dos pedidos" on public.pedidos;
drop policy if exists "Equipe vê os pedidos" on public.pedidos;
drop policy if exists "Oficinas enviam pedidos" on public.pedidos;
drop policy if exists "Equipe muda a situação das partes" on public.pedidos_fornecedores;
drop policy if exists "Equipe vê as partes dos pedidos" on public.pedidos_fornecedores;
drop policy if exists "Equipe muda a situação dos cadastros" on public.interessados;
drop policy if exists "Equipe vê os cadastros" on public.interessados;
drop policy if exists "Interessados se cadastram com consentimento" on public.interessados;
drop policy if exists "Base: referências aprovadas" on public.produtos_referencia;
drop policy if exists "Equipe edita a base" on public.produtos_referencia;
drop policy if exists "Equipe inclui na base" on public.produtos_referencia;
drop policy if exists "Equipe libera créditos" on public.alertas_creditos;
drop policy if exists "Equipe vê os créditos" on public.alertas_creditos;
drop policy if exists "Servidor cria alertas" on public.alertas_preco;
drop policy if exists "Servidor lê os alertas" on public.alertas_preco;
drop policy if exists "Servidor muda alertas" on public.alertas_preco;
drop policy if exists "Servidor grava respostas" on public.alertas_respostas;
drop policy if exists "Servidor lê as respostas" on public.alertas_respostas;
drop policy if exists "Servidor muda respostas" on public.alertas_respostas;
drop policy if exists "Equipe cria assinaturas" on public.assinaturas;
drop policy if exists "Equipe vê as assinaturas" on public.assinaturas;
drop policy if exists "Servidor conta as ativações" on public.assinaturas;
drop policy if exists "Equipe vê a demanda" on public.demandas;
drop policy if exists "Servidor atualiza a demanda" on public.demandas;
drop policy if exists "Servidor grava a demanda" on public.demandas;
drop policy if exists "Servidor apaga códigos" on public.whatsapp_codigos;
drop policy if exists "Servidor cria códigos" on public.whatsapp_codigos;
drop policy if exists "Servidor lê os códigos" on public.whatsapp_codigos;
drop policy if exists "Servidor apaga vínculos" on public.whatsapp_vinculos;
drop policy if exists "Servidor cria vínculos" on public.whatsapp_vinculos;
drop policy if exists "Servidor lê os vínculos" on public.whatsapp_vinculos;
drop policy if exists "Servidor troca vínculos" on public.whatsapp_vinculos;
drop policy if exists "Servidor cria rascunhos" on public.ordens_rascunho;
drop policy if exists "Servidor lê os rascunhos" on public.ordens_rascunho;
drop policy if exists "Servidor muda rascunhos" on public.ordens_rascunho;
drop policy if exists "Servidor apaga mídia das oficinas" on storage.objects;
drop policy if exists "Servidor guarda a voz" on storage.objects;
drop policy if exists "Servidor guarda mídia das oficinas" on storage.objects;
drop policy if exists "Servidor lê mídia das oficinas" on storage.objects;
drop policy if exists "equipe apaga fotos de produto" on storage.objects;
drop policy if exists "equipe envia fotos de produto" on storage.objects;
drop policy if exists "equipe troca fotos de produto" on storage.objects;
drop policy if exists "equipe vê os arquivos de produto" on storage.objects;

drop function if exists public.equipe_pedidos(text);
drop function if exists public.equipe_mudar_situacao(text, bigint, text);

-- o link fixo da loja deu lugar à conta com e-mail
drop table if exists public.fornecedores_acesso;

-- ------------------------------------------------------------------ lojas

create policy "Catálogo: lojas ativas" on public.fornecedores for select to anon, authenticated
  using (ativo or id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()) or (select privado.sistema_autorizado()));
create policy "Equipe cadastra lojas" on public.fornecedores for insert to authenticated
  with check ((select privado.eh_equipe(array['suporte'])));
create policy "Loja e equipe mudam a loja" on public.fornecedores for update to authenticated
  using (id in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte', 'financeiro'])))
  with check (id in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte', 'financeiro'])));
create policy "Sistema muda lojas" on public.fornecedores for update to anon
  using ((select privado.sistema_autorizado())) with check ((select privado.sistema_autorizado()));

create policy "Loja vê o contrato" on public.fornecedores_contrato for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));
create policy "Equipe cria contratos" on public.fornecedores_contrato for insert to authenticated
  with check ((select privado.eh_equipe(array['financeiro', 'suporte'])));
create policy "Equipe muda contratos" on public.fornecedores_contrato for update to authenticated
  using ((select privado.eh_equipe(array['financeiro']))) with check ((select privado.eh_equipe(array['financeiro'])));
create policy "Sistema lê contratos" on public.fornecedores_contrato for select to anon
  using ((select privado.sistema_autorizado()));

-- ------------------------------------------------------------------ catálogo

create policy "Catálogo: produtos ativos" on public.produtos for select to anon, authenticated
  using (
    (ativo and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo))
    or fornecedor_id in (select privado.meus_fornecedores())
    or (select privado.eh_equipe())
    or (select privado.sistema_autorizado())
  );
create policy "Loja cadastra produtos" on public.produtos for insert to authenticated
  with check (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte'])));
create policy "Loja muda produtos" on public.produtos for update to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte'])))
  with check (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte'])));

create or replace function privado.fornecedor_do_produto(p_produto bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.fornecedor_id from public.produtos p where p.id = p_produto;
$$;
revoke all on function privado.fornecedor_do_produto(bigint) from public, anon, authenticated;
grant execute on function privado.fornecedor_do_produto(bigint) to anon, authenticated;

create policy "Catálogo: promoções em vigor" on public.promocoes for select to anon, authenticated
  using (
    (ativo and fim >= (now() at time zone 'America/Sao_Paulo')::date)
    or privado.fornecedor_do_produto(produto_id) in (select privado.meus_fornecedores())
    or (select privado.eh_equipe())
  );
create policy "Loja cadastra promoções" on public.promocoes for insert to authenticated
  with check (privado.fornecedor_do_produto(produto_id) in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte'])));
create policy "Loja muda promoções" on public.promocoes for update to authenticated
  using (privado.fornecedor_do_produto(produto_id) in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte'])))
  with check (privado.fornecedor_do_produto(produto_id) in (select privado.meus_fornecedores()) or (select privado.eh_equipe(array['suporte'])));

create policy "Impulsos em vigor e os da loja" on public.impulsos for select to anon, authenticated
  using (
    (status = 'ativo' and fim >= (now() at time zone 'America/Sao_Paulo')::date)
    or fornecedor_id in (select privado.meus_fornecedores())
    or (select privado.eh_equipe())
  );
create policy "Loja pede impulso" on public.impulsos for insert to authenticated
  with check (
    (fornecedor_id in (select privado.meus_fornecedores()) and status = 'pedido' and inicio is null and fim is null
      and privado.fornecedor_do_produto(produto_id) = fornecedor_id)
    or (select privado.eh_equipe(array['suporte', 'financeiro']))
  );
create policy "Equipe decide impulsos" on public.impulsos for update to authenticated
  using ((select privado.eh_equipe(array['suporte', 'financeiro']))) with check ((select privado.eh_equipe(array['suporte', 'financeiro'])));

-- a loja não troca o dono do produto
create or replace function privado.proteger_produto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if privado.veio_da_api() and new.fornecedor_id is distinct from old.fornecedor_id and not privado.eh_equipe(array['suporte']) then
    raise exception 'O produto não muda de loja' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger produtos_proteger before update on public.produtos for each row execute function privado.proteger_produto();

create or replace function privado.proteger_promocao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if privado.veio_da_api() and new.produto_id is distinct from old.produto_id and not privado.eh_equipe(array['suporte']) then
    raise exception 'A promoção não muda de produto' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger promocoes_proteger before update on public.promocoes for each row execute function privado.proteger_promocao();

-- ------------------------------------------------------------------ base de prazos

create policy "Base: referências aprovadas" on public.produtos_referencia for select to anon, authenticated
  using ((aprovado and ativo) or (select privado.eh_equipe()) or fornecedor_id in (select privado.meus_fornecedores()));
create policy "Contas sugerem para a base" on public.produtos_referencia for insert to authenticated
  with check (
    (aprovado = false and origem in ('oficina', 'fornecedor') and confianca in ('oficina', 'fornecedor')
      and (fornecedor_id is null or fornecedor_id in (select privado.meus_fornecedores()))
      and (exists (select 1 from privado.minhas_oficinas()) or exists (select 1 from privado.meus_fornecedores())))
    or (select privado.eh_equipe(array['suporte']))
  );
create policy "Equipe edita a base" on public.produtos_referencia for update to authenticated
  using ((select privado.eh_equipe(array['suporte']))) with check ((select privado.eh_equipe(array['suporte'])));

-- ------------------------------------------------------------------ cadastros do site

create policy "Interessados se cadastram com consentimento" on public.interessados for insert to anon, authenticated
  with check (consentimento and situacao = 'novo');
create policy "Equipe vê os cadastros" on public.interessados for select to authenticated
  using ((select privado.eh_equipe(array['suporte', 'financeiro'])));
create policy "Equipe muda a situação dos cadastros" on public.interessados for update to authenticated
  using ((select privado.eh_equipe(array['suporte', 'financeiro']))) with check ((select privado.eh_equipe(array['suporte', 'financeiro'])));

-- ------------------------------------------------------------------ pedidos

alter table public.pedidos
  add column if not exists oficina_id uuid references public.oficinas (id) on delete set null,
  add column if not exists criado_por uuid references auth.users (id) on delete set null;
create index if not exists pedidos_oficina_idx on public.pedidos (oficina_id, criado_em desc);

alter table public.pedidos_fornecedores
  add column if not exists oficina_id uuid references public.oficinas (id) on delete set null,
  add column if not exists codigo text,
  add column if not exists oficina_nome text,
  add column if not exists oficina_whatsapp text,
  add column if not exists oficina_endereco text,
  add column if not exists oficina_cidade text,
  add column if not exists oficina_uf text,
  add column if not exists observacao text,
  add column if not exists itens jsonb not null default '[]'::jsonb,
  add column if not exists cancelado_motivo text check (char_length(cancelado_motivo) <= 200),
  add column if not exists cancelado_por text check (cancelado_por in ('loja', 'oficina', 'equipe'));
create index if not exists pedidos_fornecedores_oficina_idx on public.pedidos_fornecedores (oficina_id, criado_em desc);

-- as partes dos pedidos que já existiam ganham o código, o contato da oficina e os próprios itens
-- (antes ficavam só no pedido), antes de as regras das partes passarem a valer
update public.pedidos_fornecedores pf
   set codigo = p.codigo, oficina_nome = p.oficina_nome, oficina_whatsapp = p.oficina_whatsapp,
       oficina_endereco = p.oficina_endereco, oficina_cidade = p.oficina_cidade, oficina_uf = p.oficina_uf,
       observacao = p.observacao,
       itens = coalesce((select jsonb_agg(i) from jsonb_array_elements(p.itens) i
                          where jsonb_typeof(i -> 'fornecedor_id') = 'number' and (i ->> 'fornecedor_id')::bigint = pf.fornecedor_id), '[]'::jsonb)
  from public.pedidos p
 where p.id = pf.pedido_id and pf.codigo is null;

-- quem mandou é a oficina da conta: nome e contato vêm do cadastro dela, não do formulário
create or replace function privado.preencher_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.oficinas%rowtype;
begin
  if new.oficina_id is null then
    raise exception 'Entre na sua conta para fazer pedidos' using errcode = '28000';
  end if;
  select * into o from public.oficinas where id = new.oficina_id and ativa;
  if not found then
    raise exception 'Oficina inválida' using errcode = '42501';
  end if;
  new.oficina_nome := o.nome;
  new.oficina_whatsapp := coalesce(o.whatsapp, new.oficina_whatsapp);
  new.oficina_cidade := coalesce(nullif(new.oficina_cidade, ''), o.cidade);
  new.oficina_uf := coalesce(nullif(new.oficina_uf, ''), o.uf);
  new.oficina_endereco := coalesce(nullif(new.oficina_endereco, ''), o.endereco);
  new.criado_por := auth.uid();
  new.aparelho_id := null;
  return new;
end;
$$;

create trigger pedidos_preencher before insert on public.pedidos
  for each row execute function privado.preencher_pedido();

create policy "Oficina manda pedidos" on public.pedidos for insert to authenticated
  with check (oficina_id in (select privado.minhas_oficinas()) and status = 'novo');
create policy "Oficina vê os próprios pedidos" on public.pedidos for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
create policy "Equipe muda a situação dos pedidos" on public.pedidos for update to authenticated
  using ((select privado.eh_equipe(array['suporte']))) with check ((select privado.eh_equipe(array['suporte'])));

-- limites por oficina (antes era por WhatsApp)
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
     where oficina_id = new.oficina_id and criado_em > now() - interval '1 hour';
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

-- cada loja recebe a parte dela, com o contato da oficina e só os próprios itens
create or replace function public.dividir_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with partes as (
    select (i ->> 'fornecedor_id')::bigint as fornecedor_id,
           round(sum((i ->> 'preco_unitario')::numeric * (i ->> 'quantidade')::numeric), 2) as subtotal,
           jsonb_agg(i) as itens
      from jsonb_array_elements(new.itens) as i
     where jsonb_typeof(i -> 'fornecedor_id') = 'number'
     group by 1
  )
  insert into public.pedidos_fornecedores (pedido_id, fornecedor_id, subtotal, comissao_percentual, oficina_id, codigo,
    oficina_nome, oficina_whatsapp, oficina_endereco, oficina_cidade, oficina_uf, observacao, itens)
  select new.id, p.fornecedor_id, p.subtotal, coalesce(c.comissao_percentual, 5), new.oficina_id, new.codigo,
         new.oficina_nome, new.oficina_whatsapp, new.oficina_endereco, new.oficina_cidade, new.oficina_uf, new.observacao, p.itens
    from partes p
    left join public.fornecedores_contrato c on c.fornecedor_id = p.fornecedor_id
  on conflict (pedido_id, fornecedor_id) do nothing;
  return new;
end;
$$;

create policy "Loja, oficina e equipe veem as partes" on public.pedidos_fornecedores for select to authenticated
  using (
    fornecedor_id in (select privado.meus_fornecedores())
    or oficina_id in (select privado.minhas_oficinas())
    or (select privado.eh_equipe())
  );
create policy "Loja e oficina mudam a parte" on public.pedidos_fornecedores for update to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe(array['suporte'])))
  with check (fornecedor_id in (select privado.meus_fornecedores()) or oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe(array['suporte'])));

create table public.pedidos_historico (
  id bigint generated always as identity primary key,
  parte_id bigint not null references public.pedidos_fornecedores (id) on delete cascade,
  quando timestamptz not null default now(),
  campo text not null check (campo in ('status', 'pagamento')),
  de text,
  para text,
  quem text not null check (quem in ('loja', 'oficina', 'equipe', 'entregador', 'sistema')),
  user_id uuid,
  motivo text check (char_length(motivo) <= 200)
);
create index pedidos_historico_parte_idx on public.pedidos_historico (parte_id, quando);
alter table public.pedidos_historico enable row level security;
revoke all on public.pedidos_historico from anon, authenticated;
grant select on public.pedidos_historico to authenticated;
create policy "Quem vê a parte vê o histórico" on public.pedidos_historico for select to authenticated
  using (exists (select 1 from public.pedidos_fornecedores pf where pf.id = parte_id));

/**
 * As regras da parte do pedido. A loja anda com a situação para a frente (novo, em contato,
 * confirmado, saiu, entregue) ou cancela com motivo; entregue e cancelado não voltam (só a equipe
 * mexe). A oficina só avisa que pagou, e só depois de a loja confirmar o pedido. Ninguém muda
 * itens, valores ou a oficina do pedido. Cada mudança fica no histórico.
 */
create or replace function privado.regras_da_parte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem text;
  v_ok boolean;
begin
  -- a oficina foi apagada: a parte fica com a loja, sem a oficina
  if privado.so_desligou(to_jsonb(old), to_jsonb(new), array['oficina_id']) then
    return new;
  end if;
  -- o entregador (pelas funções entrega_*) só mexe na posição e no "entregue"
  if coalesce(current_setting('revisai.entregador', true), '') = 'sim' then
    if new.status is distinct from old.status and not (old.status = 'saiu_entrega' and new.status = 'entregue') then
      raise exception 'Sem permissão' using errcode = '42501';
    end if;
    if new.pagamento is distinct from old.pagamento or new.itens is distinct from old.itens or new.subtotal is distinct from old.subtotal
       or new.entrega_hash is distinct from old.entrega_hash then
      raise exception 'Sem permissão' using errcode = '42501';
    end if;
    v_quem := 'entregador';
  elsif privado.sistema_autorizado() or coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated') then
    -- a chave do sistema, ou SQL direto da equipe técnica no banco
    v_quem := 'sistema';
  elsif privado.eh_equipe(array['suporte']) then
    v_quem := 'equipe';
  elsif new.fornecedor_id in (select privado.meus_fornecedores()) then
    v_quem := 'loja';
  elsif new.oficina_id in (select privado.minhas_oficinas()) then
    v_quem := 'oficina';
  else
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  if new.pedido_id is distinct from old.pedido_id or new.fornecedor_id is distinct from old.fornecedor_id
     or new.subtotal is distinct from old.subtotal or new.comissao_percentual is distinct from old.comissao_percentual
     or new.oficina_id is distinct from old.oficina_id or new.itens is distinct from old.itens
     or new.codigo is distinct from old.codigo or new.criado_em is distinct from old.criado_em
     or new.oficina_nome is distinct from old.oficina_nome or new.oficina_whatsapp is distinct from old.oficina_whatsapp
     or new.oficina_endereco is distinct from old.oficina_endereco or new.oficina_cidade is distinct from old.oficina_cidade
     or new.oficina_uf is distinct from old.oficina_uf or new.observacao is distinct from old.observacao then
    if v_quem <> 'equipe' then
      raise exception 'Itens e valores do pedido não mudam' using errcode = '42501';
    end if;
  end if;

  if v_quem = 'oficina' then
    if new.status is distinct from old.status or new.entrega_hash is distinct from old.entrega_hash
       or new.entrega_previsao is distinct from old.entrega_previsao or new.entrega_saiu_em is distinct from old.entrega_saiu_em
       or new.entrega_lat is distinct from old.entrega_lat or new.entrega_lng is distinct from old.entrega_lng
       or new.entregue_em is distinct from old.entregue_em or new.oficina_nome is distinct from old.oficina_nome
       or new.oficina_whatsapp is distinct from old.oficina_whatsapp or new.oficina_endereco is distinct from old.oficina_endereco then
      raise exception 'A oficina só avisa o pagamento' using errcode = '42501';
    end if;
    if new.pagamento is distinct from old.pagamento then
      if not (old.pagamento = 'pendente' and new.pagamento = 'informado' and old.status in ('confirmado', 'saiu_entrega', 'entregue')) then
        raise exception 'Pagamento só depois da confirmação da loja' using errcode = '42501';
      end if;
      new.pagamento_em := now();
    end if;
  elsif v_quem = 'loja' then
    if new.entrega_lat is distinct from old.entrega_lat or new.entrega_lng is distinct from old.entrega_lng
       or new.entrega_precisao is distinct from old.entrega_precisao or new.entrega_posicao_em is distinct from old.entrega_posicao_em
       or new.cancelado_por is distinct from old.cancelado_por then
      raise exception 'A posição é do entregador' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      v_ok := case old.status
        when 'novo' then new.status in ('em_contato', 'confirmado', 'cancelado')
        when 'em_contato' then new.status in ('confirmado', 'cancelado')
        when 'confirmado' then new.status in ('saiu_entrega', 'entregue', 'cancelado')
        when 'saiu_entrega' then new.status in ('entregue', 'cancelado', 'confirmado')
        else false
      end;
      if not v_ok then
        raise exception 'Essa mudança de situação não vale' using errcode = 'RV010';
      end if;
      if new.status = 'cancelado' then
        if coalesce(trim(new.cancelado_motivo), '') = '' then
          raise exception 'Diga o motivo do cancelamento' using errcode = 'RV011';
        end if;
        new.cancelado_por := 'loja';
      end if;
    end if;
    if new.pagamento is distinct from old.pagamento then
      if old.status = 'cancelado' or new.pagamento not in ('pendente', 'confirmado') then
        raise exception 'Esse pagamento não vale' using errcode = 'RV012';
      end if;
      new.pagamento_em := case when new.pagamento = 'confirmado' then now() else null end;
    end if;
  end if;

  if new.status is distinct from old.status then
    new.atualizado_em := now();
    if new.status in ('entregue', 'cancelado') then
      new.entrega_hash := null;
      new.entrega_lat := null;
      new.entrega_lng := null;
      new.entrega_precisao := null;
      new.entrega_posicao_em := null;
    end if;
    if new.status = 'entregue' and new.entregue_em is null then
      new.entregue_em := now();
    end if;
    if new.status = 'cancelado' and v_quem = 'equipe' and new.cancelado_por is null then
      new.cancelado_por := 'equipe';
    end if;
    insert into public.pedidos_historico (parte_id, campo, de, para, quem, user_id, motivo)
    values (new.id, 'status', old.status, new.status, v_quem, auth.uid(), case when new.status = 'cancelado' then new.cancelado_motivo end);
  end if;
  if new.pagamento is distinct from old.pagamento then
    new.atualizado_em := now();
    insert into public.pedidos_historico (parte_id, campo, de, para, quem, user_id)
    values (new.id, 'pagamento', old.pagamento, new.pagamento, v_quem, auth.uid());
  end if;
  return new;
end;
$$;

create trigger pedidos_fornecedores_regras before update on public.pedidos_fornecedores
  for each row execute function privado.regras_da_parte();

-- ------------------------------------------------------------------ entregador (link com código)

/** O que o entregador vê pelo link: só a entrega daquela parte, enquanto o link vale. */
create or replace function public.entrega_ver(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pf public.pedidos_fornecedores%rowtype;
  v_loja text;
begin
  if p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  select * into pf from public.pedidos_fornecedores
   where entrega_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and status = 'saiu_entrega'
     and entrega_saiu_em > now() - interval '3 days';
  if not found then
    return null;
  end if;
  select nome into v_loja from public.fornecedores where id = pf.fornecedor_id;
  return jsonb_build_object(
    'codigo', pf.codigo, 'loja', v_loja, 'oficina', pf.oficina_nome, 'whatsapp', pf.oficina_whatsapp,
    'endereco', pf.oficina_endereco, 'cidade', pf.oficina_cidade, 'uf', pf.oficina_uf,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('nome', i ->> 'nome', 'quantidade', (i ->> 'quantidade')::int)) from jsonb_array_elements(pf.itens) i), '[]'::jsonb),
    'previsao', pf.entrega_previsao, 'posicaoEm', pf.entrega_posicao_em
  );
end;
$$;

create or replace function public.entrega_posicao(p_token text, p_lat double precision, p_lng double precision, p_precisao real)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_token !~ '^[A-Za-z0-9_-]{43}$' or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return false;
  end if;
  perform set_config('revisai.entregador', 'sim', true);
  update public.pedidos_fornecedores
     set entrega_lat = p_lat, entrega_lng = p_lng, entrega_precisao = least(greatest(coalesce(p_precisao, 0), 0), 100000), entrega_posicao_em = now()
   where entrega_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and status = 'saiu_entrega'
     and entrega_saiu_em > now() - interval '3 days'
     and (entrega_posicao_em is null or entrega_posicao_em < now() - interval '3 seconds');
  return found;
end;
$$;

create or replace function public.entrega_concluir(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;
  perform set_config('revisai.entregador', 'sim', true);
  update public.pedidos_fornecedores
     set status = 'entregue'
   where entrega_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and status = 'saiu_entrega'
     and entrega_saiu_em > now() - interval '3 days';
  return found;
end;
$$;

revoke all on function public.entrega_ver(text), public.entrega_posicao(text, double precision, double precision, real), public.entrega_concluir(text) from public;
grant execute on function public.entrega_ver(text), public.entrega_posicao(text, double precision, double precision, real), public.entrega_concluir(text) to anon, authenticated;

-- ------------------------------------------------------------------ pagamento por Pix

create table public.fornecedores_pix_troca (
  fornecedor_id bigint primary key references public.fornecedores (id) on delete cascade,
  tipo text not null check (tipo in ('cnpj', 'cpf', 'email', 'telefone', 'aleatoria')),
  chave text not null check (char_length(chave) between 5 and 77),
  nome text not null check (char_length(nome) between 2 and 25),
  cidade text not null check (char_length(cidade) between 2 and 15),
  pedida_por uuid references auth.users (id) on delete set null,
  pedida_em timestamptz not null default now(),
  vale_em timestamptz not null default now() + interval '24 hours'
);
comment on table public.fornecedores_pix_troca is 'Troca de chave Pix esperando as 24 horas de segurança (a loja pode cancelar até lá).';

alter table public.fornecedores_pix_troca enable row level security;
revoke all on public.fornecedores_pix_troca from anon, authenticated;
grant select on public.fornecedores_pix_troca to authenticated;
create policy "Loja vê a troca pendente" on public.fornecedores_pix_troca for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));

create policy "Loja vê a própria chave Pix" on public.fornecedores_pix for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));
create policy "Loja vê o histórico do Pix" on public.fornecedores_pix_historico for select to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));

/** Quem entrou há pouco (até 15 minutos): a troca da chave Pix pede o código do e-mail de novo. */
create or replace function privado.entrou_ha_pouco()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) a
     where (a ->> 'timestamp')::bigint > extract(epoch from now() - interval '15 minutes')
  );
$$;

/**
 * A loja pede a troca da chave Pix. Só o dono, e só logo depois de confirmar o código do e-mail.
 * A primeira chave vale na hora; a troca vale depois de 24 horas (e a loja pode cancelar).
 */
create or replace function public.loja_trocar_pix(p_fornecedor bigint, p_tipo text, p_chave text, p_nome text, p_cidade text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tem boolean;
begin
  if coalesce(privado.papel_no_fornecedor(p_fornecedor), '') <> 'dono' then
    raise exception 'Só o dono da loja troca a chave Pix' using errcode = '42501';
  end if;
  if not privado.entrou_ha_pouco() then
    raise exception 'Confirme o código do e-mail para trocar a chave' using errcode = 'RV020';
  end if;
  select exists (select 1 from public.fornecedores_pix where fornecedor_id = p_fornecedor) into v_tem;
  if not v_tem then
    insert into public.fornecedores_pix (fornecedor_id, tipo, chave, nome, cidade, atualizado_em)
    values (p_fornecedor, p_tipo, p_chave, p_nome, p_cidade, now());
    return jsonb_build_object('valeEm', now(), 'imediata', true);
  end if;
  insert into public.fornecedores_pix_troca (fornecedor_id, tipo, chave, nome, cidade, pedida_por, pedida_em, vale_em)
  values (p_fornecedor, p_tipo, p_chave, p_nome, p_cidade, auth.uid(), now(), now() + interval '24 hours')
  on conflict (fornecedor_id) do update set tipo = excluded.tipo, chave = excluded.chave, nome = excluded.nome, cidade = excluded.cidade,
    pedida_por = excluded.pedida_por, pedida_em = now(), vale_em = now() + interval '24 hours';
  return jsonb_build_object('valeEm', now() + interval '24 hours', 'imediata', false);
end;
$$;

create or replace function public.loja_cancelar_troca_pix(p_fornecedor bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (p_fornecedor is null or p_fornecedor not in (select privado.meus_fornecedores())) and not privado.eh_equipe(array['suporte']) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  delete from public.fornecedores_pix_troca where fornecedor_id = p_fornecedor;
  return found;
end;
$$;

/** Aplica as trocas que já passaram das 24 horas (chamada ao ler a chave e na rotina diária). */
create or replace function privado.aplicar_trocas_pix(p_fornecedor bigint default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.fornecedores_pix_troca%rowtype;
  v_n integer := 0;
begin
  for t in select * from public.fornecedores_pix_troca where vale_em <= now() and (p_fornecedor is null or fornecedor_id = p_fornecedor) for update skip locked
  loop
    insert into public.fornecedores_pix (fornecedor_id, tipo, chave, nome, cidade, atualizado_em)
    values (t.fornecedor_id, t.tipo, t.chave, t.nome, t.cidade, now())
    on conflict (fornecedor_id) do update set tipo = excluded.tipo, chave = excluded.chave, nome = excluded.nome, cidade = excluded.cidade, atualizado_em = now();
    delete from public.fornecedores_pix_troca where fornecedor_id = t.fornecedor_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/**
 * O Pix para a oficina pagar a parte de uma loja: só a oficina do pedido, só depois de a loja
 * confirmar, e só com a chave que já vale (a troca recente ainda não).
 */
create or replace function public.pix_da_parte(p_parte bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pf public.pedidos_fornecedores%rowtype;
  px public.fornecedores_pix%rowtype;
begin
  select * into pf from public.pedidos_fornecedores where id = p_parte;
  if not found or pf.oficina_id is null or pf.oficina_id not in (select privado.minhas_oficinas()) then
    raise exception 'Pedido não encontrado' using errcode = '42501';
  end if;
  if pf.status not in ('confirmado', 'saiu_entrega', 'entregue') then
    raise exception 'O Pix aparece quando a loja confirmar o pedido' using errcode = 'RV021';
  end if;
  perform privado.aplicar_trocas_pix(pf.fornecedor_id);
  select * into px from public.fornecedores_pix where fornecedor_id = pf.fornecedor_id;
  if not found then
    raise exception 'A loja ainda não cadastrou a chave Pix' using errcode = 'RV022';
  end if;
  return jsonb_build_object('tipo', px.tipo, 'chave', px.chave, 'nome', px.nome, 'cidade', px.cidade, 'valor', pf.subtotal, 'codigo', pf.codigo,
    'trocadaEm', px.atualizado_em);
end;
$$;

revoke all on function public.loja_trocar_pix(bigint, text, text, text, text), public.loja_cancelar_troca_pix(bigint), public.pix_da_parte(bigint) from public, anon;
grant execute on function public.loja_trocar_pix(bigint, text, text, text, text), public.loja_cancelar_troca_pix(bigint), public.pix_da_parte(bigint) to authenticated;
revoke all on function privado.aplicar_trocas_pix(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------------ alertas de preço

alter table public.alertas_preco
  add column if not exists oficina_id uuid references public.oficinas (id) on delete cascade;
alter table public.alertas_preco drop column if exists oficina_nome;
alter table public.alertas_preco drop column if exists oficina_whatsapp;
alter table public.alertas_preco alter column aparelho_id drop not null;
create index if not exists alertas_preco_oficina_idx on public.alertas_preco (oficina_id, criado_em desc);

alter table public.alertas_respostas
  add column if not exists oficina_id uuid references public.oficinas (id) on delete cascade;
create index if not exists alertas_respostas_oficina_idx on public.alertas_respostas (oficina_id, criado_em desc);

alter table public.alertas_creditos
  add column if not exists oficina_id uuid references public.oficinas (id) on delete cascade;
alter table public.alertas_creditos alter column codigo_pro drop not null;
create index if not exists alertas_creditos_oficina_idx on public.alertas_creditos (oficina_id);

/** Uma loja ativa vende a categoria no estado do alerta (é quem recebe e pode responder). */
create or replace function privado.loja_recebe_alerta(p_uf text, p_categoria text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.fornecedor_membros m
      join public.fornecedores f on f.id = m.fornecedor_id and f.ativo and f.uf = p_uf
      join public.produtos p on p.fornecedor_id = f.id and p.ativo and p.categoria = p_categoria
     where m.user_id = auth.uid()
  );
$$;
revoke all on function privado.loja_recebe_alerta(text, text) from public, anon, authenticated;
grant execute on function privado.loja_recebe_alerta(text, text) to authenticated;

create policy "Oficina vê os próprios alertas" on public.alertas_preco for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
create policy "Loja vê os alertas da região" on public.alertas_preco for select to authenticated
  using (
    (status = 'aberto' and expira_em > now() and privado.loja_recebe_alerta(oficina_uf, categoria))
    or exists (select 1 from public.alertas_respostas r where r.alerta_id = id and r.fornecedor_id in (select privado.meus_fornecedores()))
  );
create policy "Oficina manda alertas" on public.alertas_preco for insert to authenticated
  with check (oficina_id in (select privado.minhas_oficinas()) and status = 'aberto');
create policy "Oficina cancela os próprios alertas" on public.alertas_preco for update to authenticated
  using (oficina_id in (select privado.minhas_oficinas()))
  with check (oficina_id in (select privado.minhas_oficinas()));
create policy "Sistema lê os alertas" on public.alertas_preco for select to anon
  using ((select privado.sistema_autorizado()));

/**
 * A trava dos alertas, no banco: Pro tem 10 por mês mais os pacotes comprados; sem Pro, 3 a cada
 * 30 dias. Cancelado ou vencido sem proposta não conta. O banco decide se o alerta sai de pacote.
 * Também barra alerta repetido para o mesmo produto, mais de 5 abertos e envios em série.
 */
create or replace function public.limitar_alertas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.oficinas%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio_mes timestamptz := (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_dia integer;
  v_geral integer;
  v_abertos integer;
  v_usados integer;
  v_creditos integer;
  v_gastos integer;
begin
  select * into o from public.oficinas where id = new.oficina_id;
  if not found then
    raise exception 'Entre na sua conta para mandar alertas' using errcode = '28000';
  end if;
  new.aparelho_id := null;
  new.codigo_pro := null;
  new.status := 'aberto';
  new.criado_em := now();
  new.atualizado_em := now();
  new.resposta_escolhida := null;
  if new.expira_em > now() + interval '49 hours' or new.expira_em < now() + interval '1 hour' then
    new.expira_em := now() + interval '48 hours';
  end if;

  select count(*) into v_dia from public.alertas_preco where oficina_id = new.oficina_id and criado_em > now() - interval '1 day';
  select count(*) into v_geral from public.alertas_preco where criado_em > now() - interval '1 minute';
  if v_dia >= 20 or v_geral >= 60 then
    raise exception 'Muitos alertas seguidos' using errcode = 'P0001';
  end if;
  select count(*) into v_abertos from public.alertas_preco a
   where a.oficina_id = new.oficina_id and a.status = 'aberto' and a.expira_em > now();
  if v_abertos >= 5 then
    raise exception 'Alertas abertos demais' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.alertas_preco a
              where a.oficina_id = new.oficina_id and a.status = 'aberto' and a.expira_em > now()
                and (a.produto_id = new.produto_id or (new.chave is not null and a.chave = new.chave))) then
    raise exception 'Alerta repetido' using errcode = 'P0001';
  end if;

  if o.pro_ate >= v_hoje then
    select count(*) into v_usados from public.alertas_preco a
     where a.oficina_id = new.oficina_id and not a.usou_credito and a.criado_em >= v_inicio_mes
       and (a.status = 'fechado' or (a.status = 'aberto' and a.expira_em > now())
            or exists (select 1 from public.alertas_respostas r where r.alerta_id = a.id and r.tipo <> 'recusa'));
    select coalesce(sum(quantidade), 0) into v_creditos from public.alertas_creditos c where c.oficina_id = new.oficina_id;
    select count(*) into v_gastos from public.alertas_preco a
     where a.oficina_id = new.oficina_id and a.usou_credito
       and (a.status = 'fechado' or (a.status = 'aberto' and a.expira_em > now())
            or exists (select 1 from public.alertas_respostas r where r.alerta_id = a.id and r.tipo <> 'recusa'));
    if v_usados < 10 then
      new.usou_credito := false;
    elsif v_creditos - v_gastos > 0 then
      new.usou_credito := true;
    else
      raise exception 'Alertas do mês esgotados' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_usados from public.alertas_preco a
     where a.oficina_id = new.oficina_id and a.criado_em > now() - interval '30 days'
       and (a.status = 'fechado' or (a.status = 'aberto' and a.expira_em > now())
            or exists (select 1 from public.alertas_respostas r where r.alerta_id = a.id and r.tipo <> 'recusa'));
    if v_usados >= 3 then
      raise exception 'Alertas de teste esgotados' using errcode = 'P0001';
    end if;
    new.usou_credito := false;
  end if;
  return new;
end;
$$;

-- a oficina só cancela (o resto muda pelo pedido)
create or replace function privado.proteger_alerta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- o pedido que fecha o alerta roda dentro do gatilho do pedido (fechar_alerta_do_pedido), como dono
  if not privado.veio_da_api() or privado.sistema_autorizado() or privado.eh_equipe(array['suporte']) then
    return new;
  end if;
  if new.status is distinct from old.status and not (old.status = 'aberto' and new.status = 'cancelado') then
    raise exception 'O alerta só pode ser cancelado' using errcode = '42501';
  end if;
  if new.oficina_id is distinct from old.oficina_id or new.produto_id is distinct from old.produto_id
     or new.quantidade is distinct from old.quantidade or new.preco_alvo is distinct from old.preco_alvo
     or new.expira_em is distinct from old.expira_em or new.usou_credito is distinct from old.usou_credito
     or new.resposta_escolhida is distinct from old.resposta_escolhida or new.categoria is distinct from old.categoria
     or new.oficina_uf is distinct from old.oficina_uf then
    raise exception 'O alerta não muda depois de enviado' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger alertas_proteger before update on public.alertas_preco for each row execute function privado.proteger_alerta();

create or replace function public.fechar_alerta_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_resposta uuid;
  v_alerta uuid;
begin
  perform set_config('revisai.fechando_alerta', 'sim', true);
  for v_item in select value from jsonb_array_elements(new.itens)
  loop
    if jsonb_typeof(v_item -> 'resposta_id') is distinct from 'string' then
      continue;
    end if;
    v_resposta := (v_item ->> 'resposta_id')::uuid;
    select r.alerta_id into v_alerta from public.alertas_respostas r where r.id = v_resposta;
    if v_alerta is null then
      raise exception 'A proposta não vale mais' using errcode = 'RV001';
    end if;
    update public.alertas_preco
       set status = 'fechado', resposta_escolhida = v_resposta, atualizado_em = now()
     where id = v_alerta and status = 'aberto' and oficina_id = new.oficina_id;
    if not found then
      raise exception 'O alerta já foi fechado' using errcode = 'RV001';
    end if;
    update public.alertas_respostas
       set status = 'escolhida', pedido_id = new.id
     where id = v_resposta and status = 'enviada' and pedido_id is null;
    if not found then
      raise exception 'A proposta não vale mais' using errcode = 'RV001';
    end if;
    update public.alertas_respostas
       set status = 'descartada'
     where alerta_id = v_alerta and status = 'enviada' and id <> v_resposta;
  end loop;
  perform set_config('revisai.fechando_alerta', '', true);
  return null;
end;
$$;

-- o preço combinado só vale para a oficina dona do alerta
create or replace function public.calcular_pedido()
returns trigger
language plpgsql
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
  v_minimo integer;
  v_produto_resposta bigint;
  v_qtd_alerta integer;
  v_alvo numeric(10, 2);
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
    if jsonb_typeof(v_item -> 'resposta_id') = 'string' then
      select r.preco, r.quantidade_minima, r.produto_id, a.quantidade, a.preco_alvo
        into v_combinado, v_minimo, v_produto_resposta, v_qtd_alerta, v_alvo
        from public.alertas_respostas r
        join public.alertas_preco a on a.id = r.alerta_id
       where r.id = (v_item ->> 'resposta_id')::uuid
         and r.tipo in ('aceita', 'contraproposta')
         and r.fornecedor_id = v_fornecedor_id
         and r.status = 'enviada'
         and r.pedido_id is null
         and a.oficina_id = new.oficina_id
         and a.status = 'aberto'
         and a.expira_em > now() - interval '1 day';
      if v_combinado is null then
        raise exception 'A proposta não vale mais' using errcode = 'RV001';
      end if;
      if v_produto_resposta is distinct from v_produto_id
         or (jsonb_typeof(v_item -> 'preco_esperado') = 'number' and v_combinado <> (v_item ->> 'preco_esperado')::numeric)
         or (jsonb_typeof(v_item -> 'minimo_esperado') = 'number' and coalesce(v_minimo, 1) <> (v_item ->> 'minimo_esperado')::numeric) then
        raise exception 'A loja mudou a proposta' using errcode = 'RV002';
      end if;
      if v_quantidade < coalesce(v_minimo, 1)
         or v_quantidade * v_combinado > greatest(v_qtd_alerta * v_alvo, coalesce(v_minimo, 1) * v_combinado) * 5 then
        raise exception 'Quantidade fora da proposta' using errcode = 'RV003';
      end if;
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
    ) || case when v_combinado is not null then jsonb_build_object('resposta_id', v_item ->> 'resposta_id') else '{}'::jsonb end);
  end loop;

  new.itens := v_calculados;
  new.total := v_soma;
  new.status := 'novo';
  new.criado_em := now();
  return new;
end;
$$;

-- respostas das lojas
create policy "Oficina vê as respostas" on public.alertas_respostas for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or fornecedor_id in (select privado.meus_fornecedores()) or (select privado.eh_equipe()));
create policy "Loja responde alertas" on public.alertas_respostas for insert to authenticated
  with check (fornecedor_id in (select privado.meus_fornecedores()) and status = 'enviada' and pedido_id is null);
create policy "Loja muda a própria resposta" on public.alertas_respostas for update to authenticated
  using (fornecedor_id in (select privado.meus_fornecedores()))
  with check (fornecedor_id in (select privado.meus_fornecedores()));

/**
 * A resposta da loja: só para alerta aberto que ela recebe, com produto dela e da mesma
 * categoria; a oficina dona fica gravada na resposta (para o tempo real). A loja muda a própria
 * resposta enquanto o alerta está aberto e a resposta não foi escolhida.
 */
create or replace function privado.regras_da_resposta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.alertas_preco%rowtype;
begin
  if current_setting('revisai.fechando_alerta', true) = 'sim' or privado.sistema_autorizado() or privado.eh_equipe(array['suporte']) then
    if tg_op = 'INSERT' and new.oficina_id is null then
      select oficina_id into new.oficina_id from public.alertas_preco where id = new.alerta_id;
    end if;
    return new;
  end if;
  select * into a from public.alertas_preco where id = new.alerta_id;
  if not found or a.status <> 'aberto' or a.expira_em <= now() then
    raise exception 'O alerta não está mais aberto' using errcode = 'RV004';
  end if;
  if not exists (select 1 from public.fornecedores f where f.id = new.fornecedor_id and f.ativo and f.uf = a.oficina_uf) then
    raise exception 'A loja não recebe este alerta' using errcode = '42501';
  end if;
  if new.tipo <> 'recusa' then
    if new.produto_id is null or new.preco is null
       or not exists (select 1 from public.produtos p where p.id = new.produto_id and p.fornecedor_id = new.fornecedor_id and p.ativo and p.categoria = a.categoria) then
      raise exception 'Escolha um produto da sua loja' using errcode = '22023';
    end if;
  end if;
  new.oficina_id := a.oficina_id;
  if tg_op = 'UPDATE' then
    if old.status <> 'enviada' or old.pedido_id is not null or new.pedido_id is distinct from old.pedido_id
       or new.alerta_id is distinct from old.alerta_id or new.fornecedor_id is distinct from old.fornecedor_id
       or new.status is distinct from old.status then
      raise exception 'A resposta não muda mais' using errcode = '42501';
    end if;
  else
    new.status := 'enviada';
    new.pedido_id := null;
    new.criado_em := now();
  end if;
  return new;
end;
$$;
create trigger alertas_respostas_regras before insert or update on public.alertas_respostas
  for each row execute function privado.regras_da_resposta();

create policy "Oficina e equipe veem os créditos" on public.alertas_creditos for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));
create policy "Equipe libera créditos" on public.alertas_creditos for insert to authenticated
  with check ((select privado.eh_equipe(array['financeiro'])));
create policy "Sistema libera créditos" on public.alertas_creditos for insert to anon
  with check ((select privado.sistema_autorizado()));

-- ------------------------------------------------------------------ Pro: códigos e assinaturas

alter table public.assinaturas
  add column if not exists oficina_id uuid references public.oficinas (id) on delete set null;
create index if not exists assinaturas_oficina_idx on public.assinaturas (oficina_id);

create policy "Equipe vê as assinaturas" on public.assinaturas for select to authenticated
  using ((select privado.eh_equipe(array['financeiro', 'suporte'])) or oficina_id in (select privado.minhas_oficinas()));
create policy "Equipe cria assinaturas" on public.assinaturas for insert to authenticated
  with check ((select privado.eh_equipe(array['financeiro'])));
create policy "Equipe muda assinaturas" on public.assinaturas for update to authenticated
  using ((select privado.eh_equipe(array['financeiro']))) with check ((select privado.eh_equipe(array['financeiro'])));
create policy "Sistema registra assinaturas" on public.assinaturas for insert to anon
  with check ((select privado.sistema_autorizado()));
create policy "Sistema lê assinaturas" on public.assinaturas for select to anon
  using ((select privado.sistema_autorizado()));

/**
 * A oficina ativa um código do Pro que a equipe mandou (venda pelo WhatsApp). O código vale
 * para uma oficina só: a primeira que ativar fica com ele.
 */
create or replace function public.ativar_codigo_pro(p_oficina uuid, p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.assinaturas%rowtype;
  v_ate date;
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') not in ('dono', 'gerente') then
    raise exception 'Só o dono ativa o Pro' using errcode = '42501';
  end if;
  select * into a from public.assinaturas where codigo = upper(regexp_replace(p_codigo, '[^0-9A-Za-z]', '', 'g')) for update;
  if not found then
    raise exception 'Código não encontrado' using errcode = 'RV030';
  end if;
  if a.oficina_id is not null and a.oficina_id <> p_oficina then
    raise exception 'Este código já foi usado por outra oficina' using errcode = 'RV031';
  end if;
  if a.ate < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Este código venceu' using errcode = 'RV032';
  end if;
  update public.assinaturas set oficina_id = p_oficina, ativacoes = least(ativacoes + 1, 100) where id = a.id;
  update public.oficinas set pro_ate = greatest(coalesce(pro_ate, a.ate), a.ate) where id = p_oficina
    returning pro_ate into v_ate;
  return jsonb_build_object('ate', v_ate, 'oficina', a.oficina_nome);
end;
$$;

/** O teste do Pro de 30 dias: uma vez por oficina e por conta. */
create or replace function public.comecar_teste_pro(p_oficina uuid)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.oficinas%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(privado.papel_na_oficina(p_oficina), '') not in ('dono', 'gerente') then
    raise exception 'Só o dono começa o teste' using errcode = '42501';
  end if;
  select * into o from public.oficinas where id = p_oficina for update;
  if o.teste_ate is not null then
    return o.teste_ate;
  end if;
  if exists (select 1 from public.oficinas x where x.criado_por = auth.uid() and x.teste_ate is not null and x.id <> p_oficina)
     or (o.whatsapp is not null and exists (select 1 from public.oficinas x where x.whatsapp = o.whatsapp and x.teste_ate is not null and x.id <> p_oficina)) then
    raise exception 'O teste já foi usado' using errcode = 'RV033';
  end if;
  update public.oficinas set teste_ate = v_hoje + 29 where id = p_oficina;
  return v_hoje + 29;
end;
$$;

revoke all on function public.ativar_codigo_pro(uuid, text), public.comecar_teste_pro(uuid) from public, anon;
grant execute on function public.ativar_codigo_pro(uuid, text), public.comecar_teste_pro(uuid) to authenticated;

-- ------------------------------------------------------------------ demanda regional

alter table public.demandas
  add column if not exists oficina_id uuid unique references public.oficinas (id) on delete cascade;

create policy "Oficina grava a própria demanda" on public.demandas for insert to authenticated
  with check (oficina_id in (select privado.minhas_oficinas()) and id = oficina_id);
create policy "Oficina atualiza a própria demanda" on public.demandas for update to authenticated
  using (oficina_id in (select privado.minhas_oficinas())) with check (oficina_id in (select privado.minhas_oficinas()) and id = oficina_id);
create policy "Oficina e equipe veem a demanda" on public.demandas for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()) or (select privado.eh_equipe()));

-- ------------------------------------------------------------------ agente do WhatsApp

alter table public.whatsapp_codigos add column if not exists oficina_id uuid references public.oficinas (id) on delete cascade;
alter table public.whatsapp_codigos alter column aparelho_id drop not null;
alter table public.whatsapp_codigos add column if not exists tentativas integer not null default 0;
alter table public.whatsapp_codigos drop constraint if exists whatsapp_codigos_codigo_check;
alter table public.whatsapp_codigos add constraint whatsapp_codigos_codigo_check check (codigo ~ '^[0-9]{6,10}$');

alter table public.whatsapp_vinculos add column if not exists oficina_id uuid references public.oficinas (id) on delete cascade;
alter table public.whatsapp_vinculos alter column aparelho_id drop not null;

alter table public.ordens_rascunho add column if not exists oficina_id uuid references public.oficinas (id) on delete cascade;
alter table public.ordens_rascunho alter column aparelho_id drop not null;
create index if not exists ordens_rascunho_oficina_idx on public.ordens_rascunho (oficina_id, status, criado_em desc);

create policy "Sistema cuida dos códigos" on public.whatsapp_codigos for all to anon
  using ((select privado.sistema_autorizado())) with check ((select privado.sistema_autorizado()));
create policy "Sistema cuida dos vínculos" on public.whatsapp_vinculos for all to anon
  using ((select privado.sistema_autorizado())) with check ((select privado.sistema_autorizado()));
create policy "Oficina vê os números ligados" on public.whatsapp_vinculos for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));
create policy "Oficina desliga um número" on public.whatsapp_vinculos for delete to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));
create policy "Sistema cuida dos rascunhos" on public.ordens_rascunho for all to anon
  using ((select privado.sistema_autorizado())) with check ((select privado.sistema_autorizado()));
create policy "Oficina vê os rascunhos" on public.ordens_rascunho for select to authenticated
  using (oficina_id in (select privado.minhas_oficinas()));
create policy "Oficina encerra os rascunhos" on public.ordens_rascunho for update to authenticated
  using (oficina_id in (select privado.minhas_oficinas()))
  with check (oficina_id in (select privado.minhas_oficinas()) and status in ('confirmada', 'descartada'));

/** Código para ligar um número de WhatsApp à oficina (8 dígitos, vale 15 minutos). */
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
  select nome into v_nome from public.oficinas where id = p_oficina;
  delete from public.whatsapp_codigos where oficina_id = p_oficina;
  loop
    v_codigo := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    begin
      insert into public.whatsapp_codigos (codigo, oficina_id, oficina_nome, expira_em)
      values (v_codigo, p_oficina, v_nome, now() + interval '15 minutes');
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return v_codigo;
end;
$$;

revoke all on function public.whatsapp_gerar_codigo(uuid) from public, anon;
grant execute on function public.whatsapp_gerar_codigo(uuid) to authenticated;

-- ------------------------------------------------------------------ arquivos

create policy "Loja guarda fotos dos próprios produtos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = 'fornecedores'
    and (storage.foldername(name))[2] in (select privado.meus_fornecedores()::text)
  );
create policy "Loja vê as fotos dos próprios produtos" on storage.objects for select to authenticated
  using (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = 'fornecedores'
    and (storage.foldername(name))[2] in (select privado.meus_fornecedores()::text)
  );
create policy "Equipe cuida das fotos de produto" on storage.objects for all to authenticated
  using (bucket_id = 'produtos' and (select privado.eh_equipe(array['suporte'])))
  with check (bucket_id = 'produtos' and (select privado.eh_equipe(array['suporte'])));

create policy "Sistema guarda mídia das oficinas" on storage.objects for insert to anon
  with check (bucket_id = 'oficinas' and (select privado.sistema_autorizado()));
create policy "Sistema lê mídia das oficinas" on storage.objects for select to anon
  using (bucket_id = 'oficinas' and (select privado.sistema_autorizado()));
create policy "Sistema apaga mídia das oficinas" on storage.objects for delete to anon
  using (bucket_id = 'oficinas' and (select privado.sistema_autorizado()));
create policy "Oficina lê a própria mídia" on storage.objects for select to authenticated
  using (bucket_id = 'oficinas' and (storage.foldername(name))[1] in (select privado.minhas_oficinas()::text));
create policy "Oficina guarda a própria mídia" on storage.objects for insert to authenticated
  with check (bucket_id = 'oficinas' and (storage.foldername(name))[1] in (select privado.minhas_oficinas()::text));

create policy "Sistema guarda a voz" on storage.objects for insert to anon
  with check (bucket_id = 'voz' and (select privado.sistema_autorizado()));

-- ------------------------------------------------------------------ tempo real

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pedidos_fornecedores, public.alertas_respostas, public.alertas_preco;
  end if;
end $$;

-- ------------------------------------------------------------------ permissões das tabelas

-- O padrão deste banco é nada liberado (as migrações antigas tiraram os privilégios padrão);
-- aqui cada papel recebe só o que as políticas acima usam.
revoke all on public.fornecedores, public.fornecedores_contrato, public.fornecedores_pix, public.fornecedores_pix_historico,
  public.produtos, public.promocoes, public.impulsos, public.produtos_referencia, public.interessados, public.pedidos,
  public.pedidos_fornecedores, public.alertas_preco, public.alertas_respostas, public.alertas_creditos, public.assinaturas,
  public.demandas, public.whatsapp_codigos, public.whatsapp_vinculos, public.ordens_rascunho
  from anon, authenticated;

grant select, update on public.fornecedores to anon;
grant select, insert, update on public.fornecedores to authenticated;
grant select on public.fornecedores_contrato to anon;
grant select, insert, update on public.fornecedores_contrato to authenticated;
grant select on public.fornecedores_pix, public.fornecedores_pix_historico to authenticated;
grant select on public.produtos, public.promocoes, public.impulsos, public.produtos_referencia to anon;
grant select, insert, update on public.produtos, public.promocoes, public.impulsos, public.produtos_referencia to authenticated;
grant insert on public.interessados to anon;
grant select, insert, update on public.interessados to authenticated;
grant select, insert, update on public.pedidos to authenticated;
grant select, update on public.pedidos_fornecedores to authenticated;
grant select on public.alertas_preco to anon;
grant select, insert, update on public.alertas_preco to authenticated;
grant select, insert, update on public.alertas_respostas to authenticated;
grant insert on public.alertas_creditos to anon;
grant select, insert on public.alertas_creditos to authenticated;
grant select, insert on public.assinaturas to anon;
grant select, insert, update on public.assinaturas to authenticated;
grant select, insert, update on public.demandas to authenticated;
grant select, insert, update, delete on public.whatsapp_codigos, public.whatsapp_vinculos, public.ordens_rascunho to anon;
grant select, delete on public.whatsapp_vinculos to authenticated;
grant select, update on public.ordens_rascunho to authenticated;
grant usage, select on all sequences in schema public to authenticated;
