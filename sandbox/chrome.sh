#!/usr/bin/env bash
# Chrome 146 has WebGPU, but Dawn's default OpenGL backend cannot get an
# EGLConfig, so requestAdapter() is null. Vulkan works.
# Call the real binary — not `google-chrome` on PATH — and refuse to attach
# to an already-running Chrome (new tabs inherit the old GPU process).
set -euo pipefail
PORT="${1:-8080}"
URL="http://127.0.0.1:${PORT}/web/"
BIN=/opt/google/chrome/google-chrome

if pgrep -f '/opt/google/chrome/chrome' >/dev/null; then
  echo "Chrome is already running. New tabs will keep the old GPU backend." >&2
  echo "Quit Chrome fully (menu → Exit), then run this again." >&2
  exit 1
fi

exec "$BIN" \
  --ignore-gpu-blocklist \
  --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE \
  --use-gl=angle \
  --use-angle=vulkan \
  "$URL"
