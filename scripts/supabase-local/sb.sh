#!/usr/bin/env bash
# Supabase local, sem Docker: Postgres 17 + GoTrue (login) + PostgREST (API) + um gateway que
# imita o Storage e guarda os e-mails (os códigos de login) para os testes lerem.
#
#   scripts/supabase-local/sb.sh instalar   # baixa os programas (uma vez)
#   scripts/supabase-local/sb.sh reset      # banco do zero, com todas as migrações
#   scripts/supabase-local/sb.sh start | stop | migrar | psql [args]
#
# Depois: BANCO_TESTE_URL=postgres://postgres@127.0.0.1:54322/postgres npm test
# e o app com SUPABASE_URL=http://127.0.0.1:54321 e SUPABASE_PUBLISHABLE_KEY=sb_publishable_local.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/../.." && pwd)"
BASE="${SB_LOCAL:-$HOME/.revisai-supabase}"
PG="$BASE/pg/bin"
DADOS="$BASE/data"
LOGS="$DADOS/logs"
VERSAO_AUTH="${VERSAO_AUTH:-v2.197.0}"
VERSAO_REST="${VERSAO_REST:-v13.0.8}"
VERSAO_PG="${VERSAO_PG:-17.10.0-beta.17}"

# o Postgres não roda como root: usa um usuário próprio nesse caso
if [ "$(id -u)" = "0" ]; then
  id pgrun >/dev/null 2>&1 || useradd -m -s /bin/bash pgrun
  COMO_PG() { su pgrun -c "$*"; }
else
  COMO_PG() { bash -c "$*"; }
fi

chaves() {
  if [ ! -f "$BASE/chaves.json" ]; then
    mkdir -p "$BASE"
    node -e "
      const c=require('crypto');const s='local-'+c.randomBytes(24).toString('hex');
      const b=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
      const j=(p)=>{const h=b({alg:'HS256',typ:'JWT'});const x=b(p);return h+'.'+x+'.'+c.createHmac('sha256',s).update(h+'.'+x).digest('base64url')};
      require('fs').writeFileSync('$BASE/chaves.json',JSON.stringify({segredo:s,anon:j({iss:'supabase-local',role:'anon',iat:1700000000,exp:2000000000}),service:j({iss:'supabase-local',role:'service_role',iat:1700000000,exp:2000000000})},null,2));"
  fi
}

instalar() {
  mkdir -p "$BASE/tmp" "$DADOS"
  if [ ! -x "$PG/postgres" ]; then
    (cd "$BASE/tmp" && npm init -y >/dev/null && npm install --no-audit --no-fund "@embedded-postgres/linux-x64@$VERSAO_PG" >/dev/null)
    rm -rf "$BASE/pg" && cp -a "$BASE/tmp/node_modules/@embedded-postgres/linux-x64/native" "$BASE/pg"
  fi
  if [ ! -x "$BASE/auth" ]; then
    curl -fsSL -o "$BASE/tmp/auth.tar.gz" "https://github.com/supabase/auth/releases/download/$VERSAO_AUTH/auth-$VERSAO_AUTH-x86.tar.gz"
    tar xzf "$BASE/tmp/auth.tar.gz" -C "$BASE/tmp" && mv "$BASE/tmp/auth" "$BASE/auth" && rm -rf "$BASE/auth-migrations" && mv "$BASE/tmp/migrations" "$BASE/auth-migrations"
  fi
  if [ ! -x "$BASE/postgrest" ]; then
    curl -fsSL -o "$BASE/tmp/postgrest.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/$VERSAO_REST/postgrest-$VERSAO_REST-linux-static-x86-64.tar.xz"
    tar xJf "$BASE/tmp/postgrest.tar.xz" -C "$BASE"
  fi
  rm -rf "$BASE/tmp"
  chaves
  [ "$(id -u)" = "0" ] && chmod -R a+rX "$BASE" && chown -R pgrun "$DADOS"
  echo "instalado em $BASE"
}

segredo() { node -e "console.log(require('$BASE/chaves.json').segredo)"; }
psqlx() { psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 54322 -U postgres -d postgres "$@"; }

pg_inicia() {
  mkdir -p "$LOGS"
  [ "$(id -u)" = "0" ] && chown -R pgrun "$DADOS"
  if ! COMO_PG "$PG/pg_ctl -D $DADOS/pg status" >/dev/null 2>&1; then
    COMO_PG "$PG/pg_ctl -D $DADOS/pg -l $LOGS/pg.log -o '-p 54322 -c listen_addresses=127.0.0.1 -c wal_level=logical -c max_connections=200' start -w" >/dev/null
  fi
}

