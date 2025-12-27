#!/bin/bash
set -e

# Alternative deployment script that builds the wiki ON the EC2 instance
# This avoids needing to run Docker locally

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EC2_HOST="rollhub"
EC2_USER="ubuntu"
WIKI_PORT="5050"
REMOTE_WIKI_DIR="/home/ubuntu/scifi-wiki"
REMOTE_BUILD_DIR="${REMOTE_WIKI_DIR}/public"

echo "======================================"
echo "Deploying Scifi Wiki to EC2"
echo "(Remote Build Strategy)"
echo "======================================"

# Step 1: Create remote directory
echo ""
echo "[1/5] Creating remote directory structure..."
ssh $EC2_HOST "mkdir -p $REMOTE_WIKI_DIR"

# Step 2: Sync source files to EC2
echo ""
echo "[2/5] Syncing source files to EC2..."
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

echo "✓ Files synced successfully"

# Step 3: Build on EC2 using Docker
echo ""
echo "[3/5] Building wiki on EC2..."
ssh $EC2_HOST << 'ENDSSH'
cd ~/scifi-wiki
# Remove old public directory
rm -rf public
# Run the build (runs once and exits, no port needed)
docker compose -f docker-compose.build.yml up --build
# Copy files from the stopped container
CONTAINER_ID=$(docker compose -f docker-compose.build.yml ps -aq | head -1)
if [ -z "$CONTAINER_ID" ]; then
    echo "ERROR: Could not find build container"
    exit 1
fi
docker cp ${CONTAINER_ID}:/quartz/public ./public
# Clean up
docker compose -f docker-compose.build.yml down
# Fix permissions
chmod -R 755 public
# Verify build
if [ ! -d "public" ] || [ ! "$(ls -A public)" ]; then
    echo "ERROR: Build failed, no files in public/ directory"
    exit 1
fi
echo "✓ Build completed successfully"
ENDSSH

# Step 4: Create nginx configuration
echo ""
echo "[4/5] Creating nginx configuration..."

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

echo "✓ Nginx configuration created"

# Step 5: Instructions
echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "NEXT STEPS (Manual):"
echo ""
echo "1. Add EC2 security group rule for port $WIKI_PORT"
echo "   - Go to AWS Console > EC2 > Security Groups"
echo "   - Add inbound rule: Type=Custom TCP, Port=$WIKI_PORT, Source=0.0.0.0/0"
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
echo "      Review the steps above before proceeding."
echo ""
