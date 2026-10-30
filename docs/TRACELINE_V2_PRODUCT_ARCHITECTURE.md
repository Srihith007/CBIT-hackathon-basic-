# TraceLine V2 product architecture

Date: 2026-10-30. Branch `feat/traceline-investigation-flow-v2` at the merge of `cursor/real-video-pipeline-c915` (`3bbca88`) and `origin/claude/final-audit`. This is a classification of the code on that branch. It does not add behavior.

The full V2 master prompt, including the named list of 24 scenarios and 15 multi-camera scenarios, is not in this repository and was not in the agent store. Classifications below follow the phase summary that was given with this branch. A capability that is only named in a prompt that is not in the tree is marked **not implemented** here rather than described as if it had been built.

## How a row is classified

| Label | Meaning on this branch |
|---|---|
| Implemented and verified | The code path exists, and a recorded test or a recorded run on real footage already checked it. This document did not re-run those checks. |
| Implemented, not verified on real footage | The code path exists. Coverage is a fixture, a unit test, or a stand-in client. No real uploaded file exercised it in the recorded audits. |
| Partial | Some of the requested behavior exists. The rest is absent or only a display of another field. |
| Hardcoded | A fixed string, label, or rule phrase stands in for a measurement or a model answer. |
| Not implemented | No code path produces it. |

Backend files were not changed by the merge. On 2026-10-30, from `backend/`, `./.venv/bin/python -m pytest -q --tb=line` reported **194 passed, 17 skipped, 0 failed** (68.89s). The 17 skips are the 12 reconstruction tests and 4 report tests that need `scripts/build_scenarios.py` packages, plus the accident-cue validation image split. Frontend `npm test` on this merge: **55 passed, 0 failed**. Firefox and Safari were not installed and were not run. Chrome measurements in `docs/FINAL_FRONTEND_AUDIT.md` are earlier passes, not a re-check of this merge.

## Local database, not in git

Case `TL-C30DD7` / `case_d255f851d423` / evidence `ev_289b77d5484e` was rebuilt in the local development database after `3bbca88`. Source events for that evidence are the current generator output: **139** rows (91 `potential_interaction`, 11 `vehicle_enters_scene`, 9 `vehicle_slowing`, 6 `vehicle_leaves_scene`, 6 `possible_near_miss`, 5 `vehicle_stopped`, 4 `possible_collision`, 4 `vehicle_direction_change`, 3 `vehicle_maneuver_observed`). The new baseline scenario is `scn_e4f120bf44cc`. `GET /cases/case_d255f851d423/incident-events` returned `contact_status` `possible_collision`, 139 items, 0 unplaced. `GET /incident-narrative` returned the deterministic headline and `ai_narrative: null` with reason `policy_blocked` (`allow_external_inference` is false on that case; Featherless is also unconfigured). The two older scenarios still hold 1,093 canonical events each because events are append-only. They are not the baseline. No video, database, or code commit was made for that rebuild. `docs/REMAINING_ISSUES.md` still describes the pre-rebuild 1,093-row timeline.

## Phase 1 — this document

| Capability | Class |
|---|---|
| Written capability audit | Implemented. This file. Not a product feature. |

## Phase 2 — five-page shell

Routes today (`frontend/src/App.jsx`): `/` landing, `/dashboard`, `/new`, `/cases/:caseId` workspace, `/cases/:caseId/report`. The sidebar is Dashboard and New investigation.

| Capability | Class |
|---|---|
| Dashboard page reading API totals, cases, jobs, recent evidence | Implemented and verified by frontend unit tests and the earlier Chrome audit. Not re-shot after this merge. |
| Cases as its own page | Not implemented. Cases appear on the dashboard table and in the command palette. |
| Evidence as its own page | Not implemented. Evidence is a tab and a list inside the workspace. |
| Reconstruction as its own page | Not implemented. The workspace is the reconstruction view. |
| Reports as its own page | Partial. One report route per case. No reports index. |
| Shared case context across those five pages | Not implemented. Workspace and report share the case id in the URL. Dashboard is global. |
| Real backend values only on the screens that exist | Implemented and verified for the dashboard and workspace unit tests (mocked API). The live selected-case workspace was checked in Chrome before this merge, against the old timeline. |

