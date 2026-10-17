-- O pedido de horário pelo link vira aviso para as pessoas da oficina (push, e-mail e WhatsApp),
-- pela fila de avisos (20261017070000_plataforma_avisos). O tipo novo entra nas listas de tipos
-- da fila e das preferências sem tirar os que outras partes já acrescentaram.
-- Pode rodar de novo sem estragar nada.

/**
 * Acrescenta um tipo à lista de uma restrição "coluna = any (lista)" ou "coluna <@ lista",
 * lendo a lista que está no banco (nas duas formas que o Postgres mostra: ARRAY['a'::text, ...]
 * ou '{a,b}'::text[]) e escrevendo de novo na forma ARRAY[...].
 */
create or replace function privado.agenda_acrescentar_tipo(p_tabela regclass, p_restricao text, p_modelo text, p_tipo text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_def text;
  v_tipos text[];
  v_entre_aspas boolean;
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c where c.conrelid = p_tabela and c.conname = p_restricao;
  if v_def is null then
    return;
  end if;
  v_tipos := array(select m[1] from regexp_matches(v_def, '''([a-z_]+)''', 'g') m);
  v_entre_aspas := cardinality(v_tipos) > 0;
  if not v_entre_aspas then
    v_tipos := string_to_array((regexp_match(v_def, '''\{([a-z_,]*)\}'''))[1], ',');
  end if;
  if coalesce(cardinality(v_tipos), 0) = 0 then
    raise notice 'Não deu para ler a lista de %: %', p_restricao, v_def;
    return;
  end if;
  if p_tipo = any (v_tipos) and v_entre_aspas then
    return;
  end if;
  if not (p_tipo = any (v_tipos)) then
    v_tipos := v_tipos || p_tipo;
  end if;
  execute format('alter table %s drop constraint %I', p_tabela, p_restricao);
  execute format('alter table %s add constraint %I check (' || p_modelo || ')', p_tabela, p_restricao,
    'array[' || (select string_agg(quote_literal(t), ', ') from unnest(v_tipos) t) || ']::text[]');
end;
$$;
revoke all on function privado.agenda_acrescentar_tipo(regclass, text, text, text) from public, anon, authenticated;

select privado.agenda_acrescentar_tipo('public.avisos_fila', 'avisos_fila_tipo_check', 'tipo = any (%s)', 'agendamento_online');
select privado.agenda_acrescentar_tipo('public.avisos_preferencias', 'avisos_preferencias_desligados_check', 'desligados <@ %s', 'agendamento_online');

-- pedido de horário novo: avisa as pessoas da oficina (só o primeiro nome do cliente vai no aviso)
create or replace function privado.avisos_do_agendamento_online()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.avisar('agendamento_online', jsonb_build_object('oficina_id', new.oficina_id),
    jsonb_build_object('pedidoId', new.id, 'data', to_char(new.data, 'YYYY-MM-DD'), 'hora', new.hora, 'servico', new.servico,
      'cliente', split_part(new.nome, ' ', 1)));
  return null;
end;
$$;
revoke all on function privado.avisos_do_agendamento_online() from public, anon, authenticated;

drop trigger if exists avisos_agendamento_online on public.agendamentos_online;
create trigger avisos_agendamento_online after insert on public.agendamentos_online
  for each row execute function privado.avisos_do_agendamento_online();
