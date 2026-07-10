#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="axe-terminal-server"
CONTAINER_NAME="axe-terminal-server"

docker build -f AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/infra/terminal/Dockerfile -t "${IMAGE_NAME}:latest" .

docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p 127.0.0.1:4022:4022 \
  -e AXE_TERMINAL_BIND_HOST=0.0.0.0 \
  -e AXE_TERMINAL_ALLOWED_ORIGINS="https://axe-core-rust.vercel.app,https://axecompanion.com,https://api.axecompanion.com,http://localhost:5173,http://127.0.0.1:5173" \
  "${IMAGE_NAME}:latest"
