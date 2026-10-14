-- Agente de ordem de serviço pelo WhatsApp. O mecânico liga o WhatsApp dele à oficina com um
-- código que o app mostra; depois manda áudios e fotos, a IA monta o rascunho e o app da oficina
-- busca o rascunho para o mecânico conferir. Tudo passa pelo servidor com a chave da equipe.

-- Códigos de 6 dígitos para ligar um WhatsApp a um aparelho da oficina (valem 15 minutos).
create table public.whatsapp_codigos (
  codigo text primary key check (codigo ~ '^[0-9]{6}$'),
  aparelho_id uuid not null,
  oficina_nome text check (char_length(oficina_nome) <= 120),
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

-- Cada WhatsApp ligado a um aparelho (a oficina pode ligar vários mecânicos).
create table public.whatsapp_vinculos (
  telefone text primary key check (telefone ~ '^55[0-9]{10,11}$'),
  aparelho_id uuid not null,
  oficina_nome text check (char_length(oficina_nome) <= 120),
  criado_em timestamptz not null default now()
);

create index whatsapp_vinculos_aparelho_idx on public.whatsapp_vinculos (aparelho_id);

-- Rascunhos de ordem de serviço: 'aberta' enquanto chegam áudios e fotos, 'pronta' quando a IA
-- montou, 'confirmada' ou 'descartada' depois que o mecânico conferiu no app.
create table public.ordens_rascunho (
  id uuid primary key default gen_random_uuid(),
  aparelho_id uuid not null,
  telefone text check (telefone ~ '^55[0-9]{10,11}$'),
  origem text not null default 'whatsapp' check (origem in ('whatsapp', 'app')),
  status text not null default 'aberta' check (status in ('aberta', 'processando', 'pronta', 'confirmada', 'descartada', 'erro')),
  midias jsonb not null default '[]'::jsonb check (jsonb_typeof(midias) = 'array' and jsonb_array_length(midias) <= 20),
  textos jsonb not null default '[]'::jsonb check (jsonb_typeof(textos) = 'array' and jsonb_array_length(textos) <= 40),
  resultado jsonb,
  modelo text check (char_length(modelo) <= 80),
  erro text check (char_length(erro) <= 300),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index ordens_rascunho_aparelho_idx on public.ordens_rascunho (aparelho_id, status, criado_em);
create index ordens_rascunho_telefone_idx on public.ordens_rascunho (telefone, status, atualizado_em);

alter table public.whatsapp_codigos enable row level security;
alter table public.whatsapp_vinculos enable row level security;
alter table public.ordens_rascunho enable row level security;
grant select, insert, update, delete on public.whatsapp_codigos, public.whatsapp_vinculos, public.ordens_rascunho to anon;

create policy "Servidor lê os códigos" on public.whatsapp_codigos for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor cria códigos" on public.whatsapp_codigos for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor apaga códigos" on public.whatsapp_codigos for delete to anon using ((select privado.equipe_autorizada()));

create policy "Servidor lê os vínculos" on public.whatsapp_vinculos for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor cria vínculos" on public.whatsapp_vinculos for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor troca vínculos" on public.whatsapp_vinculos for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));
create policy "Servidor apaga vínculos" on public.whatsapp_vinculos for delete to anon using ((select privado.equipe_autorizada()));

create policy "Servidor lê os rascunhos" on public.ordens_rascunho for select to anon using ((select privado.equipe_autorizada()));
create policy "Servidor cria rascunhos" on public.ordens_rascunho for insert to anon with check ((select privado.equipe_autorizada()));
create policy "Servidor muda rascunhos" on public.ordens_rascunho for update to anon using ((select privado.equipe_autorizada())) with check ((select privado.equipe_autorizada()));

-- Áudios e fotos do WhatsApp: bucket privado; o app recebe links assinados que vencem logo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oficinas', 'oficinas', false, 16777216, array['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Servidor guarda mídia das oficinas" on storage.objects for insert to anon
  with check (bucket_id = 'oficinas' and (select privado.equipe_autorizada()));
create policy "Servidor lê mídia das oficinas" on storage.objects for select to anon
  using (bucket_id = 'oficinas' and (select privado.equipe_autorizada()));
create policy "Servidor apaga mídia das oficinas" on storage.objects for delete to anon
  using (bucket_id = 'oficinas' and (select privado.equipe_autorizada()));
