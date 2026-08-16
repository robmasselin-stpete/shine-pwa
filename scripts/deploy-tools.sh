#!/usr/bin/env bash
# deploy-tools.sh — publish the editor tools to Cloudflare Pages so they're reachable
# from the iPad in the field (cellular), no Mac / no VPN needed.
#
# Bundles: tools/*.html + a CURRENT snapshot of js/data.js, js/routes.js, and the
# data/murals/*.yaml the yaml-editor loads. Re-run any time to refresh the snapshot.
#
# Requires wrangler authenticated (npx wrangler whoami).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="mural-tools"
OUT="$(mktemp -d)/mural-tools"
mkdir -p "$OUT/tools" "$OUT/js" "$OUT/data/murals"

# tools (exclude nothing — index.html is the dashboard)
cp tools/*.html "$OUT/tools/"
# current data the tools import
cp js/data.js js/routes.js "$OUT/js/"
# yaml-editor loads these directly
cp data/murals/*.yaml data/murals/_index.json "$OUT/data/murals/"
# Root → the real dashboard at /tools/ (whose relative links resolve correctly).
# Do NOT copy index.html to root: its links are relative to /tools/, so they 404 from root.
printf '/    /tools/    302\n' > "$OUT/_redirects"

echo "→ deploying $(ls "$OUT/tools" | wc -l | tr -d ' ') tool pages + data snapshot to Cloudflare Pages ($PROJECT)…"
npx wrangler pages deploy "$OUT" --project-name "$PROJECT" --commit-dirty=true
echo "✓ done. Root = dashboard; tools also at /tools/"
