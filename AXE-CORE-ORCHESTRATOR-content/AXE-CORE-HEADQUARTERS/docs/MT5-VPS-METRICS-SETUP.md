# One-time setup: VPS MT5 host metrics

Luka's approval is required before any of these steps. Do not merge the PRs,
deploy, or change either VPS until he says yes. Nothing here starts, stops or
configures MT5 or a broker session.

Goal: the System monitor row "VPS MT5" shows real CPU, RAM and disk, like the
other machines. AXE Core tries the bridge's `/host/metrics` first and falls
back to a read-only SSH probe. Numbers older than about two minutes are marked
stale. Empty rings stay empty: nothing is invented.

Do the steps in this order so the endpoint can start working before SSH is
ready.

## 1. Merge and ship the bridge (Companion repo, after Luka's yes)

Repo: `Ldezeeuw445/AXE-COMPANION-OS-`, path `services/mt5-bridge`. This is
owned by the Companion manager twin. Use `deploy/update.sh`, **not**
`install.sh` (install.sh restarts the terminal).

On a machine that already has the usual `~/.ssh/mt5_bridge` deploy key (do not
print or copy the private key):

```bash
# From a checkout of the merged main, at the repo root:
rsync -a -e "ssh -i ~/.ssh/mt5_bridge" services/mt5-bridge/ root@HOST:/opt/mt5-bridge/
ssh -i ~/.ssh/mt5_bridge root@HOST 'bash /opt/mt5-bridge/deploy/update.sh'
```

`HOST` is the Strato MT5 box. `update.sh` installs the metrics script and a 15
second timer, restarts **only the bridge**, and leaves the MT5 terminal
running. It prints `/health` and `/host/metrics` (percentages only). It must
not print tokens.

## 2. Add a read-only metrics token on the MT5 box

On the Strato MT5 box, as root. Do not echo the value, and do not reuse this
token as `MT5_BRIDGE_TOKEN` (the trading/data token).

```bash
# Generate a token (>= 32 characters). It is shown once; store it in a
# password manager, do not paste it into chat or tickets.
openssl rand -hex 32

# Add or replace the line. Keep the existing MT5_BRIDGE_TOKEN as it is.
# After this, /etc/mt5-bridge.env should contain:
#   MT5_BRIDGE_METRICS_TOKEN=<the value you just generated>
install -m 0640 -o root -g mt5 /etc/mt5-bridge.env /etc/mt5-bridge.env.bak-metrics
# Edit the file with visudo-like care (root:mt5, mode 0640):
# add the MT5_BRIDGE_METRICS_TOKEN line, do not change other secrets.
systemctl restart mt5-bridge
```

Check without printing secrets:

```bash
# Must be 401:
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/host/metrics
# Must be 200 and only ok/cpu/mem/disk/measured_at (use the metrics token,
# not shown here):
curl -s -m 10 -H "auth-token: $MT5_BRIDGE_METRICS_TOKEN" http://127.0.0.1:8765/host/metrics
# The metrics token must not open trading or account data (must be 401):
curl -s -o /dev/null -w "%{http_code}\n" -H "auth-token: $MT5_BRIDGE_METRICS_TOKEN" http://127.0.0.1:8765/status
```

The public `/health` URL stays unauthenticated and still returns only
`ok` and `trading`.

## 3. Put the same metrics token on the API VPS

On `212.227.91.79` (axe-core-api), add these names to `/opt/axe-core-api/.env`.
Do not print the file or the values. Prefer the dedicated metrics token, not
the trading token.

```bash
# MT5_BRIDGE_METRICS_URL=https://mt5-bridge.axecompanion.com/host/metrics
# MT5_BRIDGE_METRICS_TOKEN=<same value as on the MT5 box>
# AXE_MT5BRIDGE_SSH=mt5metrics@31.70.196.19
# AXE_MT5BRIDGE_KEY=   # only if the Mac mini's modelbox key is not at ~/.ssh/axe-core-vps
```

Do **not** restart or deploy the API until the AXE-CORE- PR is merged (step 6).
Setting the env vars early is fine.

## 4. Restricted SSH user on the Strato MT5 box (fallback)

This is the fallback if the HTTP endpoint is down. It must not be a login for
interactive use, and it must not be allowed to talk to MT5.

On the Strato MT5 box, as root:

```bash
id mt5metrics >/dev/null 2>&1 || adduser --disabled-password --gecos 'AXE host metrics' --shell /bin/bash mt5metrics
install -d -m 0700 -o mt5metrics -g mt5metrics /home/mt5metrics/.ssh
# The probe binary was installed in step 1:
test -x /usr/local/bin/mt5-host-metrics
```

On the **Mac mini**, show only the public key of the key already used for the
modelbox (default `~/.ssh/axe-core-vps.pub`). Do not display or copy the
private key.

```bash
# Mac mini, as the user that runs AXE Core:
ssh-keygen -y -f "${AXE_MODELBOX_KEY:-$HOME/.ssh/axe-core-vps}"
```

On the MT5 box, write `authorized_keys` for `mt5metrics` with that **public**
key, forced to the probe only. Replace `PUBLIC_KEY` with the single line from
the Mac mini (starts with `ssh-ed25519` or `ssh-rsa`):

```bash
# /home/mt5metrics/.ssh/authorized_keys  — one line, mode 0600, owner mt5metrics:
# command="/usr/local/bin/mt5-host-metrics",no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc PUBLIC_KEY
install -m 0600 -o mt5metrics -g mt5metrics /dev/null /home/mt5metrics/.ssh/authorized_keys
# Then edit that file and paste the command=… line above.
# No sudo, no other keys, no password.
```

`command=` ignores whatever the client sends and only runs `mt5-host-metrics`,
which prints `CPU` / `MEM` / `DISK` lines (and can write the JSON file). That
is the same format AXE Core already parses for the modelbox.

Optional check from the Mac mini (read-only, should print three lines, no
shell):

```bash
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "${AXE_MODELBOX_KEY:-$HOME/.ssh/axe-core-vps}" \
  -o ConnectTimeout=5 mt5metrics@31.70.196.19 'ignored'
```

If this opens an interactive shell, the `command=` restriction is missing —
fix that before calling the setup done.

## 5. Merge the AXE-CORE- PR (after Luka's yes)

Branch `feat/mt5-vps-metrics` → `orchestrator`. Do not deploy yet until this
merge is done.

## 6. Deploy axe-core-api and update the Macs

- Confirm the env vars from step 3 are on the API VPS.
- Deploy the API the usual way (the project's `deploy.sh` / `vps_sync.py`).
  Restart `axe-core-api` so it loads the new collector and env.
- Update both Macs in place with `npm run bijwerken` (signed "AXE Core dev",
  do not bypass the build guard). The Mac mini must run the new
  `/host/metrics?target=mt5bridge` for the SSH fallback, the same way it
  already measures the modelbox.

## 7. Check in the app

After one snapshot cycle (about 20 seconds): the System monitor row **VPS MT5**
shows percentages and a caption such as `endpoint · 12s`. If the endpoint is
down and SSH works: `SSH · 8s`. If both fail, the last good numbers stay
visible with `stale`. Rings must never show a number that was not measured.

`GET /status/vps-agents` can still be used to see whether the bridge itself
works (connected / health). That route does not include the new host metrics.
