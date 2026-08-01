# =============================================================================
# INSERT into backend/axe_api/main.py  RIGHT AFTER  files_delete  (before search)
# Then: systemctl restart axe-api   (or however axe_api is run on the VPS)
# =============================================================================

@app.post("/files/move", dependencies=[AUTH])
async def files_move(request: Request):
    """Move / rename a file or folder inside WORKSPACE_DIR."""
    body = await request.json()
    src_rel = (body.get("from") or body.get("from_path") or "").strip()
    dst_rel = (body.get("to") or "").strip()
    if not src_rel or not dst_rel:
        raise HTTPException(400, "from and to are required")
    if dst_rel == src_rel or dst_rel.startswith(src_rel + "/"):
        raise HTTPException(400, "Cannot move a folder into itself")
    src = _safe_path(src_rel)
    dst = _safe_path(dst_rel)
    if not os.path.exists(src):
        raise HTTPException(404, f"Source not found: {src_rel}")
    if os.path.exists(dst):
        raise HTTPException(409, f"Destination already exists: {dst_rel}")
    os.makedirs(os.path.dirname(dst) or WORKSPACE_DIR, exist_ok=True)
    try:
        os.rename(src, dst)
    except OSError:
        if os.path.isdir(src):
            _shutil.copytree(src, dst)
            _shutil.rmtree(src)
        else:
            _shutil.copy2(src, dst)
            os.remove(src)
    await audit("file_move", src_rel, {"to": dst_rel}, request.client.host if request.client else "")
    return {"moved": True, "from": src_rel, "to": dst_rel}
