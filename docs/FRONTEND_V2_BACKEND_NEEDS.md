# Frontend V2: what the UI needs from the backend

Branch `feat/traceline-investigation-flow-v2-frontend`. Read against `origin/feat/traceline-investigation-flow-v2` at `de0e5ae` (backend commits `077c185` docs, `843d52a` source metadata, `de0e5ae` tracker ids).

Rule used throughout: if a field or endpoint is missing, the UI shows **Not established**, **Unavailable**, **Insufficient evidence** or **Not available from this backend build yet**. It never fills a value in. Nothing here changes an existing field.

## 1. Documented in `docs/INTEGRATION_CONTRACT.md` §14 but not served yet

The contract describes these. The running backend at `de0e5ae` returns 404 or omits the key (checked against a live API after `alembic upgrade head`). The UI is built against the documented shape and degrades honestly.

| Contract item | Where the UI reads it | What the UI shows until it exists |
|---|---|---|
| `GET /cases/{id}/associations?scenario_id` | Reconstruction, Technical details, Cross-camera association | "Not available from this backend build yet. Cross-camera association is not established; track numbers on different cameras are not matched." When it returns `items: []`: "No cross-camera association is recorded." Cards are always labelled **Uncertain**, likelihood **Not established**. |
| `GET /cases/{id}/reconstruction/completeness?scenario_id` | Reconstruction, Scenarios | "Evidence completeness: Not available from this backend build yet." |
| timeline `hypotheses` array | Reconstruction, Scenarios | "Hypotheses: Not available from this backend build yet." The UI does not turn any inference event into a hypothesis by itself. |
| timeline `overlaps` array | not rendered yet | Nothing is drawn. No overlap is computed in the browser. |
| event `clocks` (media_ms, container_pts_ms, wall_clock, case_ms, synchronized_ms) | Event tab of the inspector | "Clock detail per event: Not available from this backend build yet." plus the case time already on the event. |
| event `evidence_class`, `trace` | Key observations, Event tab | Falls back to the stored `category` label ("Derived from detections", etc.). `trace` is shown only when present. |
| `POST /cases/{id}/associations` | not offered in the UI | The UI has no "mark as same vehicle" action. |

## 2. Fields the UI collects that have no backend home

| UI input | Where it goes today | Needed |
|---|---|---|
| Incident date and time (create investigation) | This browser only (`traceline.caseMeta.{caseId}`), shown with "entered by you, saved in this browser only" | `incident_at` on the case, `PATCH /cases/{id}` |
| Incident location text | Same | `location_text` on the case |
| Reference | Sent as `code` on `POST /cases` | Fine for now. A separate `reference` field would let `code` stay the system code. |
| Real versus synthetic | `designation` (exists) | none |
| Camera name, camera type (CCTV, dashcam, other), location text, recording start and end, timezone | `PATCH /evidence/{id}/source` (exists since `843d52a`) | none |
| Clock offset to true time | `PUT /evidence/{id}/clock` with `basis: declared_by_investigator`. The UI requires a stated uncertainty and never defaults it, because the backend trusts a declared clock for synchronization. | none |
| Clock offset to another source | `PATCH /evidence/{id}/source` (`clock_offset_ms` plus `clock_offset_reference_id`) | none. Applied only when the next scenario is built. |

## 3. Reads that would remove client-side work

| Need | Reason |
|---|---|
| `format` in `GET /cases/{id}/reports` list items | The Reports page labels a report Executive or Technical from its `format`. The list does not carry it, so the page reads each report's detail. |
| Cross-case `GET /activity`, `GET /jobs?status=`, `GET /findings?review_status=` (already listed in the contract's open items) | The Dashboard fans out per case. |
| Sensor column-mapping and unit endpoints | The Evidence page says "Column mapping and unit normalization are not available in this interface yet". The format is in `docs/SENSOR_DATA_FORMAT.md`. |
| Wall-clock recording time for events | Needs a trusted clock record. Until `clocks.wall_clock` is served the UI shows no wall-clock time for events. |
| Real-versus-synthetic on upload to a real case | The backend already rejects it (422). The UI never sends `synthetic=true` for a real case. |

## 4. Behaviour the UI relies on

- Upload of identical bytes returns `200` with `duplicate: true` and no job. The UI says "Already in this case" and does not patch the existing source.
- `kind: other` stores the video and skips detection and tracking. The UI says so next to the camera type.
- Job stages are `validate`, `preprocess`, `extract_interval`, `detect`, `track`, `extract_claims`. The processing screen lists only stages the API returns.
- A report's `has_pdf` decides whether the PDF link is offered.
