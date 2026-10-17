-- Cobrança, parte do servidor: o servidor (chave do sistema) lê as assinaturas e os pagamentos
-- para aplicar os avisos dos gateways, emitir a nota e agendar as cobranças do Pix Automático.
-- A nota emitida por outro gateway (nota avulsa do Asaas para um Pix da Efí) é achada pelo id
-- da nota; e a autorização do Pix Automático aprovada no banco ativa a assinatura.

create policy "O sistema lê as assinaturas" on public.assinaturas_pro for select to anon
  using ((select privado.sistema_autorizado()));
create policy "O sistema lê os pagamentos" on public.pagamentos for select to anon
  using ((select privado.sistema_autorizado()));
grant select on public.assinaturas_pro, public.pagamentos to anon;

/** A nota fiscal do pagamento. Sem a cobrança (p_externo vazio), acha pelo id da nota, de qualquer gateway. */
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
  if p_situacao is not null and p_situacao not in ('agendada', 'emitida', 'erro', 'cancelada') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  update public.pagamentos
     set nota_externa = coalesce(nullif(p_nota, ''), nota_externa),
         nota_numero = coalesce(nullif(left(p_numero, 40), ''), nota_numero),
         nota_url = coalesce(case when p_url ~ '^https://' then left(p_url, 500) end, nota_url),
         nota_situacao = coalesce(p_situacao, nota_situacao),
         nota_erro = case when p_situacao = 'erro' then left(p_erro, 300) else null end,
         atualizado_em = now()
   where (nullif(p_externo, '') is not null and provedor = p_provedor and externo = p_externo)
      or (nullif(p_nota, '') is not null and nota_externa = p_nota);
  return found;
end;
$$;

/** O pagador autorizou o Pix Automático no banco: a assinatura vale e o código de autorização sai da tela. */
create or replace function public.cobranca_autorizacao_aprovada(p_provedor text, p_externa text)
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
     set autorizacao = null,
         situacao = case when situacao = 'pendente' then 'ativa' else situacao end,
         atualizado_em = now()
   where provedor = p_provedor and assinatura_externa = p_externa and situacao <> 'cancelada';
  return found;
end;
$$;

revoke all on function public.cobranca_autorizacao_aprovada(text, text) from public;
grant execute on function public.cobranca_autorizacao_aprovada(text, text) to anon;
