"""Rolt NorthSea edge functions uit naar AXE Commodities via de Supabase MCP.

De repo gebruikt ../_shared/…; bij uitrol wordt elke function met een eigen kopie van
_shared/ gebundeld (imports herschreven naar ./_shared/…), zodat elke function los deployt.
Gebruik: SUPABASE_ACCESS_TOKEN=… python deploy_functions.py <slug> [<slug> …]
"""
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from supa_mcp import call

ROOT = pathlib.Path(__file__).resolve().parents[1] / "functions"
VERIFY_JWT = {
    "send-approved-reply": True,
    "resend-reconcile-outbound": True,
}  # alle andere doen hun eigen autorisatie (handtekening/sleutel/eigenaar)


def bundle(slug: str) -> list[dict]:
    files = []
    src = (ROOT / slug / "index.ts").read_text()
    files.append({"name": "index.ts", "content": src.replace("../_shared/", "./_shared/")})
    for shared in sorted((ROOT / "_shared").glob("*.ts")):
        if f"_shared/{shared.name}" in src or any(f"./{shared.name}" in p.read_text() for p in (ROOT / "_shared").glob("*.ts")):
            files.append({"name": f"_shared/{shared.name}", "content": shared.read_text()})
    return files


def main() -> int:
    for slug in sys.argv[1:]:
        files = bundle(slug)
        res = call("deploy_edge_function", {"name": slug, "entrypoint_path": "index.ts", "verify_jwt": VERIFY_JWT.get(slug, False), "files": files})
        try:
            d = json.loads(res)
            print(slug, "->", {k: d.get(k) for k in ("version", "status", "verify_jwt")})
        except Exception:
            print(slug, "->", res[:300])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
