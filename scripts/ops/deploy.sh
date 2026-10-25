#!/bin/zsh
# Deploys edge functions with the CLI's own saved token passed by environment
# (the CLI's keychain read hangs since 2026-10-25 ~02:40). Never prints it.
cd "$(dirname "$0")/../.."
T="$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null)"
case "$T" in go-keyring-base64:*) T="$(printf %s "${T#go-keyring-base64:}" | base64 -d)";; esac
export SUPABASE_ACCESS_TOKEN="$T"
for f in "$@"; do
  out="$(npx supabase functions deploy "$f" --use-api --project-ref yqklrkpptnhubsnijqze 2>&1)"
  if print -r -- "$out" | grep -q '"message":"Deployed Functions."'; then echo "$f: deployed"; else echo "$f: FAILED"; print -r -- "$out" | tail -3; fi
done