## Phase 3 — guided flow

| Capability | Class |
|---|---|
| Landing | Implemented. Copy is product text, not case data. Not re-checked in a browser on this branch. |
| Create investigation | Implemented and verified by `NewCase` tests and `POST /cases`. |
| Upload | Implemented and verified. Same-bytes upload in one case returns the existing evidence (`duplicate: true`) because of `uq_evidence_case_sha`. |
| Synthetic file refused on a real case | Implemented and verified by `test_synthetic_separation.py`. The upload fails with 422 before staging. |
| Processing UI uses real job stages | Implemented. Stages the runner actually has: `validate`, `preprocess`, `extract_interval`, `detect`, `track`, `extract_claims`. Dashboard and New Case label those strings. Progress is the work-unit fraction from the job, capped at 0.99 until the stage finishes. Unit tests cover a failed `detect` stage and an in-progress job. A full guided click-through was not repeated on this merge. |
| Invented pipeline stages | Not implemented. The UI does not add a stage the API did not return. |

## Phase 4 — evidence and sensor ingestion

| Capability | Class |
|---|---|
| More than one video on a case | Implemented and verified. Two real files with no sync edge stay unplaced (`docs/FINAL_BACKEND_AUDIT.md`). |
| Source id | Implemented. `evidence_files.id` (`ev_…`). |
| Kind CCTV or dashcam | Implemented. Chosen at upload. It is a declaration, not a measurement that the camera moved. |
| Original filename | Implemented. Display only. Immutable with the evidence row. |
| Original bytes preserved | Implemented and verified. `GET /evidence/{id}/original?verify=true` matched the selected file hash. Playback is a separate derived file. |
| Duration, fps, coded size, rotation, container PTS | Implemented and verified on the real clips (`video_metadata`). |
| Timezone column on video | Partial. `video_metadata.timezone` exists. The upload form does not collect it. Wall-clock recording time is not derived. `creation_time_claimed` is stored only when the container has that tag. |
| Clock offset, editable later | Partial. `PUT /evidence/{id}/clock` stores `clock_offset_ms` and a basis. The workspace does not offer that editor. |
| Location text for a camera | Not implemented. `cameras.label` exists. There is no location field on evidence or video metadata. |
| Start and end as investigator-entered recording bounds | Not implemented. Duration comes from the file. |
| Display name separate from the filename | Not implemented. |
| Witness statements and text spans | Implemented, not verified on real footage. Claims store `statement_id`, `char_start`, `char_end`, and `source_text`. A live Featherless call was not made. |
| Sensor CSV, column mapping, unit normalization, raw `t_raw` kept | Implemented, not verified on real footage. Fixture tests cover parsing. No sensor file was uploaded with the real clips. |
| GPS | Partial. Sensor analysis can compare haversine speed between lat/lon columns and a speed column (`gps_consistency`). There is no GPS track page and no real GPS file was ingested. |
| `docs/SENSOR_DATA_FORMAT.md` | Not implemented. Sensor behavior is described in `docs/SENSOR_PROCESSING_ARCHITECTURE.md`, which is an older design note, not this V2 format doc. |

## Phase 5 — per-source detection, tracking, events

| Capability | Class |
|---|---|
| Detections stored per evidence id | Implemented and verified on the real clips (YOLO26s, storage confidence 0.15, display default 0.25). |
| Tracker ids scoped to one video and one run | Implemented. `tracking.py` states they never claim identity across cameras. ByteTrack for `cctv`, BoT-SORT for `dashcam`. Continuations are candidates and are not merged. |
| Matching tracker ids across cameras | Not implemented. That is intentional. |
| Video events carry the evidence id | Implemented and verified. Types are the machine-detection set in `video_events.py` (`VIDEO_EVENTS_VERSION` 2). There is no event type `collision`. |
| Speeds | Hardcoded unit choice: box diagonals per second, not metres per second. The number is measured. The unit is not a world speed. |
| Accident cue | Implemented and verified as a separate model. It does not decide an event. |
| Contact | `possible_collision` requires image overlap and an abrupt box-speed drop. Overlap alone is `potential_interaction`. `visually_supported_contact` is a display class and is not emitted by the current rules. |

## Phase 6 — reconstruction

Clocks that exist:

