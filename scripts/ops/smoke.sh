#!/bin/zsh
# Read-only smoke checks of the live site after a deploy.
SITE=https://hireflownow.com
FN=https://yqklrkpptnhubsnijqze.supabase.co/functions/v1
KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-$(grep -h "^VITE_SUPABASE_PUBLISHABLE_KEY=" .env .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"")}"
echo "missing guide: $(curl -s -o /dev/null -w '%{http_code}' $SITE/blog/no-such-guide-xyz)"
echo "a guide: $(curl -s -o /dev/null -w '%{http_code}' $SITE/blog)"
for p in open-jobs privacy terms; do
  h="$(curl -s $SITE/$p)"
  echo "/$p: $(print -r -- "$h" | grep -o '<title>[^<]*</title>' | head -1) canonical=$(print -r -- "$h" | grep -o 'rel="canonical" href="[^"]*"' | head -1)"
done
g="$(curl -s $SITE/blog)"; echo "guide fonts script: $(print -r -- "$g" | grep -c 'blog-fonts.js')  blocking font link outside noscript: $(print -r -- "$g" | sed 's#<noscript>.*</noscript>##' | grep -c '<link rel="stylesheet" href="https://fonts.googleapis.com')"
echo "verify unknown code: $(curl -s -X POST -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{"documentCode":"DOC-NOPE"}' $FN/verify-document | head -c 160)"
echo "video intro signed out: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{}' $FN/complete-video-intro)"
echo "notification email signed out: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{"type":"status_hired"}' $FN/send-notification-email)"
echo "document-signing signed out: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{"action":"download"}' $FN/document-signing)"
echo "generate-flow signed out: $(curl -s -o /dev/null -w '%{http_code}' -X POST -H "apikey: $KEY" -H 'Content-Type: application/json' -d '{}' $FN/generate-flow)"
echo "front page: $(curl -s -o /dev/null -w '%{http_code}' $SITE/)  staff auth: $(curl -s -o /dev/null -w '%{http_code}' https://staff.hireflownow.com/auth)"
