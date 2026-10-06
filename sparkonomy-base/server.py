#!/usr/bin/env python3
"""Local server for a mirrored website.

Serves the captured static build, does SPA-style routing, and PROXIES the
site's own data/API calls to the origin (caching to disk). The proxy is what
keeps the running app from crashing into its error boundary when a section
scrolls into view and fetches real data.

Config via environment:
    PORT    port to listen on               (default 3001)
    ORIGIN  site to proxy API calls to       (e.g. https://www.shopify.com)
    ROUTE   path to redirect "/" to          (e.g. /ca/editions/spring2026)

Run:  ORIGIN=https://example.com ROUTE=/some/page PORT=3001 python3 server.py
"""
import hashlib
import http.server
import json
import os
import socketserver
import urllib.parse
import urllib.request

PORT = int(os.environ.get("PORT", "3001"))
ROOT = os.path.dirname(os.path.abspath(__file__))
ORIGIN = os.environ.get("ORIGIN", "").rstrip("/")
ROUTE = os.environ.get("ROUTE", "/")
CACHE_DIR = os.path.join(ROOT, "api-cache")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

MIME = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json",
    ".map": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
    ".ktx2": "image/ktx2", ".glb": "model/gltf-binary", ".riv": "application/octet-stream",
    ".mp4": "video/mp4", ".webm": "video/webm",
}

# Paths that must return JSON/data from the origin, never the SPA HTML.
# Extend this list if a site uses a different data-route convention.
DATA_SIGNATURES = ("/api/", "/_next/data/", "/_payload.json", "/__data.json", "/_next/image")
DATA_SUFFIXES = (".data", ".json", "_rsc")


def is_data_route(path, query):
    if any(sig in path for sig in DATA_SIGNATURES):
        return True
    if any(path.endswith(suf) for suf in DATA_SUFFIXES):
        return True
    if "_rsc=" in query:  # Next.js React Server Component flight
        return True
    return False


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        code = str(args[1]) if len(args) > 1 else "?"
        if code.startswith(("4", "5")):
            print(f"  {code} {args[0]}")

    # --- senders -----------------------------------------------------------
    def _send(self, body, ctype, status=200):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_file(self, path):
        try:
            with open(path, "rb") as f:
                body = f.read()
        except (FileNotFoundError, IsADirectoryError):
            self.send_error(404)
            return
        ext = os.path.splitext(path)[1].lower()
        self._send(body, MIME.get(ext, "application/octet-stream"))

    def send_index(self):
        self.send_file(os.path.join(ROOT, "index.html"))

    # --- proxy + cache -----------------------------------------------------
    def proxy_data(self):
        """Return real data from the origin for this request, cached to disk.
        Falls back to {} if the origin can't be reached, which is safer than
        returning HTML (HTML where JSON is expected is what crashes the app)."""
        full = self.path
        if not ORIGIN:
            self._send(b"{}", "application/json")
            return
        key = hashlib.sha1(full.encode("utf-8")).hexdigest()
        cache_file = os.path.join(CACHE_DIR, key)
        if os.path.isfile(cache_file):
            with open(cache_file, "rb") as f:
                self._send(f.read(), "application/json")
            return
        try:
            req = urllib.request.Request(
                ORIGIN + full,
                headers={"User-Agent": UA, "Accept": "application/json, text/x-component, */*"},
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read()
                ctype = r.headers.get("Content-Type", "application/json")
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(cache_file, "wb") as f:
                f.write(body)
            self._send(body, ctype)
        except Exception as e:
            print(f"  [proxy fail] {full}: {e}")
            self._send(b"{}", "application/json")

    # --- routing -----------------------------------------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)

        if is_data_route(path, parsed.query):
            self.proxy_data()
            return

        # Real local file (build assets, images, fonts).
        fs = os.path.join(ROOT, path.lstrip("/"))
        if os.path.isfile(fs):
            self.send_file(fs)
            return

        if path in ("/", "") and ROUTE not in ("/", ""):
            self.send_response(302)
            self.send_header("Location", ROUTE)
            self.end_headers()
            return

        # Any other path -> the SSR HTML (client-side routing takes over).
        self.send_index()

    def do_POST(self):
        # App telemetry / mutations: swallow with an empty JSON ok.
        self._send(b"{}", "application/json")

    def do_HEAD(self):
        self.do_GET()


if __name__ == "__main__":
    os.chdir(ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"\n  Mirrored site")
        print(f"  =============")
        print(f"  origin proxy : {ORIGIN or '(none — data routes return {})'}")
        print(f"  open         : http://localhost:{PORT}{ROUTE}")
        print(f"\n  Restart this process after any edit. Ctrl+C to stop.\n")
        httpd.serve_forever()
