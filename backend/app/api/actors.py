from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case
from app.db import get_db
from app.errors import AppError
from app.models import Actor, ActorLink, Case, VehicleTrack, EvidenceFile, SensorSource, WitnessClaim, WitnessStatement, Witness
from app.services import audit

router = APIRouter(tags=["actors"])


class ActorCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    kind: Literal["vehicle", "pedestrian", "cyclist", "other"] = "vehicle"
    attributes: dict = Field(default_factory=dict, description="e.g. {'color': 'blue', 'type': 'car', 'ego': true}")


def actor_out(a: Actor) -> dict:
    return {"id": a.id, "case_id": a.case_id, "label": a.label, "kind": a.kind, "attributes": a.attributes or {}}


def link_out(l: ActorLink) -> dict:
    return {"id": l.id, "actor_id": l.actor_id, "ref_type": l.ref_type, "ref_id": l.ref_id, "status": l.status, "basis": l.basis,
            "decided_by": l.decided_by, "decided_at": l.decided_at}


@router.post("/cases/{case_id}/actors", status_code=201)
def create_actor(body: ActorCreate, case: Case = Depends(get_case), db: Session = Depends(get_db), actor: str = Depends(get_actor)) -> dict:
    a = Actor(case_id=case.id, label=body.label, kind=body.kind, attributes=body.attributes)
    db.add(a)
    db.flush()
    audit.record(db, actor=actor, action="actor_created", case_id=case.id, target_type="actor", target_id=a.id)
    db.commit()
    return actor_out(a)


@router.get("/cases/{case_id}/actors")
def list_actors(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    items = db.execute(select(Actor).where(Actor.case_id == case.id).order_by(Actor.label)).scalars().all()
    links = db.execute(select(ActorLink).where(ActorLink.actor_id.in_([a.id for a in items]))).scalars().all() if items else []
    return {"items": [actor_out(a) | {"links": [link_out(l) for l in links if l.actor_id == a.id]} for a in items]}


class LinkCreate(BaseModel):
    ref_type: Literal["track", "sensor_source", "claim"]
    ref_id: str = Field(min_length=1, max_length=64)
    status: Literal["candidate", "confirmed"] = "candidate"
    basis: dict = Field(default_factory=dict)


def validate_reference(db, a, ref_type, ref_id):
    if ref_type == "track":
        row = db.get(VehicleTrack, ref_id)
        ev = db.get(EvidenceFile, row.evidence_id) if row else None
        case_id = ev.case_id if ev else None
    elif ref_type == "sensor_source":
        row = db.get(SensorSource, ref_id)
        case_id = row.case_id if row else None
    else:
        row = db.get(WitnessClaim, ref_id)
        st = db.get(WitnessStatement, row.statement_id) if row else None
        w = db.get(Witness, st.witness_id) if st else None
        case_id = w.case_id if w else None
    if case_id != a.case_id:
        raise AppError(422, "INVALID_IDENTITY_REFERENCE", "Choose evidence from this case")


@router.post("/actors/{actor_id}/links", status_code=201)
def add_link(actor_id: str, body: LinkCreate, db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Identity decisions. 'confirmed' is an investigator's decision and is audited; contradiction rules use confirmed links only."""
    a = db.get(Actor, actor_id)
    if a is None:
        raise AppError(404, "ACTOR_NOT_FOUND", f"No actor with id {actor_id}")
    validate_reference(db, a, body.ref_type, body.ref_id)
    existing = db.execute(select(ActorLink).where(ActorLink.ref_type == body.ref_type, ActorLink.ref_id == body.ref_id,
                                                  ActorLink.status == "confirmed")).scalars().first()
    if existing and body.status == "confirmed" and existing.actor_id != a.id:
        raise AppError(409, "ALREADY_CONFIRMED", "This reference is already confirmed for another actor")
    same = db.execute(select(ActorLink).where(ActorLink.actor_id == a.id, ActorLink.ref_type == body.ref_type,
                                             ActorLink.ref_id == body.ref_id, ActorLink.status == body.status)).scalars().first()
    if same:
        return link_out(same)
    link = ActorLink(actor_id=a.id, ref_type=body.ref_type, ref_id=body.ref_id, status=body.status, basis=body.basis or {"source": "investigator"})
    if body.status == "confirmed":
        from datetime import datetime, timezone
        link.decided_by, link.decided_at = who, datetime.now(timezone.utc)
    db.add(link)
    db.flush()
    audit.record(db, actor=who, action=f"actor_link_{body.status}", case_id=a.case_id, target_type="actor_link", target_id=link.id,
                 details={"actor": a.id, "ref_type": body.ref_type, "ref_id": body.ref_id})
    db.commit()
    return link_out(link)


@router.post("/actor-links/{link_id}/{decision}")
def decide_link(link_id: str, decision: Literal["confirm", "reject"], db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    from datetime import datetime, timezone
    link = db.get(ActorLink, link_id)
    if link is None:
        raise AppError(404, "LINK_NOT_FOUND", f"No link with id {link_id}")
    if decision == "confirm":
        validate_reference(db, db.get(Actor, link.actor_id), link.ref_type, link.ref_id)
        other = db.execute(select(ActorLink).where(ActorLink.ref_type == link.ref_type, ActorLink.ref_id == link.ref_id,
                                                  ActorLink.status == "confirmed", ActorLink.actor_id != link.actor_id)).scalars().first()
        if other:
            raise AppError(409, "ALREADY_CONFIRMED", "This reference is already confirmed for another actor")
    link.status = "confirmed" if decision == "confirm" else "rejected"
    link.decided_by, link.decided_at = who, datetime.now(timezone.utc)
    audit.record(db, actor=who, action=f"actor_link_{link.status}", case_id=db.get(Actor, link.actor_id).case_id, target_type="actor_link", target_id=link.id)
    db.commit()
    return link_out(link)
