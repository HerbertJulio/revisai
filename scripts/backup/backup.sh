#!/usr/bin/env bash
# Cópia de segurança do banco do Revisaí, cifrada.
#
#   SUPABASE_DB_URL=postgresql://... BACKUP_SENHA=... scripts/backup/backup.sh [arquivo.dump.gpg]
#
# Copia os esquemas do app (public e privado) e os usuários do login (auth) no formato do pg_dump
# (custom, comprimido) e cifra com gpg (AES-256, com a senha de BACKUP_SENHA) antes de gravar:
# a cópia nunca fica em disco sem cifra. Sessões, códigos de entrada e o log do login ficam de fora
# (são segredos e não servem para restaurar). As fotos do Storage não entram.
#
# SUPABASE_DB_URL: a conexão do "Session pooler" do Supabase (porta 5432). A conexão direta só tem
# IPv6, que os servidores do GitHub não têm. Para restaurar: scripts/backup/restaurar.sh.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/backup/comum.sh
. "$AQUI/comum.sh"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Falta SUPABASE_DB_URL (a conexão do Session pooler do Supabase)." >&2
  exit 1
fi
exigir_senha

saida="${1:-revisai-$(date -u +%Y-%m-%dT%H%MZ).dump.gpg}"
mkdir -p "$(dirname "$saida")"
PG_DUMP="$(programa_pg pg_dump)"

# se algo falhar no meio, não sobra cópia pela metade
apagar_se_falhou() {
  local status=$?
  if [ "$status" -ne 0 ]; then rm -f "$saida"; fi
  exit "$status"
}
trap apagar_se_falhou EXIT

"$PG_DUMP" --dbname="$SUPABASE_DB_URL" --format=custom --compress=6 --no-owner --no-privileges \
  --schema=public --schema=privado --schema=auth \
  --exclude-table-data=auth.sessions --exclude-table-data=auth.refresh_tokens \
  --exclude-table-data=auth.one_time_tokens --exclude-table-data=auth.flow_state \
  --exclude-table-data=auth.audit_log_entries --exclude-table-data=auth.mfa_challenges \
  --exclude-table-data=auth.mfa_amr_claims --exclude-table-data=auth.saml_relay_states |
  gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 --compress-algo none \
    --passphrase-fd 3 --output "$saida" 3< <(printf '%s' "$BACKUP_SENHA")

tamanho="$(stat -c %s "$saida")"
if [ "$tamanho" -lt 1024 ]; then
  echo "A cópia ficou pequena demais ($tamanho bytes): confira a conexão." >&2
  exit 1
fi
echo "Cópia cifrada: $saida ($(numfmt --to=iec "$tamanho"))"
