#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="beef-vps"
REPO_URL="git@github.com:nikitacometa/twitter-agents.git"
REMOTE_DIR="/home/deploy/twitter-agents"
BEEF_DIR="$REMOTE_DIR/beef"

echo "=== $BEEF VPS Setup ==="

# Step 1: Test SSH
echo "[1/7] Testing SSH connection..."
ssh -o ConnectTimeout=10 "$VPS_HOST" "echo 'SSH OK: $(hostname)'"

# Step 2: Install pnpm
echo "[2/7] Installing pnpm..."
ssh "$VPS_HOST" bash <<'REMOTE'
if command -v pnpm &> /dev/null; then
  echo "pnpm already installed: $(pnpm --version)"
else
  npm install -g pnpm
  echo "pnpm installed: $(pnpm --version)"
fi
REMOTE

# Step 3: Verify GitHub SSH access
echo "[3/7] Verifying GitHub SSH access..."
ssh "$VPS_HOST" "ssh -T git@github.com 2>&1 || true" | head -3

# Step 4: Clone repo (if not exists)
echo "[4/7] Setting up repository..."
ssh "$VPS_HOST" bash -s "$REMOTE_DIR" "$REPO_URL" <<'REMOTE'
REMOTE_DIR="$1"
REPO_URL="$2"
if [ -d "$REMOTE_DIR/.git" ]; then
  echo "Repo already cloned at $REMOTE_DIR"
  cd "$REMOTE_DIR" && git pull --ff-only
else
  git clone "$REPO_URL" "$REMOTE_DIR"
  echo "Repo cloned to $REMOTE_DIR"
fi
REMOTE

# Step 5: Install dependencies
echo "[5/7] Installing dependencies..."
ssh "$VPS_HOST" "cd '$BEEF_DIR' && pnpm install"

# Step 6: Create data dir + env file
echo "[6/7] Setting up data dir and env..."
ssh "$VPS_HOST" bash -s "$BEEF_DIR" <<'REMOTE'
BEEF_DIR="$1"
mkdir -p "$BEEF_DIR/data"
if [ ! -f "$BEEF_DIR/.env" ]; then
  cp "$BEEF_DIR/.env.production.example" "$BEEF_DIR/.env"
  echo "Created .env from template — FILL IN VALUES MANUALLY"
else
  echo ".env already exists"
fi
REMOTE

# Step 7: PM2 startup
echo "[7/7] Configuring PM2 startup..."
ssh "$VPS_HOST" bash <<'REMOTE'
pm2 startup 2>&1 | tail -1
pm2 save
echo "PM2 startup configured"
REMOTE

echo ""
echo "=== Setup complete! ==="
echo "Next steps:"
echo "  1. Fill .env on VPS: ssh $VPS_HOST 'nano $BEEF_DIR/.env'"
echo "  2. Deploy: pnpm deploy"
