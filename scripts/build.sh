#!/bin/bash
# Build static site for deployment
# Output goes to ./public/

set -e
cd "$(dirname "$0")/.."

echo "📦 Building static wiki..."

docker compose run --rm wiki npx quartz build --output /quartz/content/../public

echo "✅ Build complete! Output in ./public/"
