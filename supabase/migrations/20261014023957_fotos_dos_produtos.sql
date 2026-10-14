-- Fotos dos produtos da loja. O bucket é público para leitura (a foto aparece na vitrine),
-- e só o servidor do Revisaí, com a chave da equipe no cabeçalho, envia ou troca arquivos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "equipe envia fotos de produto"
  on storage.objects for insert to anon
  with check (bucket_id = 'produtos' and (select privado.equipe_autorizada()));

create policy "equipe vê os arquivos de produto"
  on storage.objects for select to anon
  using (bucket_id = 'produtos' and (select privado.equipe_autorizada()));

create policy "equipe troca fotos de produto"
  on storage.objects for update to anon
  using (bucket_id = 'produtos' and (select privado.equipe_autorizada()))
  with check (bucket_id = 'produtos' and (select privado.equipe_autorizada()));

create policy "equipe apaga fotos de produto"
  on storage.objects for delete to anon
  using (bucket_id = 'produtos' and (select privado.equipe_autorizada()));
