"""GET /api/v1/health: dependency status. Reports whether secrets are configured, never their values."""
import shutil
import subprocess

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import __version__
from app.config import Settings, get_settings
from app.db import get_db

router = APIRouter(tags=["health"])


def _ffmpeg() -> dict:
    path = shutil.which("ffmpeg")
    if not path:
        return {"found": False}
    try:
        out = subprocess.run([path, "-version"], capture_output=True, text=True, timeout=5).stdout.splitlines()[0]
    except Exception:  # noqa: BLE001 - health must never raise
        out = "unknown"
    return {"found": True, "version": out, "ffprobe": shutil.which("ffprobe") is not None}


def _storage(settings: Settings) -> dict:
    root = settings.storage_path
    try:
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".write_probe"
        probe.write_text("ok")
        probe.unlink()
        return {"root": str(root), "writable": True}
    except OSError as exc:
        return {"root": str(root), "writable": False, "error": exc.strerror}


@router.get("/health")
def health(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    try:
        db.execute(text("SELECT 1"))
        revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
        database = {"ok": True, "migration": revision}
    except Exception as exc:  # noqa: BLE001
        database = {"ok": False, "error": type(exc).__name__}
    storage = _storage(settings)
    ffmpeg = _ffmpeg()
    return {
        "status": "ok" if database["ok"] and storage["writable"] and ffmpeg["found"] else "degraded",
        "version": __version__,
        "database": database,
        "storage": storage,
        "ffmpeg": ffmpeg,
        "featherless": {
            "configured": settings.featherless_configured,  # boolean only; the key is never returned
            "base_url": settings.featherless_base_url,
            "text_model": settings.featherless_text_model,
            "vision_model": settings.featherless_vision_model,
        },
    }
