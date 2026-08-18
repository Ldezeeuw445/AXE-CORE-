"""
Paste this into backend/axe_api/main.py after files_delete (near /files/search).
Then: systemctl restart axe_api (or your unit name).

Client already calls POST /files/move and falls back to shell `mv` via execCommand.
"""

# --- add near FileCreate ---
class FileMove(BaseModel):
    from_path: str = ""  # prefer `from` via alias in route body
    to: str = ""

# --- route ---
@app.post("/files/move", dependencies=[AUTH])
async def files_move(request: Request, body: dict = Body(...)):
    """Move / rename inside WORKSPACE_DIR without shell."""
    src = (body.get("from") or body.get("from_path") or "").strip()
    dst = (body.get("to") or "").strip()
    if not src or not dst:
        raise HTTPException(400, "from and to are required")
    if dst == src or dst.startswith(src + "/"):
        raise HTTPException(400, "Cannot move a folder into itself")
    full_src = _safe_path(src)
    full_dst = _safe_path(dst)
    if full_src == WORKSPACE_DIR:
        raise HTTPException(400, "Refusing to move the workspace root")
    if not os.path.exists(full_src):
        raise HTTPException(404, "Source not found")
    if os.path.exists(full_dst):
        raise HTTPException(409, "Destination already exists")
    os.makedirs(os.path.dirname(full_dst), exist_ok=True)
    _shutil.move(full_src, full_dst)
    await audit("file_move", src, {"to": dst}, request.client.host if request.client else "")
    return {"moved": True, "from": src, "to": dst}
