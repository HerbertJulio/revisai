-- O primeiro acesso do banco de produção, sem precisar do SQL Editor: o convite do dono da
-- plataforma para entrar na equipe como admin e o endereço do app, para o banco chamar o
-- processador dos avisos assim que um aviso entra na fila (sem ele, os avisos esperam a rotina
-- diária). Só vale para o banco que veio do painel antigo da equipe, o de produção, que é o único
-- com a chave 'equipe'; os bancos locais e de teste não têm essa chave e ficam como estão.

do $$
begin
  if not exists (select 1 from privado.chaves where nome = 'equipe') then
    return;
  end if;

  -- o convite vira membro da equipe quando a pessoa entra em /admin/entrar com este e-mail
  if not exists (select 1 from privado.equipe) and not exists (select 1 from privado.equipe_convites) then
    insert into privado.equipe_convites (email, papel, nome)
    values ('hvcotta@gmail.com', 'admin', 'Herbert');
  end if;

  if not exists (select 1 from privado.avisos_config) then
    perform privado.avisos_configurar('https://revisai.howlks.com');
  end if;
end $$;
