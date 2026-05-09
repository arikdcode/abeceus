#!/bin/bash
set -e

# Syncs wiki source to EC2 and builds it there with Docker.
# Nginx config and TLS certs are managed by the rollhub repo (see DEPLOYMENT.md).
# This script only deals with content.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EC2_HOST="rollhub"
REMOTE_WIKI_DIR="/home/ubuntu/scifi-wiki"

echo "======================================"
echo "Deploying Scifi Wiki to EC2 (remote build)"
echo "======================================"

# Ensure the remote target directory exists
echo ""
echo "[1/3] Creating remote directory..."
ssh "$EC2_HOST" "mkdir -p $REMOTE_WIKI_DIR"

# Sync the source tree
echo ""
echo "[2/3] Syncing source files to EC2..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'public' \
    --exclude 'venv' \
    --exclude 'scripts/venv' \
    --exclude '*.pyc' \
    --exclude '__pycache__' \
    "$PROJECT_ROOT/" \
    "${EC2_HOST}:${REMOTE_WIKI_DIR}/"

# Build on EC2
echo ""
echo "[3/3] Building wiki on EC2..."
ssh "$EC2_HOST" << 'ENDSSH'
set -e
cd ~/scifi-wiki
rm -rf public
docker compose -f docker-compose.build.yml up --build
CONTAINER_ID=$(docker compose -f docker-compose.build.yml ps -aq | head -1)
if [ -z "$CONTAINER_ID" ]; then
    echo "ERROR: Could not find build container"
    exit 1
fi
docker cp "${CONTAINER_ID}:/quartz/public" ./public
docker compose -f docker-compose.build.yml down
chmod -R 755 public
if [ ! -d "public" ] || [ -z "$(ls -A public)" ]; then
    echo "ERROR: Build failed, no files in public/ directory"
    exit 1
fi
echo "Build completed"
ENDSSH

echo ""
echo "======================================"
echo "Done. Wiki live at https://wiki.rollhub.org"
echo "======================================"
