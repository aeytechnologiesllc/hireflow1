#!/bin/zsh
# Applies one migration file through the Management API (recorded in
# supabase_migrations.schema_migrations under NAME). Never prints the token.
# Usage: scripts/ops/apply_migration.sh <file> <name>
set -e
T="$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null)"
case "$T" in go-keyring-base64:*) T="$(printf %s "${T#go-keyring-base64:}" | base64 -d)";; esac
OUT="$(mktemp)"
body="$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read(), "name": sys.argv[2]}))' "$1" "$2")"
code=$(curl -s -o "$OUT" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  --data-binary "$body" "https://api.supabase.com/v1/projects/yqklrkpptnhubsnijqze/database/migrations")
echo "HTTP $code"
head -c 1500 "$OUT"; echo
rm -f "$OUT"
