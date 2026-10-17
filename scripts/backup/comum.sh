# Funções das cópias de segurança (backup.sh e restaurar.sh). Não roda sozinho: é carregado por eles.

# O programa do Postgres na versão mais nova instalada (o cliente precisa ser igual ou mais novo
# que o servidor). No GitHub, instalar-cliente-pg.sh põe o 17 em /usr/lib/postgresql/17.
programa_pg() {
  local v
  for v in 18 17; do
    if [ -x "/usr/lib/postgresql/$v/bin/$1" ]; then
      echo "/usr/lib/postgresql/$v/bin/$1"
      return
    fi
  done
  command -v "$1" || { echo "falta o programa $1 (instale o cliente do Postgres)" >&2; return 1; }
}

# A senha da cópia vai para o gpg por um descritor de arquivo, nunca pela linha de comando.
exigir_senha() {
  if [ -z "${BACKUP_SENHA:-}" ]; then
    echo "Falta BACKUP_SENHA (a senha das cópias)." >&2
    exit 1
  fi
  if [ "${#BACKUP_SENHA}" -lt 20 ]; then
    echo "BACKUP_SENHA precisa ter pelo menos 20 caracteres." >&2
    exit 1
  fi
}

# Lê o SQL que o pg_restore escreve e devolve "esquema.tabela linhas" de cada bloco COPY.
contar_linhas() {
  awk '/^COPY [^ ]+ /{ tabela = $2; n = 0; dentro = 1; next }
       dentro && /^\\\.$/ { print tabela, n; dentro = 0; next }
       dentro { n++ }'
}