auth_inicia() {
  pkill -f "^$BASE/auth" 2>/dev/null || true
  local S; S="$(segredo)"
  (
    export GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1
    export GOTRUE_DB_DRIVER=postgres GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:54322/postgres?search_path=auth"
    export GOTRUE_DB_MIGRATIONS_PATH="$BASE/auth-migrations" GOTRUE_DB_NAMESPACE=auth
    export GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**,http://127.0.0.1:3000/**,http://localhost:3100/**,http://127.0.0.1:3100/**"
    export GOTRUE_JWT_SECRET="$S" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
    export GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_MAILER_OTP_EXP=3600 GOTRUE_MAILER_OTP_LENGTH=6
    export GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_USER=local GOTRUE_SMTP_PASS=local GOTRUE_SMTP_ADMIN_EMAIL=nao-responda@revisai.local GOTRUE_SMTP_SENDER_NAME=Revisai GOTRUE_SMTP_MAX_FREQUENCY=1ns
    export GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://127.0.0.1:54321/__templates/magic.html GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:54321/__templates/confirm.html
    export GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="Seu codigo do Revisai" GOTRUE_MAILER_SUBJECTS_CONFIRMATION="Seu codigo do Revisai"
    export GOTRUE_RATE_LIMIT_EMAIL_SENT=100000 GOTRUE_RATE_LIMIT_VERIFY=100000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 GOTRUE_RATE_LIMIT_OTP=100000
    export GOTRUE_MFA_TOTP_ENROLL_ENABLED=true GOTRUE_MFA_TOTP_VERIFY_ENABLED=true GOTRUE_MFA_MAX_ENROLLED_FACTORS=10
    export GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_LOG_LEVEL=warn
    nohup "$BASE/auth" > "$LOGS/auth.log" 2>&1 &
  )
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && return 0; sleep 0.5; done
  echo "o login (GoTrue) não subiu"; tail -20 "$LOGS/auth.log"; exit 1
}

rest_inicia() {
  pkill -f "^$BASE/postgrest" 2>/dev/null || true
  local S; S="$(segredo)"
  (
    export PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:54322/postgres" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon
    export PGRST_JWT_SECRET="$S" PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_EXTRA_SEARCH_PATH="public,extensions" PGRST_DB_CHANNEL_ENABLED=true PGRST_DB_MAX_ROWS=1000
    nohup "$BASE/postgrest" > "$LOGS/rest.log" 2>&1 &
  )
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:3001/ >/dev/null && return 0; sleep 0.5; done
  echo "a API (PostgREST) não subiu"; tail -20 "$LOGS/rest.log"; exit 1
}

gateway_inicia() {
  pkill -f "node $AQUI/gateway.mjs" 2>/dev/null || true
  SB_LOCAL="$BASE" nohup node "$AQUI/gateway.mjs" > "$LOGS/gateway.log" 2>&1 &
  for _ in $(seq 1 40); do curl -sf http://127.0.0.1:54321/__saude >/dev/null && return 0; sleep 0.25; done
  echo "o gateway não subiu"; tail -20 "$LOGS/gateway.log"; exit 1
}

migrar() {
  for f in "$REPO"/supabase/migrations/*.sql; do
    psqlx -1 -f "$f" > /dev/null || { echo "falhou: $f"; exit 1; }
  done
  if [ -f "$REPO/supabase/seed.sql" ]; then psqlx -1 -f "$REPO/supabase/seed.sql" > /dev/null; fi
  psqlx -c "notify pgrst, 'reload schema'"
}

parar() {
  pkill -f "^$BASE/auth" 2>/dev/null || true
  pkill -f "^$BASE/postgrest" 2>/dev/null || true
  pkill -f "node $AQUI/gateway.mjs" 2>/dev/null || true
  COMO_PG "$PG/pg_ctl -D $DADOS/pg stop -m fast" >/dev/null 2>&1 || true
}

case "${1:-start}" in
  instalar) instalar ;;
  reset)
    [ -x "$PG/postgres" ] || instalar
    chaves
    parar
    rm -rf "$DADOS/pg" "$DADOS/storage"
    mkdir -p "$LOGS"
    [ "$(id -u)" = "0" ] && chown -R pgrun "$DADOS"
    COMO_PG "$PG/initdb -D $DADOS/pg -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" > "$LOGS/initdb.log"
    pg_inicia
    psqlx -f "$AQUI/bootstrap.sql" > /dev/null
    gateway_inicia
    auth_inicia
    migrar
    rest_inicia
    echo pronto
    ;;
  start) pg_inicia; gateway_inicia; auth_inicia; rest_inicia; echo pronto ;;
  stop) parar; echo parado ;;
  migrar) migrar ;;
  psql) shift; psqlx "$@" ;;
  *) echo "uso: $0 instalar|reset|start|stop|migrar|psql"; exit 1 ;;
esac
