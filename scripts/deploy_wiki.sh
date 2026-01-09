#!/bin/bash
set -e

# Script to deploy the Quartz wiki to EC2
# This script:
# 1. Builds the wiki locally using Docker
# 2. Syncs the built files to EC2
# 3. Sets up nginx configuration (requires manual activation)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EC2_HOST="rollhub"
EC2_USER="ubuntu"
WIKI_PORT="5050"
REMOTE_WIKI_DIR="/home/ubuntu/scifi-wiki"
REMOTE_BUILD_DIR="${REMOTE_WIKI_DIR}/public"

echo "======================================"
echo "Deploying Scifi Wiki to EC2"
echo "======================================"

# Step 1: Build the wiki locally
echo ""
echo "[1/4] Building wiki with Docker..."
cd "$PROJECT_ROOT"
docker compose up --build -d

# Wait for build to complete
echo "Waiting for build to complete..."
sleep 5

# Check if public directory was created
if [ ! -d "$PROJECT_ROOT/public" ]; then
    echo "ERROR: public/ directory not found after build"
    echo "Make sure docker-compose.yml is configured correctly"
    exit 1
fi

echo "✓ Build completed successfully"

# Stop the docker container
docker compose down

# Step 2: Create remote directory structure
echo ""
echo "[2/4] Creating remote directory structure..."
ssh $EC2_HOST "mkdir -p $REMOTE_WIKI_DIR"

# Step 3: Sync built files to EC2
echo ""
echo "[3/4] Syncing files to EC2..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    "$PROJECT_ROOT/public/" \
    "${EC2_HOST}:${REMOTE_BUILD_DIR}/"

echo "✓ Files synced successfully"

# Step 4: Create nginx configuration (but don't activate it yet)
echo ""
echo "[4/4] Creating nginx configuration..."

# Create the nginx config file
ssh $EC2_HOST "cat > ${REMOTE_WIKI_DIR}/nginx_wiki.conf" << 'EOF'
# HTTP server for wiki on port 5050
server {
    listen 5050;
    server_name _;

    root /home/ubuntu/scifi-wiki/public;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logging
    access_log /var/log/nginx/scifi_wiki_access.log;
    error_log /var/log/nginx/scifi_wiki_error.log;
}
EOF

echo "✓ Nginx configuration created at: ${REMOTE_WIKI_DIR}/nginx_wiki.conf"

echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "NEXT STEPS (Manual):"
echo ""
echo "1. Add EC2 security group rule for port $WIKI_PORT"
echo "   - Go to AWS Console > EC2 > Security Groups"
echo "   - Add inbound rule: TCP port $WIKI_PORT from 0.0.0.0/0"
echo ""
echo "2. Activate nginx configuration on EC2:"
echo "   ssh $EC2_HOST"
echo "   sudo ln -sf ${REMOTE_WIKI_DIR}/nginx_wiki.conf /etc/nginx/sites-enabled/wiki.conf"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo ""
echo "3. Test the wiki:"
echo "   http://54.202.116.205:$WIKI_PORT"
echo ""
echo "NOTE: The nginx config has NOT been activated yet."
echo "      This is intentional to allow you to review before making changes."
echo ""

