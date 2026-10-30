"""Plain-dict response builders (keeps the API shape explicit and stable)."""
from app.models import Case, EvidenceFile, ProcessingJob, VideoMetadata, WitnessStatement


def evidence_out(ev: EvidenceFile, vm: VideoMetadata | None = None) -> dict:
    out = {
        "id": ev.id, "case_id": ev.case_id, "kind": ev.kind, "original_filename": ev.original_filename, "mime_type": ev.mime_type,
        "size_bytes": ev.size_bytes, "sha256": ev.sha256, "uploaded_at": ev.uploaded_at, "synthetic": ev.synthetic,
        "provenance": ev.provenance, "licence": ev.licence, "status": ev.status, "validation": ev.validation,
        "links": {"original": f"/api/v1/evidence/{ev.id}/original"},
    }
    if vm is not None and vm.playback_path:
        out["links"]["stream"] = f"/api/v1/evidence/{ev.id}/stream"
        out["links"]["frames"] = f"/api/v1/evidence/{ev.id}/frames"
    if vm is not None:
        out["video"] = {"duration_ms": vm.duration_ms, "fps_nominal": vm.fps_nominal, "fps_measured": vm.fps_measured, "width": vm.width,
                        "height": vm.height, "codec": vm.codec, "rotation": vm.rotation, "frame_count": vm.frame_count,
                        "pts_start_ms": vm.pts_start_ms, "playback_ready": bool(vm.playback_path),
                        "creation_time_claimed": vm.creation_time_claimed,
                        "note": "creation_time_claimed is embedded metadata, not a verified or synchronized time"}
    return out


def job_out(job: ProcessingJob) -> dict:
    return {"id": job.id, "case_id": job.case_id, "evidence_id": job.evidence_id, "stage": job.stage, "status": job.status,
            "progress": job.progress, "attempts": job.attempts, "error": job.error, "params": job.params, "result": job.result, "created_at": job.created_at,
            "started_at": job.started_at, "finished_at": job.finished_at}


def case_out(case: Case, counts: dict | None = None) -> dict:
    out = {"id": case.id, "code": case.code, "title": case.title, "description": case.description, "status": case.status,
           "designation": case.designation, "allow_external_inference": case.allow_external_inference,
           "created_at": case.created_at, "updated_at": case.updated_at}
    if counts is not None:
        out["counts"] = counts
    return out


def statement_out(st: WitnessStatement) -> dict:
    return {"id": st.id, "witness_id": st.witness_id, "evidence_id": st.evidence_id, "text_original": st.text_original,
            "source": st.source, "statement_time": st.statement_time, "synthetic": st.synthetic}
