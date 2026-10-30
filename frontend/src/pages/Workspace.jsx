import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, Checkbox, ErrorState, LoadingState, SectionHeader, Select, Tabs } from '../ui-kit';
import { FileText, Film, Gauge, Users } from 'lucide-react';
import Shell from '../layout';
import { api } from '../api';
import { useWorkspace } from '../store';
import { byStart, findActiveEvent, resolveActive } from '../lib/active';
import { ACTOR_COLORS, CATEGORY_STYLE } from '../fmt';
import { formatTime } from '../lib/time';
import DesignationBadge from '../components/DesignationBadge';
import Player from '../components/Player';
import Timeline from '../components/Timeline';
import SummaryPanel from '../components/SummaryPanel';
import Trajectory from '../components/Trajectory';
import Findings from '../components/Findings';
import Sensor from '../components/Sensor';
import Evidence from '../components/Evidence';
import { FrameDrawer, SensorDrawer, StatementDrawer } from '../components/EvidenceDrawers';

export default function Workspace() {
  const { caseId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('summary');
  const [scenarios, setScenarios] = useState([]);
  const [scenarioId, setScenarioId] = useState(null);
  const [trail, setTrail] = useState(null);
  const overlays = useWorkspace((s) => s.overlays);
  const selectedActor = useWorkspace((s) => s.selectedActorId);
  const activeId = useWorkspace((s) => s.activeEventId);
  const primaryId = useWorkspace((s) => s.primaryVideoId);

  const load = useCallback(async (sid) => {
    try {
      setErr(null);
      const [c, ev, actors, sc] = await Promise.all([api.case(caseId), api.evidence(caseId), api.actors(caseId), api.scenarios(caseId)]);
      setScenarios(sc.items);
      const chosen = sid || sc.items.find((s) => s.is_baseline)?.id || sc.items[0]?.id;
      if (!chosen) return setData({ c, ev: ev.items, actors: actors.items, none: true });
      const [tl, cons, crbs, gaps, finds, trajs, seek0] = await Promise.all([
        api.timeline(caseId, chosen), api.contradictions(caseId, chosen), api.corroborations(caseId, chosen), api.gaps(caseId, chosen),
        api.findings(caseId, chosen), api.trajectories(caseId, chosen), api.seek(caseId, 0, chosen),
      ]);
      setScenarioId(chosen);
      useWorkspace.getState().reset(caseId, chosen);
      setData({ c, ev: ev.items, actors: actors.items, tl, cons: cons.items, crbs: crbs.items, gaps: gaps.items, finds: finds.items, trajs: trajs.items, seek0 });
    } catch (e) { setErr(e); }
  }, [caseId]);
  useEffect(() => { load(); }, [load]);

  const events = useMemo(() => (data?.tl ? Object.values(data.tl.lanes).flat().sort(byStart) : []), [data]);
  const shifts = useMemo(() => Object.fromEntries((data?.seek0?.targets || []).map((t) => [t.evidence_id, t.media_ms])), [data]);
  const videos = useMemo(() => (data?.ev || []).filter((e) => (e.kind === 'cctv' || e.kind === 'dashcam') && e.video?.playback_ready), [data]);
  const sensorEv = (data?.ev || []).find((e) => e.kind === 'sensor_csv');
  const range = useMemo(() => (data?.tl?.span_ms?.[0] != null ? [Math.max(0, data.tl.span_ms[0] - 500), data.tl.span_ms[1] + 500] : [0, 1000]), [data]);
  const trackActors = useMemo(() => {
    const m = {};
    data?.trajs.forEach((t) => { if (t.actor_id && t.track_ref) m[`${t.track_ref.evidence_id}:${t.track_ref.track_id}`] = { id: t.actor_id, index: data.actors.findIndex((a) => a.id === t.actor_id) }; });
    return m;
  }, [data]);
  const actorLabels = useMemo(() => Object.fromEntries((data?.actors || []).map((a) => [a.id, a.label])), [data]);

  // the active event follows the clock in every state (playing, paused, scrubbing); an explicit selection holds until the playhead moves away
  useEffect(() => {
    if (!events.length) return undefined;
    const apply = (s) => {
      const id = resolveActive({ computed: findActiveEvent(events, s.currentMs), pinnedId: s.pinnedId, pinnedAt: s.pinnedAt, currentMs: s.currentMs });
      if (id !== s.activeEventId && (id || s.activeEventId)) {
        if (!id && s.pinnedId == null && s.activeEventId == null) return;
        s.setActive(id);
      }
    };
    return useWorkspace.subscribe((s, p) => { if (s.currentMs !== p.currentMs) apply(s); });
  }, [events]);

  const pick = useCallback((e) => {
    const st = useWorkspace.getState();
    st.setPlaying(false);
    if (e.start_ms != null) { st.requestSeek(e.start_ms); st.selectEvent(e.id, e.start_ms); } else st.selectEvent(e.id, null);
    if (e.actor_id) st.selectActor(e.actor_id);
    setTab('summary');
  }, []);
  const pickById = useCallback((id) => { const e = events.find((x) => x.id === id) || data?.tl.unplaced.find((x) => x.id === id); if (e) pick(e); else useWorkspace.getState().selectEvent(id, null); }, [events, data, pick]);
  const stepEvent = useCallback((dir) => {
    const i = events.findIndex((e) => e.id === useWorkspace.getState().activeEventId);
    const n = events[Math.min(Math.max((i < 0 ? (dir > 0 ? -1 : events.length) : i) + dir, 0), events.length - 1)];
    if (n) pick(n);
  }, [events, pick]);
  useEffect(() => {
    const k = (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === ']') stepEvent(1); if (e.key === '[') stepEvent(-1); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [stepEvent]);
  const seekTo = useCallback((ms) => { const st = useWorkspace.getState(); st.setPlaying(false); st.requestSeek(ms); }, []);

  const crumbs = [{ label: data?.c?.title || 'Workspace' }];
  if (err) return <Shell crumbs={crumbs}><ErrorState title={err.code === 'CASE_NOT_FOUND' ? 'This case does not exist' : 'Could not load the case'} description={err.message} onRetry={() => load()} /></Shell>;
  if (!data) return <Shell crumbs={crumbs} wide><LoadingState rows={6} label="Loading workspace" /></Shell>;
  const { c } = data;
  const trailEvidence = trail && data.ev.find((e) => e.id === trail.ev.source_id);

  return (
    <Shell crumbs={crumbs} wide actions={<Button as={Link} to={`/cases/${caseId}/report`} size="sm" variant="outline" icon={FileText}>Report</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <DesignationBadge designation={c.designation} />
        <span className="mono t-caption text-fg-3">{c.code}</span>
        {scenarios.length > 1 && (
          <label className="t-caption ml-auto flex items-center gap-2 text-fg-3">Scenario
            <Select className="h-9" value={scenarioId || ''} onChange={(e) => load(e.target.value)} options={scenarios.map((s) => ({ value: s.id, label: `${s.name}${s.is_baseline ? ' (baseline)' : ''}` }))} />
          </label>
        )}
      </div>
      {c.designation === 'synthetic' && <Alert variant="warning" className="mb-4" title="Synthetic demonstration data">Every source in this case was generated. Findings describe the system's logic on a synthetic world, not a real incident.</Alert>}

      {data.none ? (
        <ErrorState title="No reconstruction yet" description="The pipeline has not produced a reconstruction for this case. Open the dashboard to check processing jobs." />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_390px] [@media(max-height:1100px)]:h-[calc(100dvh-9.5rem)] [@media(max-height:1100px)]:min-h-0 [@media(max-height:1100px)]:overflow-hidden">
            {/* centre: video + timeline. On a short window the timeline keeps a share of the column and the video card scrolls inside itself. */}
            <div className="order-1 min-w-0 space-y-4 xl:order-2 [@media(max-height:1100px)]:flex [@media(max-height:1100px)]:h-full [@media(max-height:1100px)]:min-h-0 [@media(max-height:1100px)]:flex-col [@media(max-height:1100px)]:gap-3 [@media(max-height:1100px)]:space-y-0 [@media(max-height:1100px)]:overflow-hidden">
              <Card as="section" padded={false} className="p-3 sm:p-4 [@media(max-height:1100px)]:min-h-0 [@media(max-height:1100px)]:flex-1 [@media(max-height:1100px)]:overflow-y-auto" aria-label="Evidence video">
                <Player videos={videos} shifts={shifts} trackActors={trackActors} actorLabels={actorLabels} range={range} events={events} onSelectEvent={pick} />
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
                  <Checkbox label="Boxes" checked={overlays.boxes} onChange={() => useWorkspace.getState().toggleOverlay('boxes')} />
                  <Checkbox label="Track labels" checked={overlays.ids} onChange={() => useWorkspace.getState().toggleOverlay('ids')} />
                  <span className="t-caption ml-auto text-fg-3">Boxes are the stored detections on sampled frames. Dashed = recovered first observation. Nothing is drawn between samples.</span>
                </div>
              </Card>
              <Card as="section" padded={false} className="p-3 sm:p-4 [@media(max-height:1100px)]:max-h-[48%] [@media(max-height:1100px)]:shrink-0 [@media(max-height:1100px)]:overflow-y-auto" aria-label="Timeline">
                <SectionHeader title="Timeline" description={`${events.length} placed events · ${data.tl.unplaced.length} unplaced`} className="!mb-3" />
                <Timeline tl={data.tl} gaps={data.gaps} onSelect={pick} onSeek={seekTo} />
              </Card>
            </div>

            {/* right: summary + findings */}
            <Card as="aside" padded={false} className="order-2 h-fit p-4 xl:sticky xl:top-20 xl:order-3" aria-label="Details">
              <Tabs value={tab} onChange={setTab} label="Details" items={[{ id: 'summary', label: 'Summary' }, { id: 'findings', label: 'Findings', count: data.finds.length }, { id: 'evidence', label: 'Evidence' }]} />
              <div className="mt-4 max-h-[calc(100vh-11rem)] overflow-auto pr-1">
                {tab === 'summary' && <SummaryPanel eventId={activeId} onSelectEvent={pickById} onOpenTrail={(kind, ev) => setTrail({ kind, ev })} />}
                {tab === 'findings' && <Findings findings={data.finds} contradictions={data.cons} corroborations={data.crbs} gaps={data.gaps} onFocusEvent={pickById} onReload={() => load(scenarioId)} />}
                {tab === 'evidence' && <Evidence caseId={caseId} evidence={data.ev} />}
              </div>
            </Card>

            {/* left: sources, actors, events */}
            <Card as="nav" padded={false} className="order-3 h-fit p-4 xl:order-1 [@media(max-height:1100px)]:max-h-full [@media(max-height:1100px)]:overflow-y-auto" aria-label="Evidence navigation">
              <h2 className="t-eyebrow mb-2 text-fg-3">Sources</h2>
              <ul className="space-y-1.5">
                {data.ev.filter((e) => ['cctv', 'dashcam', 'sensor_csv'].includes(e.kind)).map((e) => {
                  const sync = shifts[e.id] != null;
                  const isVideo = e.kind !== 'sensor_csv';
                  return (
                    <li key={e.id}>
                      <button type="button" disabled={!isVideo || !e.video?.playback_ready} aria-pressed={primaryId === e.id} onClick={() => useWorkspace.getState().setPrimaryVideo(e.id)}
                              className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left transition hover:bg-surface-2 aria-pressed:border-accent disabled:cursor-default disabled:hover:bg-transparent">
                        {isVideo ? <Film className="h-4 w-4 shrink-0 text-fg-3" aria-hidden /> : <Gauge className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />}
                        <span className="min-w-0 flex-1"><span className="t-small block truncate text-fg">{e.original_filename}</span>
                          <span className="t-caption text-fg-3">{e.kind}{sync ? ' · on case clock' : ' · not synchronized'}</span></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <h2 className="t-eyebrow mb-2 mt-5 flex items-center gap-1.5 text-fg-3"><Users className="h-3.5 w-3.5" aria-hidden />Vehicles and people</h2>
              {data.actors.length === 0 ? <p className="t-caption text-fg-3">No identities confirmed yet.</p> : (
                <ul className="space-y-1">
                  {data.actors.map((a, i) => (
                    <li key={a.id}>
                      <button type="button" aria-pressed={selectedActor === a.id} onClick={() => useWorkspace.getState().selectActor(selectedActor === a.id ? null : a.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10">
                        <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ACTOR_COLORS[i % ACTOR_COLORS.length] }} aria-hidden />
                        <span className="t-small flex-1 truncate">{a.label}</span>
                        <span className="t-caption text-fg-3">{a.links.filter((l) => l.status === 'confirmed').length} linked</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <h2 className="t-eyebrow mb-2 mt-5 text-fg-3">Events</h2>
              <ul className="max-h-72 space-y-0.5 overflow-auto pr-1" aria-label="Event list">
                {events.map((e) => (
                  <li key={e.id}>
                    <button type="button" aria-pressed={activeId === e.id} onClick={() => pick(e)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2 aria-pressed:bg-accent/10">
                      <i className="mt-1.5 h-2 w-2 shrink-0 rounded-sm" style={{ background: CATEGORY_STYLE[e.category]?.color }} aria-hidden />
                      <span className="min-w-0"><span className="mono t-caption block text-fg-3">{formatTime(e.start_ms)}</span><span className="t-caption block text-fg-2">{e.title}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* bottom: trajectory + telemetry */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card as="section" padded={false} className="p-3 sm:p-4" aria-label="Trajectories">
              <SectionHeader title="Trajectories" className="!mb-3" />
              <Trajectory trajs={data.trajs} actors={data.actors} selected={selectedActor} onSelect={(id) => useWorkspace.getState().selectActor(id)} />
            </Card>
            <Card as="section" padded={false} className="p-3 sm:p-4" aria-label="Telemetry">
              <SectionHeader title="Sensor telemetry" className="!mb-3" />
              {sensorEv ? <Sensor evidence={sensorEv} shift={shifts[sensorEv.id]} label={sensorEv.original_filename} events={(data.tl.lanes.sensor || []).filter((e) => ['hard_braking', 'collision_flag'].includes(e.event_type))} onSelect={pick} />
                : <p className="t-small text-fg-3">No sensor file in this case.</p>}
            </Card>
          </div>
        </>
      )}
      <p className="t-caption mt-6 text-fg-3">TraceLine supports an investigation. It does not determine fault or legal responsibility. Machine detections are candidates; inferences list their alternatives.</p>

      <FrameDrawer open={trail?.kind === 'frame'} onClose={() => setTrail(null)} evidence={trailEvidence} event={trail?.ev} />
      <StatementDrawer open={trail?.kind === 'statement'} onClose={() => setTrail(null)} event={trail?.ev} />
      <SensorDrawer open={trail?.kind === 'sensor'} onClose={() => setTrail(null)} evidence={trailEvidence} event={trail?.ev} />
    </Shell>
  );
}
