#!/bin/bash
# Start the wiki dev server with hot-reload
# Access at http://localhost:8080

set -e
cd "$(dirname "$0")/.."

echo "🚀 Starting wiki dev server..."
echo "   Access at: http://localhost:8080"
echo "   Press Ctrl+C to stop"
echo ""

docker compose up --build
