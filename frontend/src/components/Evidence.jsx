import { useEffect, useState } from 'react';
import { Badge } from '../ui-kit';
import { api } from '../api';

function Statement({ st, label }) {
  const [claims, setClaims] = useState([]);
  useEffect(() => { api.claims(st.id).then((r) => setClaims(r.items)).catch(() => {}); }, [st.id]);
  const spans = claims.map((c) => [c.explicit_statement.char_start, c.explicit_statement.char_end, c]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let at = 0;
  spans.forEach(([a, b, c], i) => {
    if (a < at) return;
    out.push(st.text_original.slice(at, a));
    out.push(<mark key={i} className="rounded bg-warning/25 px-0.5 text-fg" title={`${c.extraction_status} · ${c.normalized_interpretation.event_type_hint || 'claim'}`}>{st.text_original.slice(a, b)}</mark>);
    at = b;
  });
  out.push(st.text_original.slice(at));
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2"><span className="t-small font-medium">{label}</span>{st.synthetic && <Badge variant="warning">synthetic</Badge>}</div>
      <p className="t-small whitespace-pre-wrap text-fg-2">{out}</p>
      <p className="t-caption mt-2 text-fg-3">Highlighted spans are extracted claims ({claims.length}). The original text is stored unchanged.</p>
    </div>
  );
}

export default function Evidence({ caseId, evidence }) {
  const [wit, setWit] = useState([]);
  useEffect(() => {
    api.witnesses(caseId).then(async (r) => {
      const all = await Promise.all(r.items.map(async (w) => (await fetch(`/api/v1/witnesses/${w.id}/statements`).then((x) => x.json())).items.map((s) => ({ s, label: w.label }))));
      setWit(all.flat());
    }).catch(() => {});
  }, [caseId]);
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {evidence.map((e) => (
          <li key={e.id} className="card flex flex-wrap items-center gap-2 p-3">
            <Badge variant="neutral">{e.kind}</Badge>
            <span className="t-small">{e.original_filename}</span>
            {e.synthetic && <Badge variant="warning">synthetic</Badge>}
            <span className="mono t-caption ml-auto text-fg-3" title={e.sha256}>sha256 {e.sha256.slice(0, 12)}…</span>
          </li>
        ))}
      </ul>
      {wit.map(({ s, label }) => <Statement key={s.id} st={s} label={label} />)}
    </div>
  );
}
