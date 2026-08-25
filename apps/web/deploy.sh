#!/usr/bin/env bash
# Deploy Post Writer to mf (tailnet-only) and apply migrations.
# Builds the plugin first so the site serves the current .snplg.
# Guards against accidentally hitting real Cloudflare with --env procdev.
#   deploy.sh                 build plugin + deploy + migrate
#   deploy.sh --no-plugin     deploy + migrate with whatever .snplg is in public/
#   deploy.sh --migrate-only
set -euo pipefail
cd "$(dirname "$0")"
export CLOUDFLARE_API_BASE_URL="${CLOUDFLARE_API_BASE_URL:-https://mf.tailb55c1.ts.net/client/v4}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-x}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-proc-dev}"
case "$CLOUDFLARE_API_BASE_URL" in
  *tailb55c1.ts.net*) ;;
  *) echo "refusing: CLOUDFLARE_API_BASE_URL must point at mf" >&2; exit 1 ;;
esac
if [ "${1:-}" != "--migrate-only" ]; then
  if [ "${1:-}" != "--no-plugin" ]; then
    bash ../../plugin/buildPlugin.sh >/dev/null
    cp ../../plugin/build/outputs/postwriter.snplg public/postwriter.snplg
  fi
  bunx wrangler deploy --env procdev
fi
bunx wrangler d1 migrations apply notedrop --remote --env procdev
echo "OK: https://postwriter.tailb55c1.ts.net"
