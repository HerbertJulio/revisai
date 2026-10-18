#!/usr/bin/env bash
# Aplica no banco as migrações de supabase/migrations que ele ainda não tem, na ordem dos nomes.
#
#   SUPABASE_DB_URL=postgresql://... scripts/banco/aplicar-migracoes.sh [--ver]
#
# Cada arquivo roda numa transação só, junto com o registro em supabase_migrations.schema_migrations
# (versão = o começo do nome do arquivo, nome = o resto). Se um falha, nada dele fica e o script para
# ali: os anteriores continuam aplicados e a próxima rodada começa do que falhou. Com --ver, só lista
# o que falta, sem mudar nada.
#
# SUPABASE_DB_URL: a conexão do "Session pooler" do Supabase (porta 5432), a mesma da cópia de
# segurança. A conexão direta só tem IPv6, que os servidores do GitHub não têm.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
# shellcheck source=scripts/backup/comum.sh
. "$RAIZ/scripts/backup/comum.sh"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Falta SUPABASE_DB_URL (a conexão do Session pooler do Supabase)." >&2
  exit 1
fi
PSQL="$(programa_pg psql)"
banco() { "$PSQL" "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

aplicadas="$(banco -At -c "select version from supabase_migrations.schema_migrations")"
pendentes=()
for arquivo in "$RAIZ"/supabase/migrations/*.sql; do
  base="$(basename "$arquivo" .sql)"
  versao="${base%%_*}"
  if ! grep -qxF "$versao" <<<"$aplicadas"; then pendentes+=("$arquivo"); fi
done

echo "Migrações que faltam: ${#pendentes[@]}"
for arquivo in "${pendentes[@]}"; do echo "  $(basename "$arquivo")"; done
if [ "${1:-}" = "--ver" ] || [ "${#pendentes[@]}" -eq 0 ]; then exit 0; fi

for arquivo in "${pendentes[@]}"; do
  base="$(basename "$arquivo" .sql)"
  versao="${base%%_*}"
  nome="${base#*_}"
  echo "== $base"
  # o arquivo e o registro na mesma transação: ou entram os dois, ou nenhum
  banco -v versao="$versao" -v nome="$nome" -v arquivo="$arquivo" <<'SQL'
begin;
\i :arquivo
\set conteudo `cat :'arquivo'`
insert into supabase_migrations.schema_migrations (version, name, statements)
values (:'versao', :'nome', array[:'conteudo']);
commit;
SQL
done
echo "Pronto: ${#pendentes[@]} migrações aplicadas."
