-- Na loja, o dono cuida do que é sensível: a chave Pix (ver, trocar, cancelar a troca), o cadastro
-- da loja e quem é dono. O vendedor cuida do dia a dia (produtos, promoções, pedidos e alertas).
-- Chamar outro dono pede o código do e-mail de novo, como a troca do Pix: quem pega a sessão de
-- alguém não consegue pôr um comparsa como dono para trocar a chave.

-- ------------------------------------------------------------------ Pix só para o dono

drop policy if exists "Loja vê a troca pendente" on public.fornecedores_pix_troca;
drop policy if exists "Loja vê a própria chave Pix" on public.fornecedores_pix;
drop policy if exists "Loja vê o histórico do Pix" on public.fornecedores_pix_historico;

create policy "Dono vê a troca pendente" on public.fornecedores_pix_troca for select to authenticated
  using (privado.papel_no_fornecedor(fornecedor_id) = 'dono' or (select privado.eh_equipe()));
create policy "Dono vê a chave Pix" on public.fornecedores_pix for select to authenticated
  using (privado.papel_no_fornecedor(fornecedor_id) = 'dono' or (select privado.eh_equipe()));
create policy "Dono vê o histórico do Pix" on public.fornecedores_pix_historico for select to authenticated
  using (privado.papel_no_fornecedor(fornecedor_id) = 'dono' or (select privado.eh_equipe()));

create or replace function public.loja_cancelar_troca_pix(p_fornecedor bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(privado.papel_no_fornecedor(p_fornecedor), '') <> 'dono' and not privado.eh_equipe(array['suporte']) then
    raise exception 'Só o dono da loja mexe na chave Pix' using errcode = '42501';
  end if;
  delete from public.fornecedores_pix_troca where fornecedor_id = p_fornecedor;
  return found;
end;
$$;

/**
 * O Pix da loja para o painel. Aplica antes a troca que já passou das 24 horas. O dono vê a chave,
 * a troca pendente (e quem pediu) e as chaves antigas; o vendedor só sabe se a loja recebe por Pix.
 */
create or replace function public.loja_pix(p_fornecedor bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_papel text := privado.papel_no_fornecedor(p_fornecedor);
  v_tem boolean;
begin
  if v_papel is null and not privado.eh_equipe() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  perform privado.aplicar_trocas_pix(p_fornecedor);
  select exists (select 1 from public.fornecedores_pix where fornecedor_id = p_fornecedor) into v_tem;
  if v_papel is distinct from 'dono' and not privado.eh_equipe() then
    return jsonb_build_object('tem', v_tem, 'dono', false);
  end if;
  return jsonb_build_object(
    'tem', v_tem,
    'dono', true,
    'atual', (select jsonb_build_object('tipo', x.tipo, 'chave', x.chave, 'nome', x.nome, 'cidade', x.cidade, 'desde', x.atualizado_em)
                from public.fornecedores_pix x where x.fornecedor_id = p_fornecedor),
    'troca', (select jsonb_build_object('tipo', t.tipo, 'chave', t.chave, 'nome', t.nome, 'cidade', t.cidade, 'pedidaEm', t.pedida_em, 'valeEm', t.vale_em,
                       'pedidaPor', (select m.email from public.fornecedor_membros m where m.fornecedor_id = t.fornecedor_id and m.user_id = t.pedida_por))
                from public.fornecedores_pix_troca t where t.fornecedor_id = p_fornecedor),
    'antigas', coalesce((select jsonb_agg(jsonb_build_object('tipo', h.tipo, 'chave', h.chave, 'nome', h.nome, 'usadaAte', h.usada_ate) order by h.usada_ate desc)
                           from (select * from public.fornecedores_pix_historico where fornecedor_id = p_fornecedor order by usada_ate desc limit 10) h), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.loja_pix(bigint) from public, anon;
grant execute on function public.loja_pix(bigint) to authenticated;

-- ------------------------------------------------------------------ cadastro da loja

-- O vendedor não muda o cadastro (nome, contato, cidade): só o dono, a equipe e o sistema.
create or replace function privado.loja_cadastro_do_dono()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if privado.veio_da_api() and not privado.sistema_autorizado() and not privado.eh_equipe(array['suporte', 'financeiro'])
     and coalesce(privado.papel_no_fornecedor(old.id), '') <> 'dono' then
    raise exception 'Só o dono muda o cadastro da loja' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists fornecedores_cadastro_do_dono on public.fornecedores;
create trigger fornecedores_cadastro_do_dono before update on public.fornecedores
  for each row execute function privado.loja_cadastro_do_dono();

-- ------------------------------------------------------------------ quem é dono

-- Chamar alguém como dono da loja pede o código do e-mail de novo (vale para a função convidar).
create or replace function privado.dono_da_loja_confirma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'fornecedor' and new.papel = 'dono' and auth.uid() is not null
     and not privado.eh_equipe(array['suporte']) and not privado.entrou_ha_pouco() then
    raise exception 'Confirme o código do e-mail para chamar outro dono' using errcode = 'RV020';
  end if;
  return new;
end;
$$;

drop trigger if exists convites_dono_da_loja on public.convites;
create trigger convites_dono_da_loja before insert on public.convites
  for each row execute function privado.dono_da_loja_confirma();

/** O dono muda o papel de alguém da loja. Virar dono pede o código do e-mail de novo; a loja nunca fica sem dono. */
create or replace function public.loja_mudar_papel(p_fornecedor bigint, p_user uuid, p_papel text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_atual text;
begin
  if coalesce(privado.papel_no_fornecedor(p_fornecedor), '') <> 'dono' then
    raise exception 'Só o dono muda papéis' using errcode = '42501';
  end if;
  if p_papel not in ('dono', 'vendedor') then
    raise exception 'Papel inválido' using errcode = '22023';
  end if;
  select papel into v_atual from public.fornecedor_membros where fornecedor_id = p_fornecedor and user_id = p_user;
  if v_atual is null then
    return false;
  end if;
  if v_atual = p_papel then
    return true;
  end if;
  if p_papel = 'dono' and not privado.entrou_ha_pouco() then
    raise exception 'Confirme o código do e-mail para passar alguém a dono' using errcode = 'RV020';
  end if;
  if v_atual = 'dono' and (select count(*) from public.fornecedor_membros where fornecedor_id = p_fornecedor and papel = 'dono') <= 1 then
    raise exception 'A loja precisa de um dono' using errcode = 'P0001';
  end if;
  update public.fornecedor_membros set papel = p_papel where fornecedor_id = p_fornecedor and user_id = p_user;
  return true;
end;
$$;

revoke all on function public.loja_mudar_papel(bigint, uuid, text) from public, anon;
grant execute on function public.loja_mudar_papel(bigint, uuid, text) to authenticated;
