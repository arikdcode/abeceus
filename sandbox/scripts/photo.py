#!/usr/bin/env python3
"""Photograph catalog props through the WebGL studio and save a mosaic."""

import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, ".agent", "shots")
BASE = os.environ.get("SANDBOX_URL", "http://127.0.0.1:8080")
CHROME = os.environ.get(
    "CHROME",
    "/opt/google/chrome/google-chrome" if os.path.isfile("/opt/google/chrome/google-chrome") else "google-chrome",
)


def wait_server():
    for _ in range(40):
        try:
            urllib.request.urlopen(BASE + "/web/photo.html", timeout=1)
            return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.15)
    raise SystemExit(f"sandbox not up at {BASE}")


def shoot(name, query=""):
    dest = os.path.join(SHOTS, name + ".png")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.isfile(dest):
        os.remove(dest)
    url = f"{BASE}/web/photo.html?{query}t={int(time.time() * 1000)}"
    tmp = f"/tmp/chrome-photo-{name.replace('/', '-')}"
    cmd = [
        CHROME, "--headless=new", "--no-first-run", "--disable-extensions",
        f"--user-data-dir={tmp}",
        "--virtual-time-budget=60000",
        url,
    ]
    subprocess.run(cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        if os.path.isfile(dest) and os.path.getsize(dest) > 1000:
            print(dest)
            return dest
        time.sleep(0.15)
    raise SystemExit(f"photo failed: {name} ({url})")


if __name__ == "__main__":
    os.makedirs(os.path.join(SHOTS, "objects"), exist_ok=True)
    wait_server()
    prop = sys.argv[1] if len(sys.argv) > 1 else ""
    if prop:
        shoot(f"objects/{prop}", f"prop={prop}&sheet=1&")
    else:
        shoot("object-mosaic")
