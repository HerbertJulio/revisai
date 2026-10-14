-- Código do Pro: o app confere o código no servidor e conta quantos aparelhos já ativaram,
-- para um código pago não virar Pro de graça para muitas oficinas.
alter table public.assinaturas
  add column ativacoes integer not null default 0 check (ativacoes between 0 and 100);

grant update (ativacoes) on public.assinaturas to anon;

create policy "Servidor conta as ativações" on public.assinaturas
  for update to anon
  using ((select privado.equipe_autorizada()))
  with check ((select privado.equipe_autorizada()));
