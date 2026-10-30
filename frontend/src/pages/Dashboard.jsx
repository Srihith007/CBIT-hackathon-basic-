import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, ErrorState, LoadingState, StatCard } from '../ui-kit';
import { api } from '../api';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [cases, setCases] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    Promise.all([api.dashboard(), api.cases()]).then(([a, b]) => { setD(a); setCases(b.items); }).catch((e) => setErr(e.message));
  }, []);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="t-caption text-fg-3">← TraceLine</Link>
          <h1 className="mt-1 text-2xl font-semibold">Investigations</h1>
        </div>
        <Badge variant="warning">Investigation support · no fault determination</Badge>
      </header>
      {err && <ErrorState title="The API did not answer" description={`${err}. Start it with: uvicorn app.main:app --port 8000`} />}
      {!err && !d && <LoadingState label="Loading" />}
      {d && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Cases" value={d.cases.total} />
            <StatCard label="Evidence items" value={d.evidence.total} />
            <StatCard label="Jobs in progress" value={d.jobs.in_progress} />
            <StatCard label="Findings to review" value={d.findings_needing_review} />
          </div>
          {cases.length === 0 ? (
            <EmptyState title="No cases yet" description="Run backend/scripts/seed_demo.py to create the four synthetic demo cases." />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {cases.map((c) => (
                <li key={c.id}>
                  <Card className="p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={c.designation === 'synthetic' ? 'warning' : 'neutral'}>{c.designation}</Badge>
                      <span className="mono t-caption text-fg-3">{c.code}</span>
                    </div>
                    <h2 className="t-h2">{c.title}</h2>
                    <p className="t-small mt-1 text-fg-3">{c.counts ? `${c.counts.evidence_total} evidence items · ${c.counts.findings_unreviewed} findings to review` : ''}</p>
                    <div className="mt-4 flex gap-4">
                      <Link to={`/cases/${c.id}`} className="t-small text-accent-text">Open workspace →</Link>
                      <Link to={`/cases/${c.id}/report`} className="t-small text-fg-2">Report</Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
