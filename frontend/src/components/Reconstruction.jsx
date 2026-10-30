import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Field, SectionHeader, Select } from '../ui-kit';
import { api } from '../api';
import { formatTime } from '../lib/time';


export const CLASS_LABEL = {
  direct_observation: 'Direct observation',
  witness_reported: 'Witness reported',
  sensor_observed: 'Sensor observed',
  derived_observation: 'Derived from detections',
  system_inference: 'System inference',
  hypothesis: 'Hypothesis',
  unknown: 'Source not recorded',
};
const CATEGORY_LABEL = { direct_observation: 'Direct observation', machine_detection: 'Derived from detections', witness_claim: 'Witness claim', inference: 'System inference' };

/** The evidence class the backend states; before it ships one, the stored category, which is always present. */
export const evidenceLabel = (e) => CLASS_LABEL[e.evidence_class] || CATEGORY_LABEL[e.category] || 'Not established';

export const sourceName = (ev) => ev?.source?.display_name || ev?.original_filename || 'Unknown source';

/** One chip per camera. Filtering changes what is listed; it never changes the clock or the video. */
export function CameraFilter({ videos, value, onChange }) {
  if (videos.length < 2) return null;
  const chips = [{ id: 'all', label: 'All cameras' }, ...videos.map((v) => ({ id: v.id, label: sourceName(v) }))];
  return (
    <div role="group" aria-label="Camera filter" className="mb-3 flex flex-wrap items-center gap-2">
      <span className="t-caption text-fg-3">Camera</span>
      {chips.map((c) => (
        <button key={c.id} type="button" aria-pressed={value === c.id} onClick={() => onChange(c.id)}
                className="t-caption max-w-[14rem] truncate rounded-full border border-line px-3 py-1 text-fg-2 transition hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-fg">{c.label}</button>
      ))}
    </div>
  );
}

