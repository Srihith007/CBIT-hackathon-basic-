import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, Checkbox, ErrorState, LoadingState, Select, Tabs } from '../ui-kit';
import { api } from '../api';
import { useWorkspace } from '../store';
import Player from '../components/Player';
import Timeline from '../components/Timeline';
import SummaryPanel from '../components/SummaryPanel';
import Trajectory from '../components/Trajectory';
import Findings from '../components/Findings';
import Sensor from '../components/Sensor';
import Evidence from '../components/Evidence';

export default function Workspace() {
  const { caseId } = useParams();
  const ws = useWorkspace();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('summary');
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState(null);

  const load = useCallback(async (sid) => {
    try {
      const [c, ev, actors, sc] = await Promise.all([api.case(caseId), api.evidence(caseId), api.actors(caseId), api.scenarios(caseId)]);
      setScenarios(sc.items);
      const chosen = sid || sc.items.find((s) => s.is_baseline)?.id || sc.items[0]?.id;
      if (!chosen) return setData({ c, ev: ev.items, actors: actors.items, none: true });
      const [tl, cons, crbs, gaps, finds, trajs, seek0] = await Promise.all([
        api.timeline(caseId, chosen), api.contradictions(caseId, chosen), api.corroborations(caseId, chosen), api.gaps(caseId, chosen),
        api.findings(caseId, chosen), api.trajectories(caseId, chosen), api.seek(caseId, 0, chosen),
      ]);
      setScenarioId(chosen);
      setData({ c, ev: ev.items, actors: actors.items, tl, cons: cons.items, crbs: crbs.items, gaps: gaps.items, finds: finds.items, trajs: trajs.items, seek0 });
      ws.reset(caseId, chosen);
    } catch (e) { setErr(e.message); }
  }, [caseId]);
  useEffect(() => { load(); }, [load]);

  const events = useMemo(() => (data?.tl ? Object.values(data.tl.lanes).flat().sort((a, b) => a.start_ms - b.start_ms) : []), [data]);
  const shifts = useMemo(() => Object.fromEntries((data?.seek0?.targets || []).map((t) => [t.evidence_id, t.media_ms])), [data]);
  const videos = useMemo(() => (data?.ev || []).filter((e) => (e.kind === 'cctv' || e.kind === 'dashcam') && e.video?.playback_ready), [data]);
  const sensorEv = (data?.ev || []).find((e) => e.kind === 'sensor_csv');
  const trackActors = useMemo(() => {
    const m = {};
    data?.trajs.forEach((t) => {
      const i = data.actors.findIndex((a) => a.id === t.actor_id);
      if (t.actor_id && t.track_ref) m[`${t.track_ref.evidence_id}:${t.track_ref.track_id}`] = { id: t.actor_id, index: i };
    });
    return m;
  }, [data]);
  const actorLabels = useMemo(() => Object.fromEntries((data?.actors || []).map((a) => [a.id, a.label])), [data]);

  // the active event follows the playhead: the latest placed event that has started and whose interval (+ uncertainty) still contains it
  useEffect(() => {
    if (!events.length || ws.activeEventId && ws.seekRequest.id < 0) return;
    const cur = ws.currentMs;
    const hit = [...events].reverse().find((e) => e.start_ms - e.uncertainty_ms <= cur && cur <= (e.end_ms ?? e.start_ms) + Math.max(e.uncertainty_ms, 400));
    if (hit && hit.id !== ws.activeEventId && ws.playing) ws.setActive(hit.id);
  }, [ws.currentMs, events, ws.playing]);

  const pick = (e) => { ws.setActive(e.id); setTab('summary'); if (e.start_ms != null) { ws.setPlaying(false); ws.seek(e.start_ms); } };
  const focusEvent = (id) => { const e = events.find((x) => x.id === id); if (e) pick(e); else ws.setActive(id), setTab('summary'); };
  const step = (dir) => {
    const i = events.findIndex((e) => e.id === ws.activeEventId);
    const n = events[Math.min(Math.max((i < 0 ? (dir > 0 ? -1 : events.length) : i) + dir, 0), events.length - 1)];
    if (n) pick(n);
  };
  useEffect(() => {
    const k = (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === ']') step(1); if (e.key === '[') step(-1); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (err) return <div className="p-8"><ErrorState title="Could not load the case" description={err} /></div>;
  if (!data) return <div className="p-8"><LoadingState label="Loading workspace" /></div>;
  const { c } = data;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/dashboard" className="t-caption text-fg-3">← Investigations</Link>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <Badge variant={c.designation === 'synthetic' ? 'warning' : 'neutral'}>{c.designation === 'synthetic' ? 'SYNTHETIC DATA' : c.designation}</Badge>
        <span className="mono t-caption text-fg-3">{c.code}</span>
        <div className="ml-auto flex items-center gap-3">
          {scenarios.length > 1 && (
            <label className="t-caption flex items-center gap-2 text-fg-3">Scenario
              <Select className="h-9" value={scenarioId || ''} onChange={(e) => load(e.target.value)}
                      options={scenarios.map((s) => ({ value: s.id, label: `${s.name}${s.is_baseline ? ' (baseline)' : ''}` }))} />
            </label>
          )}
          <Button as={Link} to={`/cases/${caseId}/report`} size="sm" variant="outline">Report</Button>
        </div>
      </header>

      {data.none ? (
        <ErrorState title="No reconstruction yet" description="Build one with POST /cases/{id}/reconstruction/scenarios (the seed script does this for the demo cases)." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
          <div className="space-y-4">
            <Card as="section" padded={false} className="p-4" aria-label="Evidence video">
              <Player videos={videos} shifts={shifts} trackActors={trackActors} actorLabels={actorLabels} />
              <div className="mt-2 flex gap-3">
                <Checkbox label="Boxes" checked={ws.overlays.boxes} onChange={() => ws.toggleOverlay('boxes')} />
                <Checkbox label="Labels" checked={ws.overlays.ids} onChange={() => ws.toggleOverlay('ids')} />
                <span className="t-caption ml-auto text-fg-3">Dashed box = first observation recovered after tracking started. Boxes exist only on sampled frames.</span>
              </div>
            </Card>
            <Card as="section" padded={false} className="p-4" aria-label="Timeline">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="t-h2">Timeline</h2>
                <span className="t-caption text-fg-3">Case clock. Red ring = contradicted, green ring = corroborated, hatched = missing data. [ and ] jump between events.</span>
              </div>
              <Timeline tl={data.tl} gaps={data.gaps} currentMs={ws.currentMs} onSelect={pick} activeId={ws.activeEventId} />
            </Card>
            <Card as="section" padded={false} className="p-4" aria-label="Trajectories">
              <h2 className="t-h2 mb-2">Trajectories</h2>
              <Trajectory trajs={data.trajs} currentMs={ws.currentMs} actors={data.actors} selected={ws.selectedActorId} onSelect={ws.selectActor} />
            </Card>
            {sensorEv && (
              <Card as="section" padded={false} className="p-4" aria-label="Sensor">
                <h2 className="t-h2 mb-2">Sensor</h2>
                <Sensor evidence={sensorEv} shift={shifts[sensorEv.id]} label={sensorEv.original_filename} events={(data.tl.lanes.sensor || []).filter((e) => ['hard_braking', 'collision_flag'].includes(e.event_type))} onSelect={pick} />
              </Card>
            )}
          </div>
          <Card as="aside" padded={false} className="h-fit p-4 xl:sticky xl:top-4" aria-label="Details">
            <Tabs value={tab} onChange={setTab} label="Details" items={[{ id: 'summary', label: 'Summary' }, { id: 'findings', label: `Findings (${data.finds.length})` }, { id: 'evidence', label: 'Evidence' }]} />
            <div className="mt-4 max-h-[calc(100vh-9rem)] overflow-auto pr-1">
              {tab === 'summary' && <SummaryPanel eventId={ws.activeEventId} />}
              {tab === 'findings' && <Findings findings={data.finds} contradictions={data.cons} corroborations={data.crbs} gaps={data.gaps} onFocusEvent={focusEvent} onReload={() => load(scenarioId)} />}
              {tab === 'evidence' && <Evidence caseId={caseId} evidence={data.ev} />}
            </div>
          </Card>
        </div>
      )}
      <p className="t-caption mt-6 text-fg-3">TraceLine supports an investigation. It does not determine fault or legal responsibility. Machine detections are candidates; inferences list their alternatives.</p>
    </div>
  );
}
