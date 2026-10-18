#!/usr/bin/env bash
# Instala o cliente do Postgres (pg_dump, pg_restore e psql) do repositório oficial do Postgres
# (PGDG) no Ubuntu dos servidores do GitHub. O cliente precisa ser da mesma versão do servidor do
# Supabase ou mais novo.
#
#   scripts/backup/instalar-cliente-pg.sh [versão, padrão 17]
set -euo pipefail
VERSAO="${1:-17}"
if [ -x "/usr/lib/postgresql/$VERSAO/bin/pg_dump" ]; then
  "/usr/lib/postgresql/$VERSAO/bin/pg_dump" --version
  exit 0
fi
# shellcheck source=/dev/null
. /etc/os-release
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" |
  sudo tee /etc/apt/sources.list.d/pgdg.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq "postgresql-client-$VERSAO" > /dev/null
"/usr/lib/postgresql/$VERSAO/bin/pg_dump" --version
