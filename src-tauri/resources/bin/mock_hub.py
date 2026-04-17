#!/usr/bin/env python3
"""Minimal mock of the wodouyao hub for the shell CLI smoke test.

Binds to an ephemeral loopback port, prints that port to stdout (single line,
flushed), and serves a tiny subset of the hub API:

- 401 unless Authorization header is exactly "Bearer test-token"
- GET  /v1/peers?from=peer-a  -> 200 [{"id":"peer-b","name":null,...}]
- GET  /v1/whoami?id=<id>     -> 200 {"id":<id>,...}
- POST /v1/self               -> 200 echoes the registered body
- POST /v1/send               -> 204, body echoed to stderr for debug
- GET  /v1/read               -> 200 text/plain "mock output"

Everything else is a 404.
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

EXPECTED_AUTH = "Bearer test-token"

ALPHA = {
    "id": "team_abc",
    "name": "alpha",
    "palette": {"key": "blue", "base": "#7aa2f7", "members": ["#7aa2f7"]},
    "members": [],
    "created_at": 0,
}
TEAMS = {ALPHA["id"]: ALPHA}
TEAM_ID_RE = re.compile(r"^/v1/teams/(team_[a-z0-9]+)$")
TEAM_ACTION_RE = re.compile(r"^/v1/teams/(team_[a-z0-9]+)/(join|leave|dissolve)$")
TEAM_TASKS_RE = re.compile(r"^/v1/teams/(team_[a-z0-9]+)/tasks$")
TEAM_TASK_ID_RE = re.compile(r"^/v1/teams/(team_[a-z0-9]+)/tasks/(task_[a-z0-9_]+)$")
TEAM_BCAST_RE = re.compile(r"^/v1/teams/(team_[a-z0-9]+)/broadcast$")
TEAM_DM_RE = re.compile(r"^/v1/teams/(team_[a-z0-9]+)/dm$")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("mock_hub: " + (fmt % args) + "\n")

    def _auth_ok(self):
        return self.headers.get("Authorization", "") == EXPECTED_AUTH

    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8"):
        self.send_response(code)
        if body:
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
        else:
            self.send_header("Content-Length", "0")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        if not self._auth_ok():
            self._send(401)
            return
        if self.path.startswith("/v1/peers"):
            body = json.dumps([
                {
                    "id": "peer-b",
                    "name": None,
                    "agent_kind": None,
                    "capabilities": [],
                    "registered_at": 0,
                }
            ]).encode()
            self._send(200, body, "application/json")
            return
        if self.path.startswith("/v1/whoami"):
            qs = parse_qs(urlparse(self.path).query)
            ident = {
                "id": (qs.get("id", [""])[0] or ""),
                "name": None,
                "agent_kind": None,
                "capabilities": [],
                "registered_at": 0,
            }
            self._send(200, json.dumps(ident).encode(), "application/json")
            return
        if self.path.startswith("/v1/read"):
            self._send(200, b"mock output\n")
            return
        if self.path.startswith("/v1/watch"):
            # Stream a single chunk using HTTP/1.1 chunked transfer encoding,
            # then close. send_response / send_header do not auto-inject a
            # Content-Length, so we're free to drive chunked ourselves.
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Transfer-Encoding", "chunked")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            payload = b"mock stream bytes\n"
            self.wfile.write(("%X\r\n" % len(payload)).encode())
            self.wfile.write(payload)
            self.wfile.write(b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
            self.close_connection = True
            return
        if self.path == "/v1/teams" or self.path.startswith("/v1/teams?"):
            body = json.dumps(list(TEAMS.values())).encode()
            self._send(200, body, "application/json")
            return
        m = TEAM_TASKS_RE.match(urlparse(self.path).path)
        if m:
            tid = m.group(1)
            if tid not in TEAMS:
                self._send(404)
                return
            self._send(200, b"[]", "application/json")
            return
        m = TEAM_ID_RE.match(urlparse(self.path).path)
        if m:
            tid = m.group(1)
            team = TEAMS.get(tid)
            if team is None:
                self._send(404)
                return
            self._send(200, json.dumps(team).encode(), "application/json")
            return
        self._send(404)

    def do_POST(self):
        if not self._auth_ok():
            self._send(401)
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else b""
        if self.path == "/v1/self":
            sys.stderr.write("mock_hub self body: %s\n" % body.decode("utf-8", "replace"))
            # Echo back whatever was posted.
            self._send(200, body or b"{}", "application/json")
            return
        if self.path == "/v1/send":
            sys.stderr.write("mock_hub send body: %s\n" % body.decode("utf-8", "replace"))
            self._send(204)
            return
        if self.path == "/v1/teams":
            try:
                obj = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                obj = {}
            obj = dict(obj)
            obj["id"] = "team_new"
            obj["created_at"] = 0
            obj.setdefault("members", [])
            if "palette" not in obj or isinstance(obj["palette"], str):
                obj["palette"] = {
                    "key": obj.get("palette") or "blue",
                    "base": "#7aa2f7",
                    "members": ["#7aa2f7"],
                }
            sys.stderr.write("mock_hub team create body: %s\n" % body.decode("utf-8", "replace"))
            self._send(200, json.dumps(obj).encode(), "application/json")
            return
        m = TEAM_TASKS_RE.match(urlparse(self.path).path)
        if m:
            tid = m.group(1)
            if tid not in TEAMS:
                self._send(404)
                return
            try:
                obj = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                obj = {}
            obj = dict(obj)
            obj["id"] = "task_new"
            obj.setdefault("status", "pending")
            sys.stderr.write("mock_hub task add body: %s\n" % body.decode("utf-8", "replace"))
            self._send(200, json.dumps(obj).encode(), "application/json")
            return
        m = TEAM_BCAST_RE.match(urlparse(self.path).path)
        if m:
            tid = m.group(1)
            if tid not in TEAMS:
                self._send(404)
                return
            sys.stderr.write("mock_hub bcast body: %s\n" % body.decode("utf-8", "replace"))
            self._send(200, json.dumps({"sent": 2, "failed": []}).encode(), "application/json")
            return
        m = TEAM_DM_RE.match(urlparse(self.path).path)
        if m:
            tid = m.group(1)
            if tid not in TEAMS:
                self._send(404)
                return
            sys.stderr.write("mock_hub dm body: %s\n" % body.decode("utf-8", "replace"))
            self._send(200, json.dumps({"sent": 2, "failed": []}).encode(), "application/json")
            return
        m = TEAM_ACTION_RE.match(urlparse(self.path).path)
        if m:
            tid, action = m.group(1), m.group(2)
            if tid not in TEAMS:
                self._send(404)
                return
            sys.stderr.write("mock_hub team %s body: %s\n" % (
                action, body.decode("utf-8", "replace")))
            if action == "dissolve":
                resp = {"evicted": []}
            elif action == "join":
                resp = {"id": tid, "joined": True}
            else:
                resp = {"id": tid, "left": True}
            self._send(200, json.dumps(resp).encode(), "application/json")
            return
        self._send(404)

    def do_PATCH(self):
        if not self._auth_ok():
            self._send(401)
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else b""
        m = TEAM_TASK_ID_RE.match(urlparse(self.path).path)
        if m:
            tid, task_id = m.group(1), m.group(2)
            if tid not in TEAMS:
                self._send(404)
                return
            try:
                obj = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                obj = {}
            obj = dict(obj)
            obj["id"] = task_id
            sys.stderr.write("mock_hub task patch body: %s\n" % body.decode("utf-8", "replace"))
            self._send(200, json.dumps(obj).encode(), "application/json")
            return
        self._send(404)


def main():
    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    sys.stdout.write("%d\n" % port)
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
