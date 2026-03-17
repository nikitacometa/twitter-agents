#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="hostinger"
REMOTE_DIR="/home/deploy/twitter-agents/beef"
LOCAL_DATA="data"

usage() {
  echo "Usage: $0 <pull|pull-feedback>"
  echo "  pull           — Download full prod DB snapshot as data/beef-prod.db"
  echo "  pull-feedback  — Export human_feedback table as JSONL"
  exit 1
}

[ $# -lt 1 ] && usage

case "$1" in
  pull)
    echo "=== Syncing prod DB snapshot ==="

    # WAL checkpoint for consistency
    echo "[1/3] WAL checkpoint on VPS..."
    ssh "$VPS_HOST" "sqlite3 '$REMOTE_DIR/data/beef.db' 'PRAGMA wal_checkpoint(TRUNCATE);'"

    # Backup previous snapshot
    if [ -f "$LOCAL_DATA/beef-prod.db" ]; then
      BACKUP="$LOCAL_DATA/beef-prod.db.bak.$(date +%Y%m%d-%H%M%S)"
      echo "[2/3] Backing up previous snapshot → $BACKUP"
      mv "$LOCAL_DATA/beef-prod.db" "$BACKUP"
    else
      echo "[2/3] No previous snapshot to backup"
    fi

    # Download
    echo "[3/3] Downloading beef.db..."
    mkdir -p "$LOCAL_DATA"
    scp "$VPS_HOST:$REMOTE_DIR/data/beef.db" "$LOCAL_DATA/beef-prod.db"

    echo "=== Done! Snapshot saved to $LOCAL_DATA/beef-prod.db ==="
    echo "Tables:"
    sqlite3 "$LOCAL_DATA/beef-prod.db" ".tables"
    ;;

  pull-feedback)
    echo "=== Exporting human_feedback as JSONL ==="

    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    OUTPUT="$LOCAL_DATA/human-feedback-${TIMESTAMP}.jsonl"
    mkdir -p "$LOCAL_DATA"

    ssh "$VPS_HOST" "sqlite3 '$REMOTE_DIR/data/beef.db' -json 'SELECT * FROM human_feedback'" \
      | python3 -c "
import sys, json
rows = json.load(sys.stdin)
for row in rows:
    print(json.dumps(row))
" > "$OUTPUT"

    LINES=$(wc -l < "$OUTPUT" | tr -d ' ')
    echo "=== Done! $LINES records saved to $OUTPUT ==="
    ;;

  *)
    usage
    ;;
esac
