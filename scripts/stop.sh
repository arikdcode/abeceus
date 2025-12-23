#!/bin/bash
# Stop the wiki dev server

set -e
cd "$(dirname "$0")/.."

echo "🛑 Stopping wiki server..."
docker compose down
