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
# Temporarily change port to avoid conflict with nginx (5050)
sed -i 's/5050:5050/5051:5050/' docker-compose.yml
# Pull latest images and build
docker compose up --build -d
echo "Waiting for Quartz build to complete..."
# Wait for the build to finish
for i in {1..60}; do
    sleep 2
    # Check if container is still running and if public directory exists inside it
    if docker compose ps | grep -q "Up"; then
        # Check if the build has completed by looking for the success message in logs
        if docker compose logs 2>&1 | grep -q "Started a Quartz server"; then
            echo "✓ Build completed successfully"
            break
        fi
    else
        echo "ERROR: Container exited unexpectedly"
        docker compose logs --tail=50
        exit 1
    fi
    if [ $i -eq 60 ]; then
        echo "ERROR: Build timed out after 120 seconds"
        docker compose logs --tail=50
        exit 1
    fi
done
# Copy the built files from the container to the host
echo "Copying built files from container..."
docker compose cp wiki:/quartz/public ./public
# Stop the container
docker compose down
# Restore original docker-compose.yml
sed -i 's/5051:5050/5050:5050/' docker-compose.yml
# Fix permissions
chmod -R 755 public
echo "✓ Files copied successfully"
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