| Clock | Class |
|---|---|
| Media-relative milliseconds (`time_ms`, player `currentTime`) | Implemented and verified. |
| Container PTS (`video_metadata.pts_start_ms`) | Implemented and verified. Frame times are relative to the first frame. PTS is kept beside that. |
| Case-relative time (`start_ms` / `start_case_ms`) | Implemented and verified. A lone source is its own reference at offset 0. Two sources with no edge stay unsynchronized and unplaced. |
| Estimated synchronized time | Partial. A confirmed sync edge places sources on one case clock. That is the sync solution, not a separate estimated-time field. |
| Wall clock of the recording | Not implemented. A container creation tag is not treated as the recording clock. |

| Capability | Class |
|---|---|
| Manual offsets | Partial. API `PUT /evidence/{id}/clock` and sync edges. No workspace control for typing an offset. |
| Overlap, gap, and clock-inconsistency records | Implemented. Gap types include `video_missing_interval`, `sensor_missing_interval`, `unsynchronized_source`, `clock_inconsistency`, `no_camera_calibration`, `unconfirmed_vehicle_identity`, `tracking_fragmentation`, `low_visual_quality`, `untestable_claim`, `no_visual_coverage_at_candidate_collision`. Real-clip runs produced missing-interval, brightness, calibration, and identity gaps. A clock-inconsistency gap was not produced by those files. |
| Cross-camera vehicle association as its own uncertain record | Not implemented. An investigator can confirm an `ActorLink`. Unconfirmed tracks stay class plus track id. There is no automatic cross-camera association row. |
| Duplicate upload counted as corroboration | Not implemented, and the ingest path prevents a second evidence row for the same bytes in one case. Corroboration requires two different evidence ids (`engine_rules.corroborate`). |
| Incomplete evidence | Partial. Gaps and unplaced events are stored and shown. There is no separate incomplete-evidence reconstruction mode and no `docs/INCOMPLETE_EVIDENCE_RECONSTRUCTION.md`. |
| Competing hypotheses | Partial. Inference rows can carry an `alternatives` list from rule text. Those phrases are written in `engine_rules.py`. They are not probabilities. A hypothesis is not emitted unless a rule fired. |
| Invented probabilities | Not implemented. |
| Contradiction versus missing evidence | Implemented as separate stores: contradictions and gaps. Cross-source contradiction rules were not exercised on the real clips because no sensor or witness was uploaded. The synthetic scenario packages that would exercise them were not in the checkout, so those tests were skipped. |
| `docs/RECONSTRUCTION_DATA_MODEL.md` | Not implemented. The live model is the tables in `backend/app/models/` and `docs/INTEGRATION_CONTRACT.md`. |
| Requested evidence-type names | Partial. Stored categories are `direct_observation`, `machine_detection`, `witness_claim`, `inference`. Source types include `sensor`. The names `witness_reported`, `sensor_observed`, `derived_observation`, `system_inference`, `hypothesis`, and `unknown` are not categories. Sensor readings use `direct_observation` plus `source_type` `sensor`. |

## Phase 7 — Featherless

| Capability | Class |
|---|---|
| Witness claim extraction with statement id and text span | Implemented, not verified on a live model. The job calls Featherless or refuses. Span equality is enforced. Tests use a stand-in client. |
| Incident narrative from stored scenario records only | Implemented. `incident.narrate` runs once at scenario build. Playback reads the stored document and does not call the model. |
| Reject a sentence with no valid evidence id, banned wording, or an unsupported contact claim | Implemented and verified by `test_incident_analysis.py`. |
| Failure leaves the deterministic summary and `ai_narrative` null | Implemented and verified with stand-in `NotConfigured` and `PolicyBlocked` clients, and on the rebuilt case (`policy_blocked`). The user-facing line is "AI narrative is unavailable." |
| Key only from the environment | Implemented. `FEATHERLESS_API_KEY` is read from settings. `allow_external_inference` is checked before the key. |
| Vision model on frames | Not implemented for the narrative. The configured vision model name is unused by that step. |
| `docs/FEATHERLESS_INTEGRATION.md` | Not implemented. Behavior is in `backend/app/llm/featherless.py`, `backend/app/services/incident.py`, and `docs/INTEGRATION_CONTRACT.md` section 7a. |

