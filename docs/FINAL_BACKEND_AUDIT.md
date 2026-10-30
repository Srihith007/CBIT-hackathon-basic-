# Final backend audit

Audit date: 2026-10-30. Branch `cursor/real-video-pipeline-c915`. No frontend files were edited. No API field was added or renamed. No detection, track, or event was inserted by hand.

The clips are the real-world ACCIDENT preview files under the local accident-demos folder (not in git). `selected_accident.mp4` is the same bytes as `candidate-04.mp4`. `intersection_demo_share.mp4` is in that folder and is not a row in `candidates.csv`. It was uploaded as `dashcam` because a fixed view was not established for it. The other files were uploaded as `cctv` because the candidate table marks them fixed-view.

## Classifications

| Area | Classification |
|---|---|
| Upload and storage | Implemented and verified |
| Preprocessing and timestamps | Implemented and verified |
| Real YOLO detections and confidence | Implemented and verified |
| Track IDs and continuity | Implemented and verified |
| Video events | Implemented and verified |
| Sensor CSV | Implemented but not verified on real footage |
| Witness extraction | Implemented but not verified on real footage |
| Timestamp sync | Implemented and verified |
| Reconstruction and contradiction logic | Implemented and verified for what these files can support. Cross-source contradiction rules were not exercised, because no sensor log or witness statement was uploaded |
| Evidence provenance and report APIs | Implemented and verified |

Nothing in this pass is mocked or hardcoded in the running API. Witness unit tests use a stand-in model; the service itself calls Featherless or refuses the call. Account login is not implemented: `X-Actor` is an optional header.

## What was run

Automated suite, from `backend/`:

```bash
./.venv/bin/python -m pytest -q --tb=line
```

Before the extra report assertions: **162 passed, 17 skipped, 0 failed**, 71.47s. After those assertions were added to the existing real-video test: **162 passed, 17 skipped, 0 failed**, 74.44s. No test failed. The count did not rise, because the new checks are assertions in `tests/test_real_video_pipeline.py`, not a new test function.

Skipped, both runs:

| Count | Reason |
|---:|---|
| 12 | `tests/test_reconstruction.py`: synthetic scenario packages are not in this checkout (`run scripts/build_scenarios.py first`) |
| 4 | `tests/test_report.py`: same missing packages |
| 1 | `tests/test_detection.py`: accident-cue validation image split is not installed. The cue weights are installed and did run |

The real-video test is not skipped. It now also re-hashes the stored original, requires zero contradictions on this single camera, and requires a validated 16-section report with markdown and PDF.

Pipeline log (development database, existing job runner, YOLO26s and the accident cue, storage confidence 0.15, sample rate 5 fps, CPU). Each line is one upload through validate, preprocess, detect, track, source events, and one scenario:

```
DONE primary-demo.mp4        boxes 2344  events 1292  all four jobs completed progress 1.0
DONE candidate-02.mp4        boxes 5136  events 3201  all four jobs completed progress 1.0
DONE candidate-03.mp4        boxes  903  events  256  all four jobs completed progress 1.0
DONE candidate-05.mp4        boxes 2004  events  617  all four jobs completed progress 1.0
DONE candidate-06.mp4        boxes  322  events  136  all four jobs completed progress 1.0
DONE intersection_demo_share.mp4 boxes 1116 events 924 all four jobs completed progress 1.0
TWO_DONE candidate-02 + candidate-03, no sync edge: sync_groups 0, placed 0, unplaced 3457
```

`selected_accident.mp4` was already stored as case `TL-C30DD7` (`case_d255f851d423`, evidence `ev_289b77d5484e`). It was not uploaded again. Its jobs were already `completed` at progress 1.0. A report was generated on that case during this audit: `rpt_e6bcebf81106`, validation passed, PDF 51,719 bytes, markdown 218,552 characters.

`GET /evidence/ev_289b77d5484e/original?verify=true` returned 200 and `X-Content-SHA256: 29567448e55c8810cc434349cf78c9202033622e038d8d9c03b426cd1d067b6b`. The audit chain verified (`verify_chain` true, no broken sequence).

## Measured results

Detector model `yolo26s`, version prefix `sha256:646f8bc3fe0a`, device `cpu`. Cue model `accident_yolov8s`, version prefix `sha256:2c75218e3acc`. Tracker is ByteTrack for `cctv` and BoT-SORT for the dashcam upload. Box counts below are the detections endpoint at `min_conf=0.15`, which includes cue boxes. The detect-job `detector.boxes` count excludes the cue.

