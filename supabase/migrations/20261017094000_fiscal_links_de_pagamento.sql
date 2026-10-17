-- A cobrança do cliente da oficina pelo link: o cliente abre a página do Pix (tipo 'pagamento')
-- ou o cartão do clube de manutenção (tipo 'clube') e avisa "Já paguei". A oficina confere no
-- banco dela e confirma no app. As regras do orçamento e do checklist continuam as mesmas.
-- O mecânico não vê dinheiro: os links de cobrança e do clube ficam só para o dono e o gerente.
-- Pode rodar de novo sem estragar nada.

/**
 * O cliente responde pelo link: aprova ou recusa o orçamento (com os itens recusados), assina
 * o checklist, ou avisa que pagou (cobrança e cartão do clube). Guarda data, hora, IP, aparelho
 * e o que foi mostrado (versão), como prova.
 * No pagamento e no clube o aviso pode vir de novo depois que a oficina tratou o anterior (o Pix
 * não caiu, ou é a mensalidade do mês seguinte); antes disso, é "Já respondido".
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
  v_acao text := p_resposta ->> 'acao';
  v_cobranca boolean;
begin
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
  if l.respondido_em is not null and not (v_cobranca and l.processado_em is not null) then
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

revoke all on function public.responder_link(text, jsonb, text, text) from public;
grant execute on function public.responder_link(text, jsonb, text, text) to anon, authenticated;

-- o mecânico não lê os links de cobrança nem os cartões do clube (valores e Pix da oficina)
drop policy if exists "Cobranças só para dono e gerente" on public.links_publicos;
create policy "Cobranças só para dono e gerente" on public.links_publicos as restrictive for select to authenticated
  using (tipo not in ('pagamento', 'clube') or privado.papel_na_oficina(oficina_id) in ('dono', 'gerente'));
