#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="hostinger"
REMOTE_DIR="/home/deploy/twitter-agents/beef"

echo "=== $BEEF Deploy ==="

# Step 1: Local typecheck
echo "[1/4] Running typecheck..."
pnpm typecheck

# Step 2: Push to origin
echo "[2/4] Pushing to origin..."
git push origin main

# Step 3: Pull + install + reload on VPS
echo "[3/4] Deploying on VPS..."
ssh "$VPS_HOST" bash -s "$REMOTE_DIR" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
cd "$REMOTE_DIR/.."

git pull --ff-only

cd "$REMOTE_DIR"
pnpm install --frozen-lockfile

# Reload or start
if pm2 describe beef-bot > /dev/null 2>&1; then
  pm2 reload beef-bot --update-env
  echo "PM2: reloaded beef-bot"
else
  pm2 start ecosystem.config.cjs --env production
  echo "PM2: started beef-bot (first deploy)"
fi
REMOTE

# Step 4: Smoke check
echo "[4/4] Smoke check..."
sleep 3
STATUS=$(ssh "$VPS_HOST" "pm2 jlist" | python3 -c "
import sys, json
apps = json.load(sys.stdin)
for a in apps:
    if a['name'] == 'beef-bot':
        print(a['pm2_env']['status'])
        break
else:
    print('not_found')
")

if [ "$STATUS" = "online" ]; then
  echo "=== Deploy successful! beef-bot is online ==="
else
  echo "=== Deploy FAILED! Status: $STATUS ==="
  echo "Last 20 log lines:"
  ssh "$VPS_HOST" "pm2 logs beef-bot --lines 20 --nostream"
  exit 1
fi
