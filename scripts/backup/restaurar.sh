#!/usr/bin/env bash
# Restaura uma cópia feita por backup.sh.
#
#   BACKUP_SENHA=... scripts/backup/restaurar.sh arquivo.dump.gpg [--verificar]
#
# Decifra a cópia, apaga os dados atuais das tabelas que estão nela e carrega os dados da cópia,
# tudo numa transação só: ou entra tudo, ou nada muda. Os gatilhos não disparam durante a carga
# (session_replication_role = replica), então nenhum aviso sai de novo e nada é recalculado.
# Com --verificar, confere no fim se cada tabela ficou com o mesmo número de linhas da cópia.
#
# O banco de destino vem de BANCO_URL (padrão: o Supabase local de scripts/supabase-local) e
# precisa já ter as tabelas: as migrações de supabase/migrations aplicadas em ordem. Para um banco
# que não é local, exija-se também CONFIRMO_APAGAR_O_BANCO=sim, porque os dados atuais somem.
#
# Num projeto novo do Supabase: aplique as migrações, rode este script com BANCO_URL do projeto
# novo (Session pooler) e troque na Vercel o SUPABASE_URL e a chave pública pelas do projeto novo.
# A chave do sistema e a configuração dos avisos voltam com a cópia (esquema privado).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/backup/comum.sh
. "$AQUI/comum.sh"

arquivo="${1:-}"
verificar="${2:-}"
if [ -z "$arquivo" ] || [ ! -f "$arquivo" ]; then
  echo "uso: restaurar.sh arquivo.dump.gpg [--verificar]" >&2
  exit 1
fi
exigir_senha
BANCO_URL="${BANCO_URL:-postgres://postgres@127.0.0.1:54322/postgres}"

case "$BANCO_URL" in
  *@127.0.0.1:* | *@127.0.0.1/* | *@localhost:* | *@localhost/*) ;;
  *)
    if [ "${CONFIRMO_APAGAR_O_BANCO:-}" != "sim" ]; then
      echo "O destino não é o banco local. Para apagar os dados dele e restaurar a cópia, use CONFIRMO_APAGAR_O_BANCO=sim." >&2
      exit 1
    fi
    ;;
esac

PG_RESTORE="$(programa_pg pg_restore)"
PSQL="$(programa_pg psql)"
psql_destino() { "$PSQL" -X -q -v ON_ERROR_STOP=1 --dbname="$BANCO_URL" "$@"; }

tmp="$(mktemp -d)"
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT
gpg --batch --yes --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 --output "$tmp/copia.dump" "$arquivo" 3< <(printf '%s' "$BACKUP_SENHA")

# o que vai entrar: os usuários do login (sem sessões) e os esquemas do app
LOGIN=(--schema=auth --table=users --table=identities --table=mfa_factors)
APP=(--schema=public --schema=privado)
"$PG_RESTORE" --data-only "${LOGIN[@]}" --file=- "$tmp/copia.dump" | contar_linhas > "$tmp/login.txt"
"$PG_RESTORE" --data-only "${APP[@]}" --file=- "$tmp/copia.dump" | contar_linhas > "$tmp/app.txt"
cat "$tmp/login.txt" "$tmp/app.txt" > "$tmp/tabelas.txt"

if ! grep -q '^auth\.users ' "$tmp/tabelas.txt" || ! grep -q '^public\.oficinas ' "$tmp/tabelas.txt"; then
  echo "A cópia não tem as tabelas esperadas (auth.users e public.oficinas)." >&2
  exit 1
fi

# todas as tabelas da cópia precisam existir no destino
faltam="$(cut -d' ' -f1 "$tmp/tabelas.txt" | while read -r t; do
  [ "$(psql_destino -At -c "select to_regclass('$t') is not null")" = "t" ] || echo "$t"
done)"
if [ -n "$faltam" ]; then
  echo "Estas tabelas da cópia não existem no destino (aplique as migrações antes):" >&2
  echo "$faltam" >&2
  exit 1
fi
lista="$(cut -d' ' -f1 "$tmp/tabelas.txt" | paste -sd, -)"

{
  echo "set client_min_messages = warning;"
  echo "set session_replication_role = replica;"
  echo "truncate table $lista restart identity cascade;"
  "$PG_RESTORE" --data-only "${LOGIN[@]}" --file=- "$tmp/copia.dump"
  "$PG_RESTORE" --data-only "${APP[@]}" --file=- "$tmp/copia.dump"
} | psql_destino --single-transaction --file=- > /dev/null

echo "Restaurado: $(wc -l < "$tmp/tabelas.txt") tabelas."

if [ "$verificar" = "--verificar" ]; then
  diferentes=0
  while read -r tabela esperado; do
    achou="$(psql_destino -At -c "select count(*) from $tabela")"
    if [ "$achou" != "$esperado" ]; then
      echo "Diferente: $tabela (cópia $esperado, banco $achou)" >&2
      diferentes=$((diferentes + 1))
    fi
  done < "$tmp/tabelas.txt"
  if ! awk '$2 > 0 { achou = 1 } END { exit !achou }' "$tmp/app.txt"; then
    echo "A cópia não tem nenhuma linha do app." >&2
    diferentes=$((diferentes + 1))
  fi
  if [ "$diferentes" -gt 0 ]; then
    echo "A conferência falhou em $diferentes ponto(s)." >&2
    exit 1
  fi
  echo "Conferido: cada tabela tem as mesmas linhas da cópia."
fi