| File | Case | Frames indexed / sampled | Detector boxes | Cue boxes | Tracks | Source events | `possible_collision` | Playback |
|---|---|---:|---:|---:|---:|---:|---:|---|
| selected_accident.mp4 | `case_d255f851d423` | 342 / 76 | 1093 | 18 | 21 ByteTrack | 1093 | 49 | transcode 1910×1080, timing deviation 0 ms |
| primary-demo.mp4 | `case_48924aa1d6a3` | 664 / 150 | 2344 | 0 | 22 ByteTrack | 1292 | 4 | remux, same 1280×720 |
| candidate-02.mp4 | `case_2edcfcdbccc8` | 876 / 150 | 5130 | 6 | 78 ByteTrack | 3201 | 0 | remux, same 1280×720 |
| candidate-03.mp4 | `case_17f630febc6e` | 501 / 146 | 842 | 61 | 7 ByteTrack | 256 | 6 | remux, same 1920×910 |
| candidate-05.mp4 | `case_8c7b0e0afddf` | 450 / 151 | 1805 | 199 | 11 ByteTrack | 617 | 0 | remux, same 1620×1080 |
| candidate-06.mp4 | `case_b0146763c6d1` | 696 / 121 | 311 | 11 | 6 ByteTrack | 136 | 0 | remux, same 1920×1080 |
| intersection_demo_share.mp4 | `case_662b8c84c217` | 906 / 76 | 1098 | 18 | 24 BoT-SORT | 924 | 26 | remux, same 1280×720 |

Every file: `synthetic` false, status `valid`, `pts_start_ms` 0, `creation_time_claimed` null, `rotation` null, playback `starts_at_ms` 0, `timing_preserved` true, `max_timing_deviation_ms` 0. Frame 0 is `time_ms` 0. A lone file is its own reference clock, so its events are placed and `start_ms` equals media time. Contradictions on every lone-file scenario: 0. Corroborations on the selected case: 0.

Selected-clip detector classes at storage confidence: car 683, pedestrian 330, truck 57, bus 22, traffic light 1. Display confidence 0.25 keeps 891 boxes including the 18 cues (car 511, pedestrian 286, bus 22, truck 54). Track result: 16 stable, 3 fragmented, 2 short, 832 detections tracked, 260 untracked, 17 backfilled, 3 continuation candidates. The builder's fragmentation gap says 8 continuation candidates were not merged. Those two counts are different fields (track-job candidates versus the gap's listed pairs). Neither count was edited.

Selected-clip source-event types: `potential_interaction` 943, `possible_near_miss` 63, `possible_collision` 49, `vehicle_enters_scene` 11, `vehicle_slowing` 9, `vehicle_leaves_scene` 6, `vehicle_stopped` 5, `vehicle_direction_change` 4, `vehicle_maneuver_observed` 3.

`candidate-02.mp4` has 3,008 `potential_interaction` events and no `possible_collision`. Overlap without an abrupt speed drop stays an interaction. `candidate-05.mp4` stored 199 cue boxes and no `possible_collision`. The cue does not decide an event.

`candidate-03.mp4` validation reported 37 timestamp gaps, largest 0.5916 s. Reconstruction wrote two `video_missing_interval` gaps (639 ms and 592 ms, normal step 213 ms) and `low_visual_quality` (mean brightness 54.6, threshold 60). Median sharpness was 344.9, above the sharpness threshold. That is the file's measured timing and brightness, not a filled-in interval.

Two real files in one case with no declared edge (`case_1bd817f794e2`, `candidate-02.mp4` as `ev_2894e2e74fb4` and `candidate-03.mp4` as `ev_935b14de9865`): `sync_groups` 0, `unsynchronized_sources` both ids, timeline `span_ms` `[null, null]`, placed 0, unplaced 3457 (3201 + 256). Seek at case time 0 returned `targets: []` and both ids in `unsynchronized`.

## Sample API responses

These are from the selected case. Times are media milliseconds except `start_ms`, which is case time and equals media time because the offset is 0.

Frame index, first rows of `GET /evidence/ev_289b77d5484e/frames?sampled=false&limit=5`:

```json
{"id": 1, "frame_no": 0, "time_ms": 0, "sampled": true}
{"id": 2, "frame_no": 1, "time_ms": 17, "sampled": false}
{"id": 3, "frame_no": 2, "time_ms": 83, "sampled": false}
```

Highest-confidence detector boxes stored on frame 0 (the detections endpoint returns these as `class`, `confidence`, and `bbox` `[x1, y1, x2, y2]` in decoded pixels):