## Phase 8 — investigator workspace

The merged workspace is one route. There is no second multi-angle page and no evidence-detail workflow page.

| Capability | Class |
|---|---|
| Video player and existing clock | Implemented. Short-viewport cap and non-square `maxWidth` are both in `Player.jsx`. Not re-measured in Chrome after this merge. |
| Incident summary from the narrative endpoint | Implemented and verified by the workspace unit test. |
| Vehicles as class plus track id, plate only from a confirmed actor attribute | Implemented. |
| Keyframe gallery from stored extracted frames | Implemented. Empty state has no placeholder image. The live gallery was captured before the rebuild and before this merge. |
| Chronological incident cards under the video that seek the player | Implemented and verified by the unit test (one `requestSeek`, clock 1.583 s). |
| Timeline | Implemented. Key events / all events, plus the short-viewport chip row. |
| Evidence correlation | Implemented. Lists stored corroborations and contradictions. |
| Sensor panel | Partial. Closed inside Technical detail. Renders only when a `sensor_csv` evidence row exists. |
| Camera filter | Partial. The nav rail can set the primary video. It is not a reconstruction filter that drops other sources' events. |
| Trajectories off the default view | Implemented. Closed `<details>` labeled Technical detail. Unit test checks it is closed and that no `aria-label="Trajectories"` panel is on the page. |
| Before / during / after | Not implemented. |
| Storyboard | Not implemented. |
| Reconstruction scenario switcher | Partial. A scenario `<select>` appears only when the case has more than one scenario. |
| Technical inspector | Implemented from the merged audit UI (overview, findings, evidence, technical). Findings text is built from stored records in `overview.js`. |

## Phase 9 — reports

| Capability | Class |
|---|---|
| Full 16-section dossier | Implemented and verified. Default `POST /cases/{id}/reports` with `format` omitted or `full`. PDF and markdown were generated for the selected case before the event rebuild (`docs/REPORT_FORMAT.md`). |
| Investigator report, including an executive-summary section | Implemented and verified by `test_investigator_report.py` and a size measurement on the old 1,093-event scenario. The workspace Generate button requests this format. Full export requests `full`. |
| Separate executive and technical report products beyond those two formats | Not implemented. |
| Report list and markdown preview | Implemented. `GET /cases/{id}/reports` and `GET /reports/{id}/markdown`. The report page was exercised in the earlier Chrome audit, not after this merge. |
| PDF | Implemented and verified for the full dossier on the selected case. `GET /reports/{id}/pdf`. |
| Embedding an unvalidated model narrative | Not implemented. The report validator rejects banned wording. A failed narrative is not stored as model text. |

## Phase 10 — verification

| Capability | Class |
|---|---|
| Backend pytest suite | Implemented and verified on this branch: 194 passed, 17 skipped, 0 failed. |
| Frontend vitest, 55 tests | Implemented and verified on this merge before the merge commit. |
| The 24 V2 scenarios and 15 multi-camera scenarios | Not implemented. The named lists are not in the tree, so they were not written as tests and were not marked real or synthetic. |
| Screenshots at 1366×768, 1440×900, and 1920×1080 for five pages, the guided flow, and complete versus incomplete cases | Not implemented for V2. Older Chrome shots exist: pipeline timeline shots described in `docs/FINAL_FRONTEND_AUDIT.md` Record A, and `docs/frontend/screenshots/` from `claude/final-audit` (Record B). Neither set is a V2 five-page pass. |
| Safari and Firefox | Not run. |

## What later phases still have to build

Phases 2 through 10 of the V2 summary are not done. The largest gaps are the five-page shell, editable source metadata (name, location text, recording bounds, timezone), a workspace offset editor, cross-camera association as uncertain records rather than confirmed links, the V2 evidence-type names, the three missing docs (`SENSOR_DATA_FORMAT.md`, `INCOMPLETE_EVIDENCE_RECONSTRUCTION.md`, `RECONSTRUCTION_DATA_MODEL.md`, `FEATHERLESS_INTEGRATION.md`), before/during/after and storyboard, and the scenario tests once the named lists are available. Unsupported items stay written here. They are not filled with placeholder findings, cameras, times, plates, or make and model.
