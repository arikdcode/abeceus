#!/bin/bash
set -e

# Builds the wiki locally with Docker and syncs the built files to EC2.
# Nginx config and TLS certs are managed by the rollhub repo (see DEPLOYMENT.md).
# This script only deals with content.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EC2_HOST="rollhub"
REMOTE_WIKI_DIR="/home/ubuntu/scifi-wiki"
REMOTE_BUILD_DIR="${REMOTE_WIKI_DIR}/public"

echo "======================================"
echo "Deploying Scifi Wiki to EC2 (local build)"
echo "======================================"

# Build the wiki locally
echo ""
echo "[1/3] Building wiki with Docker..."
cd "$PROJECT_ROOT"
docker compose up --build -d

echo "Waiting for build to complete..."
sleep 5

if [ ! -d "$PROJECT_ROOT/public" ]; then
    echo "ERROR: public/ directory not found after build"
    echo "Make sure docker-compose.yml is configured correctly"
    docker compose down
    exit 1
fi

docker compose down
echo "Build completed"

# Ensure the remote target directory exists
echo ""
echo "[2/3] Creating remote directory..."
ssh "$EC2_HOST" "mkdir -p $REMOTE_BUILD_DIR"

# Sync the built files
echo ""
echo "[3/3] Syncing built files to EC2..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    "$PROJECT_ROOT/public/" \
    "${EC2_HOST}:${REMOTE_BUILD_DIR}/"

echo ""
echo "======================================"
echo "Done. Wiki live at https://wiki.rollhub.org"
echo "======================================"
