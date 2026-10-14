"""Kleine, begrensde controles zonder agentruns of modelgeneratie."""
from __future__ import annotations

import asyncio
import shutil
import time

import httpx

_cache: dict[str, tuple[float, dict]] = {}


async def http_health(client, url: str, key: str = "", *, models: bool = False) -> dict:
    start = time.monotonic()
    try:
        response = await client.get(url, headers={"Authorization": f"Bearer {key}"} if key else {})
        healthy = response.is_success
        if healthy:
            try:
                body = response.json()
            except ValueError:
                body = None
            if isinstance(body, dict):
                healthy = body.get("ok") is not False and body.get("healthy") is not False and body.get("status") not in {"error", "failed", "unhealthy", "offline"}
            if models:
                healthy = healthy and isinstance(body, dict) and isinstance(body.get("models"), list)
        return {"configured": True, "reachable": healthy, "latency_ms": round((time.monotonic() - start) * 1000),
                "http_status": response.status_code}
    except httpx.HTTPError:
        return {"configured": True, "reachable": False, "error": "Health request failed"}


async def process_health(name: str, argv: list[str], timeout: float) -> dict:
    cached = _cache.get(name)
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    process = None
    try:
        process = await asyncio.create_subprocess_exec(*argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout)
        version = stdout.decode("utf-8", "replace").strip()
        # Alleen een versienummer wordt publiek; geen commandoregel of stderr.
        result = {"configured": True, "reachable": process.returncode == 0 and bool(version),
                  "version": version[:40] if process.returncode == 0 else None}
    except (OSError, asyncio.TimeoutError):
        if process and process.returncode is None:
            process.kill()
            await process.communicate()
        result = {"configured": True, "reachable": False, "error": "Runtime probe failed"}
    # Alleen goede metingen cachen. Eén tijdelijke fout mag niet als twee
    # opeenvolgende fouten aan de incidentbewaker worden teruggegeven.
    if result["reachable"]:
        _cache[name] = (time.monotonic(), result)
    else:
        _cache.pop(name, None)
    return result


async def runtime_health(github_token: str, crew_python: str) -> dict:
    docker = shutil.which("docker")
    checks = [process_health("crewai", [crew_python, "-c", "import crewai; from importlib.metadata import version; print(version('crewai'))"], 5)]
    if docker:
        checks.append(process_health("docker", [docker, "info", "--format", "{{json .ServerVersion}}"], 4))
    results = await asyncio.gather(*checks)
    out = {"crewai": results[0], "docker": results[1] if docker else {"configured": False, "reachable": False}}
    if not github_token:
        out["github"] = {"configured": False, "reachable": False}
    else:
        cached = _cache.get("github")
        if cached and time.monotonic() - cached[0] < 300:
            out["github"] = cached[1]
        else:
            async with httpx.AsyncClient(timeout=6) as client:
                out["github"] = await http_health(client, "https://api.github.com/user", github_token)
            if out["github"]["reachable"]:
                _cache["github"] = (time.monotonic(), out["github"])
            else:
                _cache.pop("github", None)
    return out
