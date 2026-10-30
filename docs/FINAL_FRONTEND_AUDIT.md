# FINAL_FRONTEND_AUDIT

Branch `claude/final-audit`. Backend files were not modified. Backend under test = `main` (Cursor's `cursor/real-video-pipeline-c915` is not merged and was not tested; it changes `width/height` semantics and job `progress`, see issues). Real clip: ACCIDENT benchmark t-bone (CC BY-NC-SA), uploaded through the live API as a `real` case.

## Test results
- Frontend unit/component tests: **50 passed, 0 failed** (`npm test`); production build passes.
- API integration audit `node frontend/audit/api-audit.mjs`: **165 checks passed, 0 failed** across 6 cases (4 synthetic demos, 2 real clips) before the final extra cases were added; covers dashboard totals, stream range support, event ids/sources/spans, case-to-media time mapping for every video and sensor event, overlay boxes == stored detections (same time and bbox), track ids == stored tracks, findings/contradictions/corroborations/gap references, summaries, and report content vs the case (code, scenario, evidence, counts, synthetic label).
- Browser (live): on the real clip, 69/69 overlay boxes drawn on the canvas at the mapped positions at 6 seek times; 22/22 timeline events seek to exactly their own media time (0 ms error); 3 s of playback kept video, case readout and media readout within 17 ms (rate 1.01); 30 rapid scrubs ended on the last target with no stuck "seeking"; report page generated v3 for the right case (code TL-CCDBD7, "contains no synthetic data", validation passed).

## Checklist
| # | Item | Result |
|---|---|---|
| 1 | Dashboard shows real case info | Pass (totals equal API) |
| 2 | Correct uploaded video | Pass (stream is the case's evidence; 206 ranges) |
| 3 | Detections at correct timestamps | Pass (boxes == stored detections; non-square-pixel bug fixed, see below) |
| 4 | Track ids match backend | Pass |
| 5 | Timeline markers from backend events | Pass |
| 6 | Event selection seeks correctly | Pass (0 ms error) |
| 7 | Playback/timeline sync | Pass |
| 8 | Summary from actual findings | Pass; fixed misleading output on busy real footage (below) |
| 9 | Findings link to evidence | Pass |
| 10 | Synthetic cannot leak into real | **Backend gap**, mitigated in UI (below) |
| 11 | Empty/failed states honest | Pass: corrupt upload rejected with message (tested), no-detection and no-event cases say so, no-evidence case does not crash |
| 12 | Report uses the selected case | Pass; see issue on size |

## Defects found and fixed in the frontend
1. **Real busy scene misled the summary:** 1028 events (903 `potential_interaction`) made "1012 key events", 88 findings and five near-identical "possible contact" cards. Now `potential_interaction` is not a key event, uncorroborated candidates of one type are grouped into one finding (all stay in Technical), the headline says "41 candidates flagged, most may be false alarms, none confirmed", unconfirmed vehicles are named by track id, scrubber ticks cluster.
2. **Box drift on non-square-pixel video** (1280x720 coded shown as 1280x723): overlay mapping now uses the API's coded size.
3. **Selecting an event changed nothing visible** in the Overview: added a "Selected moment" card with source buttons.
4. **Synthetic evidence in a `real` case:** the backend keeps `designation: real`. The workspace now shows MIXED plus a warning naming the files (tested).
5. Empty timeline now states why; layout compacted so video, scrubber, controls and summary fit at 1366x768 and the timeline starts in view at 1920x1080 (at 768-900 px height the timeline needs a scroll).

## API integration issues (for Cursor; no contract changed)
- Backend accepts synthetic uploads into a real case and does not derive `mixed`; the dashboard cannot warn because case counts carry no synthetic flag.
- Busy real footage yields ~900 `potential_interaction` and ~85 collision/near-miss candidates; rule thresholds need tuning and/or a significance field.
- Report content lists every event (1028 entries, ~195 KB markdown) for the real clip.
- Cursor's branch says `video.width/height` are the coded grid and rotation is not applied to boxes: the UI handles non-square pixels but not rotated video (untested).
- Still requested: overview endpoint, activity feed, cross-case jobs/findings, per-event sensor row range (see handoff docs).

## Known UI bugs / not done
- Headless-Chrome screenshots of video frames are timing dependent (one 1366 capture was black until retried); the in-app browser rendered video reliably.
- Timeline below the fold at 768-900 px height; box labels overlap on crowded scenes; no automated browser tests; rotated video, touch scrubbing and Safari/Firefox untested; the demo-case "unreviewed count" check is skipped for cases with several scenarios.
- Screenshots: `docs/frontend/screenshots/` (real clip at 1366x768, 1440x900, 1920x1080; demo case A; dashboard).