export function KeyObservations({ events, activeId, onSelect, nameOf }) {
  return (
    <section aria-label="Key observations" className="mb-3">
      <h2 className="t-eyebrow mb-1 text-fg-3">Key observations</h2>
      {events.length === 0 ? <p className="t-caption text-fg-3">No key observation is established for this selection.</p> : (
        <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {events.slice(0, 40).map((e) => (
            <li key={e.id}>
              <button type="button" aria-pressed={activeId === e.id} onClick={() => onSelect(e)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10">
                <span className="mono t-caption w-14 shrink-0 text-fg-3">{e.start_ms != null ? formatTime(e.start_ms) : 'unplaced'}</span>
                <span className="t-caption min-w-0 flex-1 text-fg-2">{e.title}</span>
                <span className="t-caption hidden shrink-0 text-fg-3 sm:inline">{evidenceLabel(e)}{nameOf && e.source_id ? ` · ${nameOf(e.source_id)}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const GAP_LABEL = {
  video_missing_interval: 'Missing interval in the recording',
  no_camera_calibration: 'No camera calibration',
  clock_inconsistency: 'Clock relations disagree',
};
const gapLabel = (t) => GAP_LABEL[t] || String(t).split('_').join(' ');

/** Gaps are missing evidence, never contradictions. Contradictions and corroborations are listed from the stored scenario only. */
export function ContradictionsAndGaps({ cons, crbs, gaps, nameOf }) {
  const none = !cons.length && !crbs.length && !gaps.length;
  return (
    <section aria-label="Contradictions and gaps" className="mt-4">
      <SectionHeader title="Contradictions and gaps" description="A contradiction means two sources describe the same thing differently, not which is wrong. A gap is missing evidence, not a contradiction." className="!mb-2" />
      {none ? <p className="t-small text-fg-3">No contradiction, corroboration or gap is stored for this scenario.</p> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div aria-label="Contradictions">
            <h3 className="t-eyebrow mb-1.5 text-fg-3">Contradictions ({cons.length})</h3>
            {cons.length === 0 ? <p className="t-small text-fg-3">None stored.</p> : (
              <ul className="space-y-2">{cons.map((r) => <li key={r.id} className="rounded-lg border border-line px-3 py-2"><span className="mono t-caption text-fg-3">{r.rule_id}</span> · events {r.event_a}, {r.event_b}<p className="t-small text-fg-2">{r.explanation}</p></li>)}</ul>
            )}
          </div>
          <div aria-label="Corroborations">
            <h3 className="t-eyebrow mb-1.5 text-fg-3">Corroborations ({crbs.length})</h3>
            {crbs.length === 0 ? <p className="t-small text-fg-3">None stored. Two files with identical bytes are not independent sources.</p> : (
              <ul className="space-y-2">{crbs.map((r) => <li key={r.id} className="rounded-lg border border-line px-3 py-2"><span className="mono t-caption text-fg-3">{r.rule_id}</span> · events {r.events.join(', ')}<p className="t-small text-fg-2">{r.explanation}</p></li>)}</ul>
            )}
          </div>
          <div aria-label="Recording gaps">
            <h3 className="t-eyebrow mb-1.5 text-fg-3">Gaps ({gaps.length})</h3>
            {gaps.length === 0 ? <p className="t-small text-fg-3">None stored.</p> : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {gaps.map((g) => (
                  <li key={g.id} className="rounded-lg border border-line px-3 py-2">
                    <p className="t-small font-medium text-fg">{gapLabel(g.gap_type)}</p>
                    <p className="t-caption text-fg-3">{g.scope?.evidence_id ? nameOf(g.scope.evidence_id) : 'Case-wide'}{g.scope?.from_ms != null ? ` · media ${formatTime(g.scope.from_ms)} to ${formatTime(g.scope.to_ms)}` : ''}</p>
                    {g.recommendation && <p className="t-caption text-fg-2">{g.recommendation}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Cross-camera associations are only what the backend recorded. Equal track numbers on two cameras are never shown as one vehicle. */
export function Associations({ state, nameOf, onAdd, videos = [], disabled }) {
  return (
    <div aria-label="Cross-camera associations" className="space-y-3">
      {state === undefined ? <p className="t-small text-fg-3">Loading associations…</p>
        : state === null ? <Alert variant="warning" title="Associations could not be loaded">The association list did not load. Nothing is assumed about vehicles seen on more than one camera.</Alert>
          : state.items.length === 0 ? <p className="t-small text-fg-3">No cross-camera association is recorded. Not established: whether any vehicle appears on more than one camera.</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {state.items.map((a) => (
                <li key={a.id} className="rounded-lg border border-line p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="warning">Uncertain</Badge><span className="mono t-caption text-fg-3">{a.id}</span></div>
                  <p className="t-small text-fg">{a.tracks.map((t) => `${nameOf(t.evidence_id)} track ${t.track_id}`).join('  ↔  ')}</p>
                  {a.basis && <p className="t-caption mt-1 text-fg-2">Basis: {a.basis}</p>}
                  <p className="t-caption mt-1 text-fg-3">{(a.supporting || []).length} supporting · {(a.contradicting || []).length} contradicting · likelihood Not established</p>
                  <p className="t-caption text-fg-3">Track numbers belong to one video only. This is not a confirmed identity.</p>
                </li>
              ))}
            </ul>
          )}
      {onAdd && <AssociationForm videos={videos} nameOf={nameOf} onAdd={onAdd} disabled={disabled} />}
    </div>
  );
}

/** Proposes an uncertain link between a track on one camera and a track on another. The backend always stores it as uncertain; it confirms no identity and creates no corroboration. */
export function AssociationForm({ videos, nameOf, onAdd, disabled }) {
  const [side, setSide] = useState([{ ev: '', track: '' }, { ev: '', track: '' }]);
  const [tracks, setTracks] = useState({});
  const [basis, setBasis] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const ids = side.map((x) => x.ev).filter(Boolean);
  useEffect(() => {
    let off = false;
    ids.forEach((id) => {
      if (tracks[id]) return;
      api.tracks(id).then((r) => { if (!off) setTracks((t) => ({ ...t, [id]: { items: r.items || [] } })); }).catch((e) => { if (!off) setTracks((t) => ({ ...t, [id]: { error: e.message } })); });
    });
    return () => { off = true; };
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (videos.length < 2) return <p className="t-caption text-fg-3">Proposing an association needs tracks from two different videos. This case has {videos.length}.</p>;
  const set = (i, patch) => { setDone(false); setSide((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
  const same = side[0].ev && side[0].ev === side[1].ev;
  const ready = side.every((x) => x.ev && x.track !== '') && !same && basis.trim().length > 0;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await onAdd({ tracks: side.map((x) => ({ evidence_id: x.ev, track_id: Number(x.track) })), basis: basis.trim() });
      setDone(true); setBasis(''); setSide([{ ev: '', track: '' }, { ev: '', track: '' }]);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} aria-label="Propose association" className="space-y-2 rounded-lg border border-dashed border-line p-3">
      <h4 className="t-small font-medium text-fg">Propose an association</h4>
      <p className="t-caption text-fg-3">Say that you think a track on one camera may be a track on another. It is stored as uncertain, with you as the only support. It does not confirm a vehicle identity and does not count as corroboration.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {side.map((x, i) => (
          <div key={i} className="space-y-2">
            <Field label={`Camera ${i + 1}`}>
              <Select value={x.ev} onChange={(e) => set(i, { ev: e.target.value, track: '' })}>
                <option value="">Choose a camera</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{nameOf(v.id)}</option>)}
              </Select>
            </Field>
            <Field label={`Track on camera ${i + 1}`} hint="Track numbers are valid inside one video only." error={tracks[x.ev]?.error}>
              <Select value={x.track} disabled={!x.ev || !tracks[x.ev]?.items} onChange={(e) => set(i, { track: e.target.value })}>
                <option value="">{x.ev && !tracks[x.ev] ? 'Loading tracks…' : 'Choose a track'}</option>
                {(tracks[x.ev]?.items || []).map((t) => <option key={t.track_id} value={t.track_id}>{`Track ${t.track_id}${t.class ? ` (${t.class})` : ''}`}</option>)}
              </Select>
            </Field>
          </div>
        ))}
      </div>
      {same && <p className="t-caption text-danger" role="alert">Choose two different cameras.</p>}
      <Field label="Why do you think so?" hint="Required. Stored as the basis.">
        <textarea className="t-small w-full rounded-md border border-line bg-surface p-2 text-fg" rows={2} maxLength={500} value={basis} onChange={(e) => setBasis(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3"><Button type="submit" variant="outline" loading={busy} disabled={!ready || disabled}>Record as uncertain</Button>{done && <span className="t-caption text-fg-2" role="status">Recorded as uncertain.</span>}</div>
      {err && <p className="t-caption text-danger" role="alert">{err}</p>}
    </form>
  );
}

const REASON = {
  no_placed_evidence: 'No evidence is placed on the case clock.',
  no_tracked_vehicles: 'A video is present but no vehicle was tracked in it.',
  sources_unsynchronized: 'Some sources have no recorded clock relation to the others.',
  clock_inconsistency: 'Recorded clock relations disagree by more than their bounds.',
  missing_intervals: 'A recording has a missing interval.',
  recording_starts_after_event: 'A recording starts after the event instant.',
  recording_ends_before_event: 'A recording ends before the event instant.',
};

export function Completeness({ state }) {
  if (state === undefined) return null;
  if (state === null) return <p className="t-small text-fg-3">Evidence completeness could not be loaded.</p>;
  return (
    <div aria-label="Evidence completeness" className="space-y-2">
      <p className="flex items-center gap-2 t-small text-fg">Evidence completeness {state.defensible ? <Badge variant="success">At least one traceable observation</Badge> : <Badge variant="warning">Insufficient evidence</Badge>}</p>
      {state.reasons?.length > 0 && <ul className="t-caption list-disc space-y-0.5 pl-5 text-fg-2">{state.reasons.map((r) => <li key={r}>{REASON[r] || r}</li>)}</ul>}
      {state.unsupported_hypotheses?.length > 0 && <p className="t-caption text-fg-3">{state.unsupported_hypotheses.length} inference(s) are not listed as hypotheses because a premise has no evidence id.</p>}
    </div>
  );
}

/** Reconstruction scenarios. Every inference is a labelled hypothesis: it names its premises and alternatives and carries no probability. */
export function Scenarios({ scenarios, scenarioId, onSelect, hypotheses = [], completeness, onPickEvent }) {
  return (
    <section aria-label="Reconstruction scenarios" className="mt-4">
      <SectionHeader title="Reconstruction scenarios" description="A scenario is one set of stated assumptions. Everything below that is inferred is a hypothesis, not a finding." className="!mb-2" />
      <ul className="mb-3 flex flex-wrap gap-2" aria-label="Scenarios">
        {scenarios.map((s) => (
          <li key={s.id}>
            <button type="button" aria-pressed={s.id === scenarioId} onClick={() => onSelect(s.id)} className="t-caption rounded-full border border-line px-3 py-1 text-fg-2 transition hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-fg">
              {s.name}{s.is_baseline ? ' (baseline)' : ''}
            </button>
          </li>
        ))}
      </ul>
      <Completeness state={completeness} />
      <h3 className="t-eyebrow mb-1.5 mt-3 text-fg-3">Hypotheses</h3>
      {hypotheses.length === 0 ? <p className="t-small text-fg-3">No hypothesis is stored for this scenario. Insufficient evidence to propose one.</p> : (
        <ul className="space-y-2">
          {hypotheses.map((h) => (
            <li key={h.id} className="rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 p-3">
              <p className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="warning">Hypothesis</Badge><span className="t-caption text-fg-3">not a finding · likelihood Not established</span></p>
              <p className="t-small text-fg">{h.statement}</p>
              {h.alternatives?.length > 0 && <div className="mt-1"><p className="t-caption text-fg-3">Alternatives that are not ruled out</p><ul className="t-caption list-disc pl-5 text-fg-2">{h.alternatives.map((a) => <li key={a}>{a}</li>)}</ul></div>}
              <p className="t-caption mt-1 text-fg-3">Premises: {h.premises.length ? h.premises.map((p, i) => <button key={p} type="button" className="mr-2 underline decoration-dotted" onClick={() => onPickEvent(p)}>{i + 1}. {p}</button>) : 'none'}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The narrative's hypothesis_explanation: stored rule alternatives that already have a complete evidence trace. The note is the backend's fixed text. */
export function HypothesisExplanation({ data, nameOf }) {
  const x = data?.hypothesis_explanation;
  if (!x) return null;
  return (
    <section aria-label="Hypothesis explanation" className="mb-3">
      <h2 className="t-eyebrow mb-1 text-fg-3">Hypothesis explanation</h2>
      {x.items.length === 0 ? <p className="t-caption text-fg-3">No hypothesis with a complete evidence trace is stored. Nothing is explained beyond the observations above.</p> : (
        <ul className="space-y-1.5">
          {x.items.map((h) => (
            <li key={h.id} className="rounded-md border border-dashed border-amber-500/60 bg-amber-500/5 px-2 py-1.5">
              <p className="t-caption flex flex-wrap items-center gap-2"><Badge variant="warning">Hypothesis</Badge><span className="text-fg">{h.statement}</span></p>
              {h.alternatives?.length > 0 && <p className="t-caption mt-0.5 text-fg-3">Alternatives: {h.alternatives.join(' · ')}</p>}
              <p className="t-caption text-fg-3">Evidence: {(h.evidence_ids || []).map(nameOf).join(', ') || 'none'} · likelihood Not established</p>
            </li>
          ))}
        </ul>
      )}
      {x.note && <p className="t-caption mt-1 text-fg-3">{x.note}</p>}
    </section>
  );
}

/** Recording overlap: two placed sources whose case-time spans intersect. Overlap is neither contact nor corroboration. */
export function Overlaps({ overlaps = [], nameOf, onSeek }) {
  return (
    <section aria-label="Recording overlap" className="mt-4">
      <SectionHeader title="Recording overlap" description="Where two placed cameras cover the same case time. Overlap is not contact and is not corroboration." className="!mb-2" />
      {overlaps.length === 0 ? <p className="t-small text-fg-3">No two placed sources overlap in time. Sources that are not on one clock are not compared.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">
          {overlaps.map((o) => (
            <li key={`${o.evidence_ids.join('+')}:${o.start_ms}`} className="rounded-lg border border-line px-3 py-2">
              <p className="t-small text-fg">{o.evidence_ids.map(nameOf).join('  and  ')}</p>
              <p className="t-caption text-fg-3">Case time {formatTime(o.start_ms)} to {formatTime(o.end_ms)} · {o.event_ids?.length || 0} events in the overlap</p>
              <button type="button" className="t-caption mt-1 underline decoration-dotted" onClick={() => onSeek(o.start_ms)}>Go to start of overlap</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const WINDOW_MS = 1500;
const pickSpread = (items, n = 3) => (items.length <= n ? items : Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]));

/** Real extracted frames before, during and after one event, in the source's own media time. Empty windows say so. */
export function PhaseInspector({ event }) {
  const [phases, setPhases] = useState(null);
  const range = event?.observations?.source_time_ms;
  const evidenceId = event?.source_id;
  const eventId = event?.id;
  useEffect(() => {
    setPhases(null);
    if (!evidenceId || !Array.isArray(range)) return undefined;
    let off = false;
    const [s, e] = [range[0], range[1] ?? range[0]];
    const win = { before: [Math.max(0, s - WINDOW_MS), s - 1], during: [s, e], after: [e + 1, e + WINDOW_MS] };
    Promise.all(Object.entries(win).map(async ([k, [a, b]]) => {
      if (b < a) return [k, []];
      const r = await api.frames(evidenceId, a, b).catch(() => ({ items: [] }));
      return [k, pickSpread((r.items || []).filter((f) => f.thumbnail_url || f.full_url))];
    })).then((pairs) => { if (!off) setPhases(Object.fromEntries(pairs)); });
    return () => { off = true; };
  }, [eventId, evidenceId, range?.[0], range?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!event) return <p className="t-small text-fg-3">Select an event on the timeline to see the frames around it.</p>;
  if (!evidenceId || !Array.isArray(range)) return <p className="t-small text-fg-3">Unavailable: this event has no video source time, so no frame window can be shown.</p>;
  return (
    <div aria-label="Before, during and after" className="space-y-3">
      <p className="t-caption text-fg-3">Frames extracted from the stored video within {WINDOW_MS / 1000} s of the event, in the video's own time. Nothing is generated.</p>
      {['before', 'during', 'after'].map((k) => (
        <section key={k} aria-label={k}>
          <h4 className="t-eyebrow mb-1 capitalize text-fg-3">{k}</h4>
          {!phases ? <p className="t-caption text-fg-3">Loading…</p> : phases[k].length === 0 ? <p className="t-caption text-fg-3">No extracted frame in this window.</p> : (
            <ul className="flex gap-2 overflow-x-auto">
              {phases[k].map((f) => <li key={f.id}><img src={f.thumbnail_url || f.full_url} alt={`${k} frame ${f.frame_no} at ${f.time_ms} ms`} loading="lazy" className="h-20 w-auto rounded border border-line" /><span className="mono t-caption block text-fg-3">{formatTime(f.time_ms)}</span></li>)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/** Clocks the backend states for one event. A null clock is Not established; nothing is computed here. */
export function EventClocks({ event }) {
  if (!event) return null;
  const c = event.clocks || {};
  const fmt = (v) => (Array.isArray(v) ? v.join(' to ') : 'Not established');
  return (
    <dl className="t-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" aria-label="Event clocks">
      <dt className="text-fg-3">Media time (ms)</dt><dd className="mono text-fg-2">{fmt(c.media_ms)}</dd>
      <dt className="text-fg-3">Container PTS (ms)</dt><dd className="mono text-fg-2">{fmt(c.container_pts_ms)}</dd>
      <dt className="text-fg-3">Wall clock</dt><dd className="mono text-fg-2">{fmt(c.wall_clock)}</dd>
      <dt className="text-fg-3">Case time (ms)</dt><dd className="mono text-fg-2">{fmt(c.case_ms)}</dd>
      <dt className="text-fg-3">Synchronized (ms)</dt><dd className="mono text-fg-2">{fmt(c.synchronized_ms)}</dd>
    </dl>
  );
}

/** Where the event came from. `complete` is the backend's own flag. */
export function EventTrace({ event, nameOf }) {
  const t = event?.trace;
  if (!t) return null;
  return (
    <p className="t-caption text-fg-3" aria-label="Evidence trace">
      {t.complete ? 'Evidence trace complete' : 'Evidence trace incomplete'}: {t.evidence_ids?.length ? t.evidence_ids.map(nameOf).join(', ') : 'no source recorded'}{t.source_event_id ? ` · source event ${t.source_event_id}` : ''}
    </p>
  );
}

export function SensorPanelNote({ hasSensor }) {
  return hasSensor ? null : <Alert variant="info" title="Sensor data: Unavailable">No sensor file is in this case, so no speed, braking or collision-flag evidence is shown.</Alert>;
}
