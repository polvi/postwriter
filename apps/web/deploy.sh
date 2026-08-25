#!/usr/bin/env bash
# Deploy notedrop to mf (tailnet-only) and apply migrations.
# Guards against accidentally hitting real Cloudflare with --env procdev.
set -euo pipefail
cd "$(dirname "$0")"
export CLOUDFLARE_API_BASE_URL="${CLOUDFLARE_API_BASE_URL:-https://mf.tailb55c1.ts.net/client/v4}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-x}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-proc-dev}"
case "$CLOUDFLARE_API_BASE_URL" in
  *tailb55c1.ts.net*) ;;
  *) echo "refusing: CLOUDFLARE_API_BASE_URL must point at mf" >&2; exit 1 ;;
esac
[ -f wrangler.jsonc ] || (cd ../../.. && bun run configure)
if [ "${1:-}" != "--migrate-only" ]; then
  bunx wrangler deploy --env procdev
fi
bunx wrangler d1 migrations apply notedrop --remote --env procdev
echo "OK: https://notedrop.tailb55c1.ts.net"
