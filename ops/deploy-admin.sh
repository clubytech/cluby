#!/usr/bin/env bash
# Redeploy the operations console.
#
# It lives in its own Vercel project and as a PREVIEW deployment, not a production one, and both of
# those are deliberate.
#
#   Its own project, because `cluby.cash/admin` was a guessable path on the public site. Nothing
#   there can act — every button ends in a transaction the Safe signs — but a page that looks like a
#   protocol's control panel is a gift to anyone who wants to screenshot one for a phishing post.
#
#   A preview deployment, because Vercel Authentication is not offered for production on this plan
#   and IS offered for previews. That is the actual lock: an unauthenticated request is bounced to a
#   Vercel login rather than served. The obscure hostname is worth what obscurity is worth, which is
#   keeping it out of casual sight, and it is not relied on for anything else.
#
# The alias is reassigned on every run because a preview URL is per-deployment; without this step
# the bookmark would still point at the previous build.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="cluby-993-ops"
ALIAS="cluby-993-ops.vercel.app"

MAIN=$(cat .vercel/project.json)
restore() { printf '%s' "$MAIN" > .vercel/project.json; echo "relinked to the public project"; }
trap restore EXIT

vercel link --project "$PROJECT" --yes >/dev/null
rm -f .env.local   # `vercel link` writes one at the root; the app reads apps/web/.env.local

URL=$(vercel --yes 2>&1 | python3 -c "import re,sys; m=re.search(r'\"url\": \"([^\"]+)\"', sys.stdin.read()); print(m.group(1) if m else '')")
[ -n "$URL" ] || { echo "deploy produced no URL" >&2; exit 1; }
vercel alias set "$URL" "$ALIAS" >/dev/null

CODE=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "https://$ALIAS/admin")
echo "https://$ALIAS/admin -> $CODE"
# 200 would mean the protection is off and the console is being served to anyone who asks.
[ "$CODE" = "200" ] && { echo "REFUSING TO CALL THIS DONE: the console answered without authentication." >&2; exit 1; }
echo "protected (an unauthenticated request is bounced to a Vercel login)"
