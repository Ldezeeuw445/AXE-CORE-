#!/bin/bash
# =============================================================
# AXE CORE — n8n VPS Setup Script
# Run on Hetzner VPS (89.167.78.6) as root or sudo user
# =============================================================
set -e

echo "=== AXE CORE: n8n VPS Setup ==="

# 1. Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $USER
fi

# 2. Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
  echo "Installing Docker Compose..."
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# 3. Create n8n directory
mkdir -p /opt/axe-n8n
cd /opt/axe-n8n

# 4. Generate random encryption key if not set
if [ ! -f .env ]; then
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  echo "N8N_PASSWORD=axecore_$(openssl rand -hex 8)" > .env
  echo "N8N_ENCRYPTION_KEY=$ENCRYPTION_KEY" >> .env
  echo ".env created:"
  cat .env
fi

# 5. Copy docker-compose (paste the content or scp it)
cat > docker-compose.yml << 'COMPOSE'
version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    container_name: axe-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=axecore
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - N8N_HOST=n8n.axecompanion.com
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.axecompanion.com
      - N8N_SECURE_COOKIE=true
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - GENERIC_TIMEZONE=Europe/Amsterdam
      - TZ=Europe/Amsterdam
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=336
    volumes:
      - n8n_data:/home/node/.n8n
volumes:
  n8n_data:
COMPOSE

# 6. Start n8n
echo "Starting n8n..."
docker-compose --env-file .env up -d

echo ""
echo "=== n8n is now running on port 5678 ==="
echo "Next steps:"
echo "1. Point n8n.axecompanion.com DNS → 89.167.78.6"
echo "2. Run: sudo certbot --nginx -d n8n.axecompanion.com"
echo "3. Copy nginx-n8n.conf to /etc/nginx/sites-available/n8n"
echo "4. sudo ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/"
echo "5. sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Then get the n8n API key from:"
echo "  https://n8n.axecompanion.com/settings/api"
echo ""
echo "Add to Vercel:"
echo "  VITE_N8N_URL=https://n8n.axecompanion.com"
echo "  VITE_N8N_API_KEY=<api key from n8n settings>"
