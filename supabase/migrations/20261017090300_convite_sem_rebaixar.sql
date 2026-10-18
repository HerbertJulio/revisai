-- Aceitar um convite não muda o papel de quem já é da oficina ou da loja: um gerente que convidasse
-- o e-mail do dono como mecânico rebaixaria o dono. A troca de papel é só por mudar_papel, com as regras dela.

create or replace function public.aceitar_convite(p_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_c public.convites%rowtype;
  v_n integer := 0;
begin
  if v_uid is null or v_email = '' then
    raise exception 'Entre na sua conta' using errcode = '28000';
  end if;
  for v_c in
    select * from public.convites c
     where c.email = v_email and c.aceito_em is null and c.expira_em > now() and (p_id is null or c.id = p_id)
     for update
  loop
    if v_c.tipo = 'oficina' then
      insert into public.oficina_membros (oficina_id, user_id, papel, email)
      values (v_c.oficina_id, v_uid, v_c.papel, v_email)
      on conflict (oficina_id, user_id) do nothing;
    else
      insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email)
      values (v_c.fornecedor_id, v_uid, v_c.papel, v_email)
      on conflict (fornecedor_id, user_id) do nothing;
    end if;
    update public.convites set aceito_em = now() where id = v_c.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
