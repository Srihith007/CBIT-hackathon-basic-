# Final frontend V2 audit

Branch `feat/traceline-investigation-flow-v2-frontend`, based on `feat/traceline-investigation-flow-v2` at `60c474f`, merged with backend `de0e5ae` (source metadata, contract §14). Files changed are under `frontend/` and `docs/` only. `backend/` was not edited by this branch; the only backend files present are the ones merged in from the backend branch.

## What was built

| Phase | Result |
|---|---|
| 2. Shell | One shell with exactly five sections: Dashboard, Cases, Evidence, Reconstruction, Reports. The selected case is remembered (`traceline.selectedCase`), shown in the sidebar and applied to bare `/evidence`, `/reconstruction`, `/reports` routes. With no remembered case those routes ask the user to pick one. Legacy `/cases/:id` and `/cases/:id/report` redirect. Responsive: sidebar, mobile nav, short-viewport workspace rules kept. Palette is navy and graphite with cyan and teal accents. |
| 3. Landing, create, upload, processing | Landing copy "Reconstruct the incident. Understand what happened." with Start Investigation and View Demo (disabled with an explanation when no demo case exists). Create investigation: title, incident date and time, location, description, optional reference, real or synthetic. Upload accepts several videos; each has camera name, camera type (CCTV, dashcam, other), location text, recording start and end, timezone, clock offset and stated uncertainty. Processing lists only the stages the API returns, with the API's progress. |
| 8. Reconstruction workspace | Order: video, incident summary, vehicles, key observations, keyframe gallery, chronological timeline, contradictions and gaps, reconstruction scenarios, technical details (closed). Camera filter (shown for two or more videos), recording gaps, cross-camera association cards, sensor panel, an Event tab with real frames before, during and after the selected event. The single player clock and the audit layout fixes are untouched. Trajectories stay in the closed technical details. |
| 9. Reports | Executive and Technical tabs, preview, generate, history, PDF link only when the report has a validated PDF. Executive maps to the backend `investigator` format and Technical to `full`. |
| Dashboard | Metrics are the backend's own numbers. Empty states replace decoration. |
| Cases | Search, data-type and status filters, sort, grid and table, create, edit title and status. Designation cannot be edited. |
| Evidence | Grid and table, preview, stored source details, hash and provenance, validation, job stages, synchronization state, offset to another source, witness statements, sensor status. |

## Storage of what the investigator enters

| Value | Stored |
|---|---|
| Title, description, reference (as `code`), designation | Backend, `POST /cases`, `PATCH /cases/{id}` |
| Camera name, camera type, location text, recording start and end, timezone | Backend, `PATCH /evidence/{id}/source` |
| Start time with timezone, clock offset, stated uncertainty | Backend, `PUT /evidence/{id}/clock`, basis `declared_by_investigator`. The UI refuses a start time without a stated uncertainty and sends a clock only when one of those fields was changed. |
| Offset to another source | Backend, `PATCH /evidence/{id}/source` |
| Incident date and time, incident location | This browser only, labelled "entered by you, saved in this browser only". No backend field exists. |

## Honest states

Missing data is shown as Not established, Unavailable, Insufficient evidence or "Not available from this backend build yet". Nothing computes a likelihood: hypotheses and associations carry no percentage, and the tests assert that no `%` appears in the hypotheses block. Associations are always labelled Uncertain. The UI never matches track numbers across cameras. Synthetic text is rendered only for cases whose designation or evidence is synthetic or mixed, and a real case never uploads with `synthetic=true`. There is no separate multi-angle page and no evidence-detail workflow page.

## Tests

`npx vitest run`: 8 files, 107 tests, 107 passed, 0 failed. `npx vite build`: succeeded.

| File | Tests | Covers |
|---|---|---|
| `src/App.test.jsx` | 23 | shell navigation (five links), case persistence across sections, pick-a-case, legacy redirects, stale case cleared, Cases search, filter, sort, empty, edit, Evidence metadata and sync status, stored source details, offset to another source, banners (real, synthetic, mixed), Reports executive and technical preview, PDF availability, generate |
| `src/pages/NewCase.test.jsx` | 15 | create payload, browser-only fields, upload source metadata (every field, Other kind), clock body, no default uncertainty, end before start, rejected upload, duplicate upload, real never synthetic, processing shows only real stages |
| `src/pages/Workspace.test.jsx` | 17 | section order, camera filter, timeline card seeks the single clock, hypotheses labelled with alternatives and no probability, not-available and empty states, completeness, association states, recording gaps, sensor Unavailable, before/during/after frames, synthetic and real banner |
| `src/components/IncidentAnalysis.test.jsx` | 5 | existing: card seeks the player, closed technical details, no Trajectories panel by default |
| `src/components/components.test.jsx`, `src/lib/*.test.js`, `src/pages/Dashboard.test.jsx` | 47 | existing |

## Screenshots

Captured with headless Chrome 156 against the Vite dev server and the live API, in `docs/frontend-v2/screenshots/`, each at `-1366x768`, `-1440x900` and `-1920x1080`:

| Prefix | Page |
|---|---|
| `landing` | Landing |
| `dashboard`, `cases` | Dashboard, Cases |
| `evidence-TL-C30DD7`, `reconstruction-TL-C30DD7`, `reports-TL-C30DD7` | Evidence, Reconstruction, Reports for the real case TL-C30DD7 |
| `guided-details` | Guided flow, first step (details) |
| `evidence-two-camera`, `reconstruction-two-camera` | Real case TL-395130, two cameras with no clock relation |
| `reconstruction-TL-C30DD7-full-1440x2800` | Whole reconstruction page, to show section order |

## What could not be captured or run

- **Complete-evidence case.** No real case has a synchronized second camera, a sensor file and a witness statement. TL-C30DD7 is the incomplete-evidence case: one video, no sensor, no witness. The two-camera case shows the unsynchronized state. No complete real case was fabricated.
- **Guided flow after the first step.** The upload step and the processing screen were not captured. Reaching them creates a case, and cases cannot be deleted. Their behaviour is covered by the 15 tests in `NewCase.test.jsx`, not by screenshots.
- **Live upload with source metadata.** The upload-then-PATCH-then-clock sequence ran against mocked API calls only. It was not run in a browser against the live API.
- **Firefox and Safari.** Not installed, not run. Only Chrome was used.
- **Features that depend on the backend, shown as not available.** The contract (§14) describes `associations`, `completeness`, timeline `hypotheses` and `overlaps`, and event `clocks`, `evidence_class` and `trace`. The backend at `de0e5ae` does not serve them yet (404 or absent key, checked live). The UI is written to the documented shapes. Component tests feed those shapes, so rendering of real data is tested, but not against a live response. See `docs/FRONTEND_V2_BACKEND_NEEDS.md`.
- **Not built.** An action to create an association (`POST /cases/{id}/associations`), a storyboard view, sensor column mapping, and rendering of `overlaps`.
- **Local API.** The dev API had to be restarted on the merged code and migration `0008` applied to the dev database for the source endpoint.

## Known limits

- Incident date, time and location are not persisted by the backend.
- Report format is read from each report's detail because the list does not carry it.
- A declared clock is trusted by the backend for synchronization. The UI warns about this and requires a stated uncertainty, but it cannot verify the declared time.
- A source offset set on the Evidence page applies to a reconstruction only after the next scenario build.
