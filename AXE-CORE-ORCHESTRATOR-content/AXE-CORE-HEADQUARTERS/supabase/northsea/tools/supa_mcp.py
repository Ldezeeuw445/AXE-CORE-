"""Kleine JSON-RPC-client voor de Supabase MCP (project AXE Commodities). Token uit env, nooit geprint."""
import json, os, sys, httpx
REF = "kbimnuepbecbyezedvih"
URL = f"https://mcp.supabase.com/mcp?project_ref={REF}"
H = {"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}", "Accept": "application/json, text/event-stream", "Content-Type": "application/json"}

def _parse(r):
    t = r.text
    if r.headers.get("content-type", "").startswith("text/event-stream"):
        for line in t.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:])
    return json.loads(t)

def call(tool, args):
    with httpx.Client(timeout=120) as c:
        r = c.post(URL, headers=H, json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "p0", "version": "1"}}})
        h = dict(H)
        if r.headers.get("mcp-session-id"):
            h["mcp-session-id"] = r.headers["mcp-session-id"]
        c.post(URL, headers=h, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
        r = c.post(URL, headers=h, json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool, "arguments": args}})
        d = _parse(r)
        if "error" in d:
            raise SystemExit(f"error: {d['error']}")
        txt = d["result"]["content"][0]["text"]
        return txt

if __name__ == "__main__":
    print(call(sys.argv[1], json.loads(sys.argv[2])))

import re as _re

def sql(q):
    t = call("execute_sql", {"query": q})
    try:
        t = json.loads(t).get("result", t)
    except Exception:
        pass
    if isinstance(t, str) and "error" in t[:40].lower() and "untrusted" not in t:
        raise SystemExit(t[:500])
    m = _re.search(r"<untrusted-data-[^>]+>\n(.*?)\n</untrusted-data", t, _re.S)
    if not m:
        raise SystemExit("unexpected: " + t[:500])
    return json.loads(m.group(1))
