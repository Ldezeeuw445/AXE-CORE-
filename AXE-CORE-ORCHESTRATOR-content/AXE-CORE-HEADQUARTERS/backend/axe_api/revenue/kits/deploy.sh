#!/usr/bin/env bash
# Render the free journal tool and publish it to Cloudflare Pages.
#
#   ./deploy.sh                                   # first run: creates the project
#   ./deploy.sh --url https://buy.example/kit     # with a link to the paid rung
#
# Why Cloudflare Pages: the tool is one self-contained HTML file with no build
# step and no external requests, so it needs a static host and nothing else.
# Pages' free tier has unlimited bandwidth, does not pause, and serves
# `journal.html` at `/journal` without any rewrite config.
#
# Everything here runs from the terminal. The only browser step is a one-time
# `wrangler login`, which opens a tab to authorise the CLI against your own
# Cloudflare account — no credentials are stored in this repo.

set -euo pipefail

PROJECT="${PROJECT:-trade-journal-tool}"
NAME="${NAME:-Trade Journal Report}"
BRAND="${BRAND:-AXE CORE}"
OFFER_URL=""
OFFER_LABEL="${OFFER_LABEL:-Get the full kit}"
OUT_DIR="${OUT_DIR:-$(mktemp -d)/site}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)     OFFER_URL="$2"; shift 2 ;;
    --label)   OFFER_LABEL="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --name)    NAME="$2"; shift 2 ;;
    --brand)   BRAND="$2"; shift 2 ;;
    --out)     OUT_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# Run from the axe_api directory so `python -m revenue.cli` resolves.
cd "$(dirname "$0")/../.."

mkdir -p "$OUT_DIR"
echo "→ rendering the tool"
python3 -m revenue.cli kit-web \
  --out "$OUT_DIR/journal.html" \
  --name "$NAME" \
  ${OFFER_URL:+--url "$OFFER_URL"} \
  ${OFFER_URL:+--label "$OFFER_LABEL"}

# Pages serves index.html at the root; the same file at both paths means the
# bare domain works as well as /journal.
cp "$OUT_DIR/journal.html" "$OUT_DIR/index.html"

if [[ -n "${DRY_RUN:-}" ]]; then
  echo "→ dry run: built $OUT_DIR, not deploying"
  ls -la "$OUT_DIR"
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found — install Node.js first (https://nodejs.org)" >&2
  exit 1
fi

echo "→ deploying to Cloudflare Pages as '$PROJECT'"
echo "  (first run: wrangler will ask you to log in, once)"
npx --yes wrangler@latest pages deploy "$OUT_DIR" \
  --project-name "$PROJECT" \
  --commit-dirty=true

cat <<EOF

Done. The tool is live on the URL printed above.

Next:
  1. Open it, drop in your own broker CSV, check the numbers look right.
  2. Add a custom subdomain (tools.<your-domain>) in the Pages dashboard under
     Custom domains — this leaves any other hosting you have untouched.
  3. When you have a payment link, re-run with --url to put it in the footer.
EOF
