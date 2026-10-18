#!/usr/bin/env bash
# Aplica no banco as migrações de supabase/migrations que ele ainda não tem, na ordem dos nomes.
#
#   SUPABASE_DB_URL=postgresql://... scripts/banco/aplicar-migracoes.sh [--ver]
#   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=... scripts/banco/aplicar-migracoes.sh [--ver]
#
# Cada arquivo roda numa transação só, junto com o registro em supabase_migrations.schema_migrations
# (versão = o começo do nome do arquivo, nome = o resto). Se um falha, nada dele fica e o script para
# ali: os anteriores continuam aplicados e a próxima rodada começa do que falhou. Com --ver, só lista
# o que falta, sem mudar nada.
#
# Dois jeitos de chegar ao banco:
# - SUPABASE_DB_URL: a conexão do "Session pooler" do Supabase (porta 5432), a mesma da cópia de
#   segurança. A conexão direta só tem IPv6, que os servidores do GitHub não têm.
# - SUPABASE_ACCESS_TOKEN (um token da conta, em supabase.com/dashboard/account/tokens) com
#   SUPABASE_PROJECT_REF: pela API de gerenciamento do Supabase, sem a senha do banco.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
# shellcheck source=scripts/backup/comum.sh
. "$RAIZ/scripts/backup/comum.sh"

TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  MODO=psql
  PSQL="$(programa_pg psql)"
elif [ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -n "${SUPABASE_PROJECT_REF:-}" ]; then
  MODO=api
  if ! [[ "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
    echo "SUPABASE_PROJECT_REF não parece o código de um projeto do Supabase." >&2
    exit 1
  fi
else
  echo "Falta SUPABASE_DB_URL, ou SUPABASE_ACCESS_TOKEN com SUPABASE_PROJECT_REF." >&2
  exit 1
fi

# Roda um arquivo de SQL no banco (sem devolver linhas; erro = sai com falha e a mensagem do banco).
rodar_sql() {
  local arquivo="$1"
  if [ "$MODO" = psql ]; then
    "$PSQL" "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$arquivo"
    return
  fi
  local corpo="$TEMP/corpo.json" resposta="$TEMP/resposta.json" codigo
  jq -n --rawfile q "$arquivo" '{query: $q}' > "$corpo"
  codigo="$(curl -sS -o "$resposta" -w '%{http_code}' -X POST \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
    --data-binary @"$corpo")" || codigo=000
  if [ "$codigo" -lt 200 ] || [ "$codigo" -ge 300 ]; then
    echo "O banco recusou (HTTP $codigo): $(head -c 3000 "$resposta" 2>/dev/null)" >&2
    return 1
  fi
}

# As versões que o banco já tem, uma por linha.
versoes_aplicadas() {
  local consulta="select version from supabase_migrations.schema_migrations"
  if [ "$MODO" = psql ]; then
    "$PSQL" "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -At -c "$consulta"
    return
  fi
  local corpo="$TEMP/corpo.json" resposta="$TEMP/resposta.json" codigo
  jq -n --arg q "$consulta" '{query: $q}' > "$corpo"
  codigo="$(curl -sS -o "$resposta" -w '%{http_code}' -X POST \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' \
    --data-binary @"$corpo")" || codigo=000
  if [ "$codigo" -lt 200 ] || [ "$codigo" -ge 300 ]; then
    echo "Não deu para ler as migrações do banco (HTTP $codigo): $(head -c 3000 "$resposta" 2>/dev/null)" >&2
    return 1
  fi
  jq -r '.[].version' "$resposta"
}

# O SQL de uma migração com o registro dela, numa transação só.
montar_sql() {
  local arquivo="$1" versao="$2" nome="$3" saida="$4"
  if grep -qF '$revisai_conteudo$' "$arquivo"; then
    echo "$(basename "$arquivo") tem o marcador \$revisai_conteudo\$ e não dá para registrar." >&2
    return 1
  fi
  {
    printf 'begin;\n'
    cat "$arquivo"
    printf '\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements)\n'
    printf "values ('%s', '%s', array[\$revisai_conteudo\$" "$versao" "$nome"
    cat "$arquivo"
    printf '$revisai_conteudo$]);\ncommit;\n'
  } > "$saida"
}

aplicadas="$(versoes_aplicadas)"
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
  if ! [[ "$versao" =~ ^[0-9]{14}$ && "$nome" =~ ^[a-z0-9_]+$ ]]; then
    echo "Nome de migração fora do padrão: $base" >&2
    exit 1
  fi
  echo "== $base"
  montar_sql "$arquivo" "$versao" "$nome" "$TEMP/migracao.sql"
  rodar_sql "$TEMP/migracao.sql"
done
echo "Pronto: ${#pendentes[@]} migrações aplicadas."
