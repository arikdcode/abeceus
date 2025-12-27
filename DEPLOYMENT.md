# Wiki Deployment to EC2

This document describes how to deploy the Quartz-based Scifi Wiki to the EC2 instance at `rollhub.org`.

## Overview

The wiki is hosted on the same EC2 instance as the VTT platform (rollhub.org), but on a different port (5050) since ports 80/443 are already in use by the VTT services.

## Architecture

- **EC2 Instance**: `54.202.116.205` (rollhub.org)
- **Wiki Port**: 5050 (HTTP only for now)
- **Wiki Location**: `/home/ubuntu/scifi-wiki/`
- **Built Files**: `/home/ubuntu/scifi-wiki/public/`
- **Nginx Config**: `/home/ubuntu/scifi-wiki/nginx_wiki.conf`

## Current EC2 Setup

The EC2 instance is running:
- Minikube cluster with VTT services
- Nginx proxy routing traffic to:
  - `rollhub.org` → VTT web client (port 30000 in minikube)
  - `api.rollhub.org` → VTT API (port 30001 in minikube)
  - `files.rollhub.org` → MinIO file storage
  - `gs.rollhub.org` (ports 7000-8000) → Game servers

All of these use ports 80/443 with Let's Encrypt SSL certificates.

## Deployment Scripts

Two deployment scripts are provided:

### 1. `scripts/deploy_wiki.sh` (Local Build)
Builds the wiki locally using Docker, then syncs the built files to EC2.

**Pros**: Faster if you have Docker running locally
**Cons**: Requires Docker on your local machine

### 2. `scripts/deploy_wiki_remote_build.sh` (Remote Build) **RECOMMENDED**
Syncs source files to EC2, then builds the wiki on the EC2 instance using Docker.

**Pros**: No Docker needed locally, uses EC2's resources
**Cons**: Slightly slower due to file transfer

## Deployment Steps

### Step 1: Run the Deployment Script

```bash
cd /home/arik/code/scifi
./scripts/deploy_wiki_remote_build.sh
```

This will:
1. Create `/home/ubuntu/scifi-wiki/` on EC2
2. Sync all source files to EC2
3. Build the wiki on EC2 using Docker
4. Create the nginx configuration file

**IMPORTANT**: The script does NOT activate the nginx config or modify the EC2 instance. This is intentional for safety.

### Step 2: Add EC2 Security Group Rule

1. Go to AWS Console → EC2 → Security Groups
2. Find the security group for your EC2 instance
3. Add an inbound rule:
   - **Type**: Custom TCP
   - **Port**: 5050
   - **Source**: 0.0.0.0/0 (or restrict to specific IPs)
   - **Description**: Scifi Wiki HTTP

### Step 3: Activate Nginx Configuration

SSH into the EC2 instance and activate the nginx configuration:

```bash
ssh rollhub

# Link the config into nginx sites-enabled
sudo ln -sf /home/ubuntu/scifi-wiki/nginx_wiki.conf /etc/nginx/sites-enabled/wiki.conf

# Test the nginx configuration
sudo nginx -t

# If the test passes, reload nginx
sudo systemctl reload nginx
```

### Step 4: Test the Wiki

Visit: `http://54.202.116.205:5050`

## Updating the Wiki

To update the wiki content after making changes:

1. Edit wiki files locally in `/home/arik/code/scifi/wiki/`
2. Run the deployment script again:
   ```bash
   ./scripts/deploy_wiki_remote_build.sh
   ```
3. No need to reload nginx unless you changed the nginx config

## Security Considerations

### Current Setup (Port 5050, HTTP only)
- ✓ Uses a non-standard port to avoid conflicts
- ✓ Read-only static files (no user input/database)
- ✗ No HTTPS/SSL encryption
- ✗ Port is publicly accessible

### Future Enhancements

If you want to add HTTPS later, you could:

1. **Option A: Use a subdomain** (e.g., `wiki.rollhub.org`)
   - Add DNS A record pointing to your EC2 IP
   - Use Let's Encrypt to get SSL certificate
   - Update nginx to listen on 443 with the cert

2. **Option B: Keep port 5050 with self-signed cert**
   - Generate self-signed certificate
   - Update nginx config to listen on 5050 with SSL
   - Users will see browser warning (not ideal)

## Troubleshooting

### Check if nginx is running
```bash
ssh rollhub "sudo systemctl status nginx"
```

### Check nginx error logs
```bash
ssh rollhub "sudo tail -f /var/log/nginx/scifi_wiki_error.log"
```

### Check if port 5050 is listening
```bash
ssh rollhub "sudo netstat -tlnp | grep 5050"
```

### Rebuild the wiki manually
```bash
ssh rollhub
cd ~/scifi-wiki
docker compose up --build
# Wait for build, then Ctrl+C
docker compose down
```

### Check file permissions
```bash
ssh rollhub "ls -la ~/scifi-wiki/public/"
```

## Files Modified on EC2

The deployment scripts will NOT modify any existing files on EC2. They will only:
- Create new directory: `/home/ubuntu/scifi-wiki/`
- Sync files to that directory
- Create nginx config file (not activated)

The VTT platform files in `/home/ubuntu/rollhub/` are NOT touched.

## Rollback

To remove the wiki deployment:

```bash
ssh rollhub

# Remove nginx config
sudo rm /etc/nginx/sites-enabled/wiki.conf
sudo systemctl reload nginx

# Remove wiki files (optional)
rm -rf ~/scifi-wiki

# Remove security group rule from AWS Console
```

## Contact

If you have questions or issues, review the nginx logs and check that:
1. The security group rule is in place
2. The nginx config is linked and nginx was reloaded
3. The `public/` directory has files in it
