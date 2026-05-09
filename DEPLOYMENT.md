# Wiki Deployment

The Quartz wiki is hosted at **`https://wiki.rollhub.org`** on the same EC2 instance as the rollhub VTT (`54.202.116.205`). It shares nginx and the existing Let's Encrypt cert.

Everything is infra-as-code. There are no one-off commands you should run on the EC2 box.

## Architecture

| Concern | Where it lives | Owned by |
|---|---|---|
| Wiki source (markdown, Quartz config) | `wiki/`, `quartz.config.ts`, `Dockerfile`, `docker-compose*.yml` | this repo (`scifi`) |
| Wiki content deploy script | `scripts/deploy_wiki*.sh` | this repo (`scifi`) |
| Built static files on EC2 | `/home/ubuntu/scifi-wiki/public/` | written by deploy script |
| Nginx server block for `wiki.rollhub.org` | `rollhub/scripts/nginx/nginx.wiki.conf` | rollhub repo |
| Nginx symlink/enable on EC2 | `rollhub/scripts/nginx/enable.sh` | rollhub repo |
| TLS cert (multi-SAN, includes `wiki.rollhub.org`) | `rollhub/scripts/aws/create_certs.sh` | rollhub repo |

## Day-to-day: updating wiki content

```bash
./scripts/deploy_wiki_remote_build.sh
```

That's it. Nginx doesn't need to be touched — it serves files from disk, and the deploy script overwrites them in place.

`scripts/deploy_wiki.sh` does the same thing but builds locally with Docker first, then rsyncs the built output. Use either; the remote build is the default.

## One-time setup (per environment)

These steps were run when `wiki.rollhub.org` was first stood up. If you ever rebuild the EC2 instance from scratch, run them in order:

### 1. DNS

In Route 53 (`rollhub.org` hosted zone), add an A record:
- Name: `wiki`
- Value: `54.202.116.205` (the EC2 public IP)
- TTL: 300
- Routing: simple

### 2. Expand the TLS cert to cover `wiki.rollhub.org`

On EC2:

```bash
ssh rollhub
cd ~/rollhub
git pull
./scripts/aws/create_certs.sh
```

`create_certs.sh` lists every subdomain on the cert, including `wiki.rollhub.org`. Re-running it after adding a new domain triggers a cert expansion via certbot.

### 3. Activate the wiki nginx config

On EC2 (after step 2):

```bash
cd ~/rollhub
./scripts/nginx/enable.sh
```

This symlinks `nginx.wiki.conf` (and `nginx.conf`) into `/etc/nginx/sites-enabled/`, runs `nginx -t`, and reloads nginx.

### 4. Build and deploy wiki content

From your local machine:

```bash
./scripts/deploy_wiki_remote_build.sh
```

After this, `https://wiki.rollhub.org` is live.

## Updating nginx or cert config

Both follow the same pattern as the VTT itself: edit the file in the rollhub repo, push, then re-run the relevant script on EC2.

- Adding a new subdomain: edit `rollhub/scripts/aws/create_certs.sh` and `rollhub/scripts/nginx/nginx.conf` (or add a new `nginx.<name>.conf` and symlink it in `enable.sh`), push, then on EC2 run `create_certs.sh` followed by `enable.sh`.
- Changing wiki nginx behavior (caching, headers, etc.): edit `rollhub/scripts/nginx/nginx.wiki.conf`, push, then on EC2 run `enable.sh`.

## Troubleshooting

```bash
# Is nginx healthy?
ssh rollhub "sudo systemctl status nginx"

# Wiki access / error logs
ssh rollhub "sudo tail -f /var/log/nginx/scifi_wiki_error.log"
ssh rollhub "sudo tail -f /var/log/nginx/scifi_wiki_access.log"

# What does the cert currently cover?
ssh rollhub "sudo certbot certificates"

# Are the wiki files actually on disk?
ssh rollhub "ls -la ~/scifi-wiki/public/ | head"

# Sanity check end-to-end
curl -I https://wiki.rollhub.org
```

## Removing the wiki

To take the wiki offline without removing the cert:

```bash
ssh rollhub
sudo rm /etc/nginx/sites-enabled/wiki.conf
sudo systemctl reload nginx
```

To fully tear down, also delete `~/scifi-wiki/` and remove `wiki.rollhub.org` from the cert (re-run `create_certs.sh` after editing the `-d` list) and from Route 53.
