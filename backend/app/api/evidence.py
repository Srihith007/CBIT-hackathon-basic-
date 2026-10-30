import json

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_case, get_evidence, get_factory
from app.api.serializers import evidence_out, job_out
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Case, EvidenceFile, VideoMetadata
from app.services import audit, jobs
from app.services.ingest import ingest_upload
from app.storage import safe_resolve, sanitize_filename, sha256_file

router = APIRouter(tags=["evidence"])


def _parse_provenance(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except ValueError:
        raise AppError(422, "INVALID_PROVENANCE", "provenance must be a JSON object")
    if not isinstance(value, dict):
        raise AppError(422, "INVALID_PROVENANCE", "provenance must be a JSON object")
    return value


@router.post("/cases/{case_id}/evidence", status_code=201)
def upload_evidence(response: Response, background: BackgroundTasks, file: UploadFile = File(...), kind: str = Form(...),
                    synthetic: bool = Form(...), provenance: str | None = Form(default=None), licence: str | None = Form(default=None),
                    case: Case = Depends(get_case), db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
                    factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    """`synthetic` is required: every file must be explicitly declared real or synthetic/staged."""
    ev, duplicate, job = ingest_upload(db, settings, case=case, upload=file, kind=kind, synthetic=synthetic,
                                       provenance=_parse_provenance(provenance), licence=licence, actor=actor)
    db.commit()
    if duplicate:
        response.status_code = 200
        return {"duplicate": True, "evidence": evidence_out(ev, db.get(VideoMetadata, ev.id)), "job": None}
    background.add_task(jobs.run_pending, factory, settings)  # validation starts right after the response; `python -m app.worker` also works
    return {"duplicate": False, "evidence": evidence_out(ev), "job": job_out(job)}


@router.get("/cases/{case_id}/evidence")
def list_evidence(kind: str | None = None, status: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    q = select(EvidenceFile).where(EvidenceFile.case_id == case.id).order_by(EvidenceFile.uploaded_at)
    if kind:
        q = q.where(EvidenceFile.kind == kind)
    if status:
        q = q.where(EvidenceFile.status == status)
    items = db.execute(q).scalars().all()
    meta = {m.evidence_id: m for m in db.execute(select(VideoMetadata).where(VideoMetadata.evidence_id.in_([e.id for e in items]))).scalars()} if items else {}
    return {"items": [evidence_out(e, meta.get(e.id)) for e in items]}


@router.get("/evidence/{evidence_id}")
def evidence_detail(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    return evidence_out(ev, db.get(VideoMetadata, ev.id))


@router.get("/evidence/{evidence_id}/original")
def evidence_original(verify: bool = Query(False, description="re-hash the stored file and compare before serving"),
                      ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
                      actor: str = Depends(get_actor)) -> FileResponse:
    """The original bytes, unchanged. Supports HTTP Range requests, so browsers can play and seek video."""
    try:
        path = safe_resolve(settings.storage_path, ev.stored_path)
    except ValueError:
        raise AppError(500, "STORAGE_PATH_INVALID", "Stored path is outside the evidence store")
    if not path.is_file():
        raise AppError(404, "ORIGINAL_MISSING", "The stored file is missing from the evidence store")
    if verify and sha256_file(path) != ev.sha256:
        audit.record(db, actor=actor, action="integrity_failure", case_id=ev.case_id, target_type="evidence", target_id=ev.id)
        db.commit()
        raise AppError(409, "INTEGRITY_MISMATCH", "Stored file no longer matches its recorded SHA-256", {"expected": ev.sha256})
    return FileResponse(path, media_type=ev.mime_type or "application/octet-stream", filename=sanitize_filename(ev.original_filename),
                        content_disposition_type="inline", headers={"X-Content-SHA256": ev.sha256})
