from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case
from app.db import get_db
from app.errors import AppError
from app.models import (Actor, Case, Contradiction, Corroboration, Event, EventSummary, GapRecord, InvestigationFinding, ReconstructionScenario,
                        Trajectory)
from app.services import audit, engine_rules as rules, reconstruct, sync

router = APIRouter(tags=["reconstruction"])
NOTE = "Derived analysis for investigator review. Observations, claims and inferences are kept apart; nothing here assigns fault or legal responsibility."


def scenario_out(s: ReconstructionScenario) -> dict:
    a = s.assumptions or {}
    return {"id": s.id, "case_id": s.case_id, "name": s.name, "is_baseline": s.is_baseline, "created_by": s.created_by, "created_at": s.created_at,
            "assumptions": {k: a.get(k) for k in ("edge_offsets", "exclude_edges", "reference", "unconfirm_links")}, "build": a.get("build"),
            "unsynchronized_sources": (a.get("build") or {}).get("unsynchronized_sources")}


def get_scenario(db: Session, case: Case, scenario_id: str | None) -> ReconstructionScenario:
    if scenario_id:
        s = db.get(ReconstructionScenario, scenario_id)
        if s is None or s.case_id != case.id:
            raise AppError(404, "SCENARIO_NOT_FOUND", "No such scenario in this case")
        return s
    s = db.execute(select(ReconstructionScenario).where(ReconstructionScenario.case_id == case.id, ReconstructionScenario.is_baseline.is_(True))
                   .order_by(ReconstructionScenario.created_at.desc())).scalars().first()
    if s is None:
        raise AppError(409, "NO_RECONSTRUCTION", "No reconstruction has been built for this case yet", {"build": f"/api/v1/cases/{case.id}/reconstruction/scenarios"})
    return s


class ScenarioBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    edge_offsets: dict[str, float] = Field(default_factory=dict, description="sync edge id -> alternative offset_ms for this scenario only")
    exclude_edges: list[str] = Field(default_factory=list)
    reference: str | None = Field(default=None, description="evidence id whose clock defines case time")
    unconfirm_links: list[str] = Field(default_factory=list, description="actor link ids to ignore in this scenario")
    baseline: bool | None = None


