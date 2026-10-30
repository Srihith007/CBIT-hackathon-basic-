import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card } from '../ui-kit';
import { Check, X } from 'lucide-react';
import Shell from '../layout';
import { api } from '../api';

export default function ReportPage() {
  const { caseId } = useParams();
  const [report, setReport] = useState(null);
  const [md, setMd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const open = async (r) => { setReport(r); setMd(await api.reportMd(r.id)); };
  useEffect(() => { api.reports(caseId).then(async (r) => { if (r.items[0]) open((await fetch(`/api/v1/reports/${r.items[0].id}`).then((x) => x.json()))); }).catch((e) => setErr(e.message)); }, [caseId]);
  const make = async (format) => { setBusy(true); setErr(null); try { await open(await api.report(caseId, null, format)); } catch (e) { setErr(e.message); } setBusy(false); };

  return (
    <Shell crumbs={[{ label: 'Workspace', to: `/cases/${caseId}` }, { label: 'Report' }]}>
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Investigation report</h1>
        <Button onClick={() => make('full')} loading={busy} variant="outline">Full export</Button>
        <Button onClick={() => make('investigator')} loading={busy} className="ml-auto" variant="primary">{busy ? 'Building…' : report ? 'Generate investigator report' : 'Generate report'}</Button>
      </div>
      {err && <Alert variant="danger" title="Could not build the report">{err}</Alert>}
      {report && (
        <>
          <Card as="section" padded={false} className="mb-6 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={report.validation.passed ? 'success' : 'danger'}>{report.validation.passed ? 'Passed validation' : 'Failed validation'}</Badge>
              <span className="t-caption text-fg-3">version {report.version}</span>
              {report.has_pdf && <Button as="a" size="sm" variant="outline" className="ml-auto" href={api.pdfUrl(report.id)}>Download PDF</Button>}
              <Button as="a" size="sm" variant="outline" href={`/api/v1/reports/${report.id}/markdown`}>Markdown</Button>
            </div>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {report.validation.checks.map((c) => (
                <li key={c.check} className="t-small flex items-start gap-2 text-fg-2">
                  {c.passed ? <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden /> : <X className="mt-0.5 h-4 w-4 text-danger" aria-hidden />}{c.check}
                </li>
              ))}
            </ul>
          </Card>
          <Card as="pre" className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-fg-2" style={{ fontFamily: 'inherit' }}>{md}</Card>
        </>
      )}
      {!report && !err && <p className="t-small text-fg-2">No report has been generated for this case yet.</p>}
    </div>
    </Shell>
  );
}
