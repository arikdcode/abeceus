# Sci-Fi Wiki

An Obsidian-compatible wiki rendered with [Quartz](https://quartz.jzhao.xyz/).

## Structure

```
wiki/           # Your wiki content (Obsidian vault)
scripts/        # Dev scripts
Dockerfile      # Container setup (you don't need to touch this)
docker-compose.yml
```

## Quick Start

### Start Dev Server (with hot-reload)

```bash
./scripts/dev.sh
```

Then open http://localhost:8080 in your browser. Changes to files in `wiki/` will automatically refresh.

### Stop Server

```bash
./scripts/stop.sh
```

Or just `Ctrl+C` in the terminal running the dev server.

### Build for Deployment

```bash
./scripts/build.sh
```

Static files will be output to `public/`.

## Writing Content

Add Markdown files to the `wiki/` folder. You can:

- Use **wiki links**: `[[Page Name]]` or `[[folder/page|Display Text]]`
- Add **tags**: `#tag-name` or in frontmatter
- Organize with **folders**: folder structure becomes navigation
- Use **frontmatter** for metadata:

```yaml
---
title: Page Title
tags:
  - character
  - protagonist
---
```

## Opening in Obsidian

You can open the `wiki/` folder directly in Obsidian as a vault for a nice editing experience. Your edits will hot-reload in the browser.

## Image Generation

The wiki includes a script to generate concept art using OpenAI's DALL-E 3.

### Setup
The project uses a virtual environment and a `.env` file for the API key.
1. The virtual environment is located at `venv/`.
2. The API key is stored in `.env` (ignored by git).

To use the script manually:
```bash
./venv/bin/python3 scripts/generate_image.py "A futuristic city" "wiki/assets/city.png"
```

---

## Requirements

- Docker & Docker Compose