@router.post("/cases/{case_id}/reconstruction/scenarios", status_code=201)
def create_scenario(body: ScenarioBody, case: Case = Depends(get_case), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Build a reconstruction. Scenarios are independent; the first one is the baseline. Evidence and other scenarios are never modified."""
    has = db.execute(select(ReconstructionScenario.id).where(ReconstructionScenario.case_id == case.id)).first() is not None
    scn = ReconstructionScenario(case_id=case.id, name=body.name, is_baseline=(not has) if body.baseline is None else body.baseline, created_by=who,
                                 assumptions={"edge_offsets": body.edge_offsets, "exclude_edges": body.exclude_edges, "reference": body.reference,
                                              "unconfirm_links": body.unconfirm_links})
    db.add(scn)
    db.flush()
    if scn.is_baseline and has:
        for o in db.execute(select(ReconstructionScenario).where(ReconstructionScenario.case_id == case.id, ReconstructionScenario.id != scn.id)).scalars():
            o.is_baseline = False
    reconstruct.build(db, case, scn, who)
    db.commit()
    return scenario_out(scn) | {"note": NOTE}


@router.get("/cases/{case_id}/reconstruction/scenarios")
def list_scenarios(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    rows = db.execute(select(ReconstructionScenario).where(ReconstructionScenario.case_id == case.id).order_by(ReconstructionScenario.created_at)).scalars()
    return {"items": [scenario_out(s) for s in rows]}


def event_out(e: Event) -> dict:
    return {"id": e.id, "category": e.category, "event_type": e.event_type, "title": e.title, "actor_id": e.actor_id, "actor_candidates": e.actor_candidates,
            "start_ms": e.start_case_ms, "end_ms": e.end_case_ms, "uncertainty_ms": e.uncertainty_ms, "uncertainty_basis": e.uncertainty_basis,
            "synchronized": e.start_case_ms is not None, "source_type": e.source_type, "source_id": e.source_id, "observations": e.observations,
            "inference": e.inference, "confidence": e.confidence, "provenance": e.provenance, "synthetic": e.synthetic, "review_status": e.review_status,
            "scenario_id": e.scenario_id}


def _events(db: Session, scn: ReconstructionScenario) -> list[Event]:
    return list(db.execute(select(Event).where(Event.scenario_id == scn.id)).scalars())


def _lane(e: Event) -> str:
    return {"video_cctv": "cctv", "video_dashcam": "dashcam", "sensor": "sensor", "witness": "witness", "engine": "inference"}.get(e.source_type, e.source_type)


@router.get("/cases/{case_id}/timeline")
def timeline(scenario_id: str | None = None, category: str | None = None, event_type: str | None = None, actor_id: str | None = None,
             case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    """Events on one case clock, grouped into lanes. Events from sources with no clock relation are listed separately and are never
    ordered against the others. Pairs of events are related only as overlapping, N s apart, or undetermined."""
    scn = get_scenario(db, case, scenario_id)
    rows = _events(db, scn)
    sel = [e for e in rows if (not category or e.category == category) and (not event_type or e.event_type == event_type) and (not actor_id or e.actor_id == actor_id)]
    placed = sorted([e for e in sel if e.start_case_ms is not None], key=lambda e: (e.start_case_ms, e.id))
    loose = [e for e in sel if e.start_case_ms is None]
    lanes: dict[str, list] = {}
    for e in placed:
        lanes.setdefault(_lane(e), []).append(event_out(e))
    cons = db.execute(select(Contradiction).where(Contradiction.scenario_id == scn.id)).scalars().all()
    crbs = db.execute(select(Corroboration).where(Corroboration.scenario_id == scn.id)).scalars().all()
    marks: dict[str, dict] = {}
    for c in cons:
        for i in (c.event_a, c.event_b):
            marks.setdefault(i, {"contradicted_by": [], "corroborated_by": []})["contradicted_by"].append(c.id)
    for c in crbs:
        for i in c.events:
            marks.setdefault(i, {"contradicted_by": [], "corroborated_by": []})["corroborated_by"].append(c.id)
    span = [min((e.start_case_ms for e in placed), default=None), max(((e.end_case_ms if e.end_case_ms is not None else e.start_case_ms) for e in placed), default=None)]
    return {"scenario": scenario_out(scn), "time_unit": "ms on the case clock (reference source time 0 = 0 ms)", "span_ms": span, "lanes": lanes,
            "unplaced": [event_out(e) for e in loose], "marks": marks,
            "unplaced_note": "These events come from sources whose clock is not related to any other, or from statements with no usable time. They are not ordered against placed events.",
            "note": NOTE}


@router.get("/events/{event_id}")
def event_detail(event_id: str, db: Session = Depends(get_db)) -> dict:
    e = db.get(Event, event_id)
    if e is None:
        raise AppError(404, "EVENT_NOT_FOUND", f"No event with id {event_id}")
    scn_rows = _events(db, db.get(ReconstructionScenario, e.scenario_id))
    comparables = [x for x in scn_rows if x.id != e.id and e.start_case_ms is not None and x.start_case_ms is not None]
    def rel(x: Event) -> str:
        a0, a1 = e.start_case_ms - e.uncertainty_ms, (e.end_case_ms or e.start_case_ms) + e.uncertainty_ms
        b0, b1 = x.start_case_ms - x.uncertainty_ms, (x.end_case_ms or x.start_case_ms) + x.uncertainty_ms
        if a0 <= b1 and b0 <= a1:
            return "overlapping"
        return "before" if a1 < b0 else "after"
    near = [{"id": x.id, "title": x.title, "relation": rel(x)} for x in comparables if abs(x.start_case_ms - e.start_case_ms) <= 3000][:20]
    return event_out(e) | {"nearby": near, "note": NOTE}


@router.get("/events/{event_id}/summary")
def event_summary(event_id: str, db: Session = Depends(get_db)) -> dict:
    e = db.get(Event, event_id)
    if e is None:
        raise AppError(404, "EVENT_NOT_FOUND", f"No event with id {event_id}")
    s = db.get(EventSummary, (event_id, e.scenario_id))
    if s is None:
        raise AppError(404, "SUMMARY_NOT_FOUND", "No summary was generated for this event")
    return s.content | {"generated_by": "template from stored records; no model-written text", "note": NOTE}


@router.get("/cases/{case_id}/seek")
def seek(case_ms: float = Query(...), scenario_id: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    """Per video: the media time that corresponds to a case-clock time (null if that video is unsynchronized or the time is outside it)."""
    scn = get_scenario(db, case, scenario_id)
    sol = (scn.assumptions or {}).get("sync_solution") or {}
    lk = sync.lookup(sol) if sol else {}
    out = []
    for ev_id, m in lk.items():
        out.append({"evidence_id": ev_id, "media_ms": case_ms - m["offset"], "bound_ms": m["bound"], "group": m["group"]})
    return {"case_ms": case_ms, "targets": out, "unsynchronized": sol.get("unsynchronized", [])}


@router.get("/cases/{case_id}/contradictions")
def contradictions(scenario_id: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    scn = get_scenario(db, case, scenario_id)
    rows = db.execute(select(Contradiction).where(Contradiction.scenario_id == scn.id)).scalars()
    return {"scenario_id": scn.id, "items": [{"id": c.id, "rule_id": c.rule_id, "event_a": c.event_a, "event_b": c.event_b, "strength": c.strength, "basis": c.basis,
                                              "explanation": c.explanation_template, "unresolved_questions": c.unresolved_questions, "review_status": c.review_status} for c in rows],
            "note": "A contradiction means two sources describe the same thing differently. It does not say which source is wrong."}


@router.get("/cases/{case_id}/corroborations")
def corroborations(scenario_id: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    scn = get_scenario(db, case, scenario_id)
    rows = db.execute(select(Corroboration).where(Corroboration.scenario_id == scn.id)).scalars()
    return {"scenario_id": scn.id, "items": [{"id": c.id, "rule_id": c.rule_id, "events": c.events, "independent": c.independent, "independence_reason": c.independence_reason,
                                              "temporal_relation": c.temporal_relation, "explanation": c.explanation_template, "review_status": c.review_status} for c in rows],
            "note": "Agreement between independent sources raises plausibility; it does not prove an event."}


@router.get("/cases/{case_id}/gaps")
def gaps(scenario_id: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    scn = get_scenario(db, case, scenario_id)
    rows = db.execute(select(GapRecord).where(GapRecord.scenario_id == scn.id)).scalars()
    return {"scenario_id": scn.id, "items": [{"id": g.id, "gap_type": g.gap_type, "scope": g.scope, "details": g.details, "recommendation": g.recommendation, "refs": g.refs} for g in rows]}


@router.get("/cases/{case_id}/trajectories")
def trajectories(scenario_id: str | None = None, frame: Literal["image", "ground_plane"] | None = None, actor_id: str | None = None,
                 case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    scn = get_scenario(db, case, scenario_id)
    q = select(Trajectory).where(Trajectory.scenario_id == scn.id)
    if frame:
        q = q.where(Trajectory.frame == frame)
    if actor_id:
        q = q.where(Trajectory.actor_id == actor_id)
    return {"scenario_id": scn.id, "items": [{"id": t.id, "actor_id": t.actor_id, "frame": t.frame, "camera_id": t.camera_id, "track_ref": t.track_ref, "points": t.points,
                                              "calibration_note": t.calibration_note} for t in db.execute(q).scalars()],
            "note": "Image-frame trajectories are pixels. Ground-plane trajectories exist only where a camera has a usable calibration and carry per-point uncertainty."}


@router.get("/cases/{case_id}/collision-candidates")
def collision_candidates(scenario_id: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    scn = get_scenario(db, case, scenario_id)
    ev = [e for e in _events(db, scn) if e.event_type in ("possible_collision", "collision_flag", "acceleration_spike") and e.category != "inference"]
    cands = sorted(ev, key=lambda e: (e.start_case_ms is None, e.start_case_ms or 0))
    return {"scenario_id": scn.id, "items": [event_out(e) for e in cands],
            "note": "Candidates only. A collision is not established by one detection; independent agreement is listed under corroborations."}


def finding_out(f: InvestigationFinding) -> dict:
    return {"id": f.id, "scenario_id": f.scenario_id, "kind": f.kind, "ref_ids": f.ref_ids, "text": f.text, "review_status": f.review_status, "reviewer": f.reviewer, "reviewed_at": f.reviewed_at}


@router.get("/cases/{case_id}/findings")
def findings(scenario_id: str | None = None, kind: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    scn = get_scenario(db, case, scenario_id)
    q = select(InvestigationFinding).where(InvestigationFinding.scenario_id == scn.id)
    if kind:
        q = q.where(InvestigationFinding.kind == kind)
    return {"scenario_id": scn.id, "items": [finding_out(f) for f in db.execute(q.order_by(InvestigationFinding.id)).scalars()]}


class Review(BaseModel):
    review_status: Literal["unreviewed", "reviewed", "disputed"]


@router.patch("/findings/{finding_id}")
def review_finding(finding_id: str, body: Review, db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    f = db.get(InvestigationFinding, finding_id)
    if f is None:
        raise AppError(404, "FINDING_NOT_FOUND", f"No finding with id {finding_id}")
    f.review_status, f.reviewer, f.reviewed_at = body.review_status, who, datetime.now(timezone.utc)
    audit.record(db, actor=who, action="finding_reviewed", case_id=f.case_id, target_type="finding", target_id=f.id, details={"status": body.review_status})
    db.commit()
    return finding_out(f)


@router.get("/cases/{case_id}/reconstruction/diff")
def diff(a: str, b: str, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    """What changes between two scenarios: placed times of the same source events, and which contradictions / corroborations exist."""
    sa, sb = get_scenario(db, case, a), get_scenario(db, case, b)
    def sig_events(s):
        return {(e.provenance or {}).get("source_event_id") or e.id: e for e in _events(db, s) if (e.provenance or {}).get("source_event_id")}
    ea, eb = sig_events(sa), sig_events(sb)
    moved = [{"source_event": k, "title": ea[k].title, "a_ms": ea[k].start_case_ms, "b_ms": eb[k].start_case_ms} for k in ea.keys() & eb.keys()
             if ea[k].start_case_ms != eb[k].start_case_ms]
    def rule_set(s):
        c = [(x.rule_id, x.strength) for x in db.execute(select(Contradiction).where(Contradiction.scenario_id == s.id)).scalars()]
        r = [x.rule_id for x in db.execute(select(Corroboration).where(Corroboration.scenario_id == s.id)).scalars()]
        return sorted(c), sorted(r)
    (ca, ra), (cb, rb) = rule_set(sa), rule_set(sb)
    return {"a": sa.id, "b": sb.id, "moved_events": sorted(moved, key=lambda m: m["source_event"]), "contradictions": {"a": ca, "b": cb}, "corroborations": {"a": ra, "b": rb},
            "assumptions_a": scenario_out(sa)["assumptions"], "assumptions_b": scenario_out(sb)["assumptions"]}
