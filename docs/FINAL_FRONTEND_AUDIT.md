# Final frontend audit

Date: 2026-10-30. Branch `cursor/real-video-pipeline-c915`. The shell, dashboard, and workstation redesign were not replaced. Frontend edits in this pass are the report buttons, the short-viewport timeline, and a cap on the video stage so the timeline stays on screen.

## Browsers

| Browser | Tested | Version | Result |
|---|---|---|---|
| Chrome | Yes, headless, against the running app at `http://127.0.0.1:5173/cases/case_d255f851d423` | Google Chrome 156.0.8078.47 | Workspace loaded. Timeline lane, playhead, and ruler were visible at 1366×768, 1440×900, and 1920×1080. |
| Firefox | No | Not installed (`firefox` and `firefox-esr` are absent) | Not claimed. |
| Safari | No | Not installed. This machine is Linux. | Not claimed. |

Safari and Firefox were not launched. Nothing in this document is a claim that the player works in those browsers.

## Timeline

Checked in Chrome only, on the selected real case (the stored timeline still has 1,093 events).

| Viewport | What was visible |
|---|---|
| 1366×768 | Video, transport, and the timeline card. The CCTV lane, playhead, and ruler were in the viewport. Category chips sit on one scrolling row; the first chip after All can be clipped until that row is scrolled. |
| 1440×900 | Same. The CCTV lane and ruler were visible under the player. |
| 1920×1080 | All five category chips, zoom controls, the CCTV lane, the playhead, and the legend were visible. |

Below 1100px of viewport height the center column keeps the timeline card and scrolls the video card inside itself. The right-hand inspector still scrolls internally. This is not a new visual design.

## Player and boxes

The player still maps boxes with the element `videoWidth` and `videoHeight`. That matches detections when `/stream` is the upright frame. The selected clip's local playback copy was remuxed to 2392×1352 so it matches that file's detections. The copy is not in git. Overlay alignment was not re-measured pixel by pixel in the browser after the remux.

## Report page

Generate report asks for the investigator format. Full export asks for the 16-section dossier. See `docs/REPORT_FORMAT.md`.