```json
{"class": "car", "confidence": 0.8207, "bbox": [682.1, 389.8, 816.8, 532.7]}
{"class": "car", "confidence": 0.8113, "bbox": [848.0, 247.8, 1000.0, 356.1]}
{"class": "car", "confidence": 0.7592, "bbox": [2297.2, 449.2, 2374.6, 540.6]}
```

One placed `possible_collision` from `GET /cases/case_d255f851d423/timeline`:

```json
{
  "title": "Possible collision between tracked vehicles",
  "category": "machine_detection",
  "start_ms": 1583,
  "end_ms": 1583,
  "synchronized": true,
  "observations": {
    "note": "image-space proximity or box overlap is not physical contact or distance",
    "coordinate_frame": "image_pixels",
    "source_time_ms": [1583.0, 1583.0],
    "accident_cue_nearby": false
  }
}
```

Seek at case time 0:

```json
{
  "case_ms": 0.0,
  "targets": [{"evidence_id": "ev_289b77d5484e", "media_ms": 0.0, "bound_ms": 0.0, "group": "sg_630d70ee6d"}],
  "unsynchronized": []
}
```

Report create returned 201. `validation.passed` is true for all ten checks (sixteen sections, no fault language, synthetic label, timeline sources and uncertainty, unplaced times, inferences, contradictions, corroborations, gaps, limits text). `has_pdf` is true.

A `possible_collision` on `intersection_demo_share.mp4` has `relative_to_moving_camera: true` because that upload was declared `dashcam`. That flag is the declaration, not a measurement that the camera moved.

## Known limitations

- No sensor CSV and no witness statement were uploaded with these videos. Sensor parsing and witness extraction are covered by fixture tests. Featherless is not configured in this environment, so a live extraction would return 503 and would not invent claims. Cross-source corroboration and contradiction rules (`COR-BRAKE-01`, `COR-COLL-01`, `CON-ACTION-01`, `CON-QTY-01`, `CON-COLL-CLAIM-01`) did not run. The twelve reconstruction tests and four report tests that use the synthetic scenario packages were skipped.
- There is no camera calibration. Trajectories are `frame: "image"` only. Speeds in video events are box-diagonals per second, not metres per second.
- No track is a confirmed vehicle. Every lone-file scenario wrote `unconfirmed_vehicle_identity` and `no_camera_calibration` (the dashcam upload has no calibration gap, because metric projection is not offered for a moving camera).
- `possible_collision` is one sampled overlap plus an abrupt drop in box speed. Several of them on the selected clip have `start_ms` equal to `end_ms`. That is one sample, not a measured impact duration.
- The accident cue is a separate model. On `candidate-05.mp4` it stored 199 boxes and the event rules stored no `possible_collision`.
- Packet timestamps are out of order on these H.264 files. Validation warns that B-frame reordering is normal. The warning text mentions large disorder, but the check fires on any inversion and does not measure how large it is. Preprocess still indexed every frame and reported timing deviation 0 against the playback copy.
- Upload validation only decodes the first 5 seconds. The full frame index is the later check, and it completed for every file.
- Login is not implemented.
- `intersection_demo_share.mp4` has no candidate-table row. Treating it as a dashcam suppressed fixed-camera maneuver events. Do not describe that file as a measured moving camera.

## Bugs to fix before the demo

These were not changed in this audit. A fix for item 2 that dropped events or retuned thresholds would change the contract of what the pipeline stores. That was not done.

1. **Overlay scale on the demo clip.** `selected_accident.mp4` detections are in a 2392×1352 frame. `/stream` is a transcoded 1910×1080 file (`height` capped at 1080). The other six files were remuxed, so their stream size matches the boxes. The player maps boxes with the element `videoWidth`. On this clip the rectangles will be about 25% too large. Scale from `evidence.video.width` / `height` into the element. This is frontend work. The API already returns both sizes.

2. **Do not open the demo on the raw event list or the raw report timeline.** The selected case places 1,093 machine events, 943 of them `potential_interaction`, and the report timeline has 1,093 entries. The first placed row is "Possible interaction between tracked road users" at 0 ms. `candidate-02.mp4` places 3,201 events and zero `possible_collision`. Those counts are what `video_events.py` emitted. They are not 943 or 49 impacts. The stored note says image overlap is not physical contact. The default screen has to keep that distinction, or the demo will show a pile of proximity ticks as the incident. Filtering the default list by `event_type` does not require an API change.

3. **Do not demo a second camera, a sensor, or a witness on these files as if they shared a clock or contradicted each other.** Two real files with no edge stay unplaced (3,457 events, seek targets empty). There is no sensor row and no claim row. Showing an empty contradiction list is accurate. Showing a combined timeline would be false.
