-- Links públicos também para a cobrança do cliente da oficina (Pix pelo WhatsApp) e para o
-- cartão do clube de manutenção.
alter table public.links_publicos drop constraint if exists links_publicos_tipo_check;
alter table public.links_publicos add constraint links_publicos_tipo_check
  check (tipo in ('orcamento', 'andamento', 'garantia', 'historico', 'checklist', 'pagamento', 'clube'));
