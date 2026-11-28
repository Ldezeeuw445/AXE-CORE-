#!/bin/bash
# Install or refresh the AXE Core /cron/tick crontab line.
# Called from deploy.sh step 7.
#
# The crontab must call the VPS wrapper, which reads the secret itself.
# This script never writes CRON_SECRET (or any other secret) into crontab,
# never reads $INSTALL_DIR/.env, and never creates or changes the wrapper
# or /etc/axe/cron.env — those are maintained on the VPS.
#
# Idempotent: previous /cron/tick curl lines and wrapper lines are removed,
# then the wrapper line is added once.
#
# Override paths in tests with AXE_CRON_WRAPPER and AXE_CRON_ENV.

set -euo pipefail

TICK_WRAPPER="${AXE_CRON_WRAPPER:-/usr/local/sbin/axe-core-cron-tick}"
CRON_ENV="${AXE_CRON_ENV:-/etc/axe/cron.env}"
TICK_LINE="* * * * * $TICK_WRAPPER >/dev/null 2>&1"

if [ -x "$TICK_WRAPPER" ] && [ -s "$CRON_ENV" ]; then
  echo "→ Installing /cron/tick crontab via $TICK_WRAPPER (every minute)..."
  # Drop old plaintext curl ticks and any previous wrapper line (with or without
  # a >/dev/null redirect), then add the quiet wrapper line once. Keep the rest.
  ( crontab -l 2>/dev/null | grep -vF '/cron/tick' | grep -vF "$TICK_WRAPPER" || true
    echo "$TICK_LINE"
  ) | crontab -
  echo "  Scheduler: crontab calls $TICK_WRAPPER"
  exit 0
fi

echo "⚠️  Cannot install the /cron/tick crontab: wrapper or secret file missing."
if [ ! -x "$TICK_WRAPPER" ]; then
  echo "    Missing or not executable: $TICK_WRAPPER"
fi
if [ ! -s "$CRON_ENV" ]; then
  echo "    Missing or empty: $CRON_ENV"
fi
echo "    Not falling back to a plaintext secret in crontab, and not reading CRON_SECRET from .env."
echo "    Leave the existing wrapper and $CRON_ENV as they are, then re-run deploy once both are present."
exit 0
