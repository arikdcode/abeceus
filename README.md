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

## Requirements

- Docker & Docker Compose
