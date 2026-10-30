import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '../ui-kit';
import { api } from '../api';

const STAGE = { validate: 'Checking the file', preprocess: 'Indexing frames', detect: 'Detecting vehicles and people', track: 'Tracking and finding events', extract_claims: 'Reading statements' };

/** Upload evidence, wait for the pipeline, build the reconstruction, open the workspace. Every file must be declared real or synthetic. */
export default function NewCase() {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [designation, setDesignation] = useState('real');
  const [videos, setVideos] = useState([]);
  const [sensor, setSensor] = useState(null);
  const [statement, setStatement] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const synthetic = designation === 'synthetic';
  const say = (m) => setLog((l) => [...l.slice(-12), m]);

  const run = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); setLog([]);
    try {
      const c = await api.createCase({ title, designation });
      say('Case created');
      for (const f of videos) { say(`Uploading ${f.name}…`); await api.upload(c.id, f.file, f.kind, synthetic); }
      if (sensor) { say('Uploading sensor file…'); await api.upload(c.id, sensor, 'sensor_csv', synthetic); }
      if (statement.trim()) {
        const w = await api.addWitness(c.id, 'Witness 1');
        await api.addStatement(w.id, statement, synthetic);
        say('Statement stored');
      }
      for (;;) {
        const jobs = (await api.jobs(c.id)).items;
        const active = jobs.filter((j) => ['pending', 'validating', 'processing'].includes(j.status));
        const failed = jobs.filter((j) => j.status === 'failed');
        if (failed.length) throw new Error(`${STAGE[failed[0].stage] || failed[0].stage} failed: ${failed[0].error || 'see job log'}`);
        if (!active.length && jobs.some((j) => j.stage === 'track' && j.status === 'completed')) break;
        if (!active.length && jobs.length && !videos.length) break;
        say(active.length ? `${STAGE[active[0].stage] || active[0].stage}…` : 'Waiting for the next stage…');
        await new Promise((r) => setTimeout(r, 1500));
      }
      say('Building the reconstruction…');
      await api.buildScenario(c.id, { name: 'Baseline' });
      nav(`/cases/${c.id}`);
    } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/dashboard" className="t-caption text-fg-3">← Investigations</Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold">New investigation</h1>
      <p className="t-small mb-6 text-fg-2">Upload dashcam or CCTV video (and optionally a sensor CSV or a witness statement). Detection runs on your machine; nothing is sent elsewhere.</p>
      <Card as="form" onSubmit={run} className="space-y-4">
        <Field label="Case title"><Input required value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} /></Field>
        <Field label="What is this footage?">
          <Select value={designation} onChange={(e) => setDesignation(e.target.value)} disabled={busy}
                  options={[{ value: 'real', label: 'Real incident footage' }, { value: 'staged', label: 'Staged / recreated' }, { value: 'synthetic', label: 'Synthetic / generated' }]} />
        </Field>
        <Field label="Videos" hint="Dashcam = moving camera, CCTV = fixed camera.">
          <Input type="file" accept="video/*" multiple disabled={busy}
                 onChange={(e) => setVideos([...e.target.files].map((file) => ({ file, name: file.name, kind: /dash/i.test(file.name) ? 'dashcam' : 'cctv' })))} />
        </Field>
        {videos.map((v, i) => (
          <div key={v.name} className="flex items-center gap-2"><span className="t-small flex-1 truncate">{v.name}</span>
            <Select className="h-9" value={v.kind} disabled={busy} onChange={(e) => setVideos(videos.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
                    options={[{ value: 'dashcam', label: 'Dashcam (moving)' }, { value: 'cctv', label: 'CCTV (fixed)' }]} /></div>
        ))}
        <Field label="Sensor CSV" optional hint="You map its columns afterwards via the API."><Input type="file" accept=".csv" disabled={busy} onChange={(e) => setSensor(e.target.files[0] || null)} /></Field>
        <Field label="Witness statement" optional><Textarea rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} disabled={busy} /></Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" loading={busy} disabled={!title || !videos.length}>{busy ? 'Working…' : 'Upload and analyse'}</Button>
          {synthetic && <Badge variant="warning">will be labelled synthetic</Badge>}
        </div>
        {log.length > 0 && <ul className="t-caption space-y-0.5 text-fg-3" role="status">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        {err && <Alert variant="danger" title="Something went wrong">{err}</Alert>}
      </Card>
      <p className="t-caption mt-4 text-fg-3">A single video is its own clock. With several videos, record how their clocks relate (API: sync-edges) before they are compared.</p>
    </div>
  );
}
