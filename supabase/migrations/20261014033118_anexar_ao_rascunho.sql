-- Junta um áudio, uma foto ou um texto ao rascunho sem perder o que chegou ao mesmo tempo
-- (o WhatsApp manda cada mensagem numa chamada, às vezes em paralelo). Ignora mensagem repetida.
-- Roda com o papel de quem chama (security invoker): só o servidor, com a chave da equipe, passa no RLS.
create or replace function public.anexar_ao_rascunho(p_id uuid, p_campo text, p_item jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  feito integer;
begin
  if p_campo not in ('midias', 'textos') or jsonb_typeof(p_item) <> 'object' then
    return false;
  end if;
  if p_campo = 'midias' then
    update public.ordens_rascunho
       set midias = midias || jsonb_build_array(p_item), atualizado_em = now()
     where id = p_id and status = 'aberta'
       and not (midias @> jsonb_build_array(jsonb_build_object('mensagem', p_item ->> 'mensagem')));
  else
    update public.ordens_rascunho
       set textos = textos || jsonb_build_array(p_item), atualizado_em = now()
     where id = p_id and status = 'aberta'
       and not (textos @> jsonb_build_array(jsonb_build_object('mensagem', p_item ->> 'mensagem')));
  end if;
  get diagnostics feito = row_count;
  return feito > 0;
end;
$$;

revoke all on function public.anexar_ao_rascunho(uuid, text, jsonb) from public;
grant execute on function public.anexar_ao_rascunho(uuid, text, jsonb) to anon;
