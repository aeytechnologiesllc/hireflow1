#!/bin/bash
# Pass B in one go (scripts/ops/README.md). Usage: scripts/ops/fullsuite.sh [repo]
cd "${1:-$(dirname "$0")/../..}"
echo "guards: $(node scripts/guardrails.mjs 2>&1 | tail -1)"
echo "typecheck: $(npm run -s typecheck:ratchet 2>&1 | grep -a "typecheck errors" | tail -1)"
npm run -s build >/dev/null 2>&1; echo "build exit $?"
echo "deno: $(node scripts/deno_check_functions.mjs 2>&1 | grep -a "checked," | tail -1)"
fails=""; n=0
for f in $(ls scripts/*.test.mjs scripts/*pglite*.mjs 2>/dev/null | sort -u); do
  n=$((n+1))
  node "$f" >/dev/null 2>&1 || fails="$fails $f"
done
echo "tests ran $n; FAILED:$fails"
