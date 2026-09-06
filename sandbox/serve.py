#!/usr/bin/env python3
"""Static server for the browser sandbox. Open http://127.0.0.1:8080/web/"""

import base64
import http.server
import json
import os
import re
import socketserver
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
AGENT = os.path.join(ROOT, ".agent")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


def _write_dump(payload):
    os.makedirs(AGENT, exist_ok=True)
    last = os.path.join(AGENT, "last.json")
    hist = os.path.join(AGENT, "history.jsonl")
    text = json.dumps(payload, default=str)
    with open(last, "w", encoding="utf-8") as f:
        f.write(text)
        f.write("\n")
    with open(hist, "a", encoding="utf-8") as f:
        f.write(text)
        f.write("\n")
    lines = open(hist, encoding="utf-8").read().splitlines()
    if len(lines) > 40:
        with open(hist, "w", encoding="utf-8") as f:
            f.write("\n".join(lines[-40:]))
            f.write("\n")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/web/")
            self.end_headers()
            return
        if self.path.split("?")[0] in ("/debug/last.json", "/debug/dump"):
            path = os.path.join(AGENT, "last.json")
            if not os.path.isfile(path):
                self.send_error(404, "no dump yet")
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with open(path, "rb") as f:
                self.wfile.write(f.read())
            return
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400, "bad json")
            return
        if path == "/debug/dump":
            _write_dump(payload)
            self.send_response(204)
            self.end_headers()
            return
        if path == "/debug/shot":
            raw = str(payload.get("name") or "shot").replace("\\", "/")
            raw = re.sub(r"[^a-zA-Z0-9._/-]+", "_", raw).strip("/")
            if ".." in raw.split("/"):
                self.send_error(400, "bad name")
                return
            png = payload.get("png") or ""
            if "," in png:
                png = png.split(",", 1)[1]
            try:
                data = base64.b64decode(png)
            except Exception:
                self.send_error(400, "bad png")
                return
            dest_dir = os.path.join(AGENT, "shots", os.path.dirname(raw))
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(AGENT, "shots", raw + ".png")
            with open(dest, "wb") as f:
                f.write(data)
            self.send_response(204)
            self.end_headers()
            return
        self.send_error(404)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    os.chdir(ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    print(f"sandbox at http://127.0.0.1:{PORT}/web/", flush=True)
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
