import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Segmented, useToast } from '../ui-kit';
import { api } from '../api';

const KINDS = [['contradiction', 'Contradictions'], ['corroboration', 'Corroborations'], ['gap', 'Gaps'], ['open_question', 'Open questions'], ['inference', 'Inferences']];

/** Findings for the investigator to review. A finding is a prompt for judgment, never a conclusion. */
export default function Findings({ findings, contradictions, corroborations, gaps, onFocusEvent, onReload }) {
  const toast = useToast();
  const [kind, setKind] = useState('contradiction');
  const rows = findings.filter((f) => f.kind === kind);
  const con = Object.fromEntries(contradictions.map((c) => [c.id, c]));
  const crb = Object.fromEntries(corroborations.map((c) => [c.id, c]));
  const gap = Object.fromEntries(gaps.map((g) => [g.id, g]));
  const review = async (f, status) => {
    try { await api.review(f.id, status); toast({ title: status === 'reviewed' ? 'Marked as reviewed' : 'Marked as disputed', type: 'success' }); onReload(); }
    catch (e) { toast({ title: 'Could not save the review', description: e.message, type: 'error' }); }
  };
  return (
    <div>
      <Segmented value={kind} onChange={setKind} options={KINDS.map(([id, label]) => ({ id, label: `${label} (${findings.filter((f) => f.kind === id).length})` }))} label="Finding kind" size="sm" />
      {rows.length === 0 && <EmptyState className="mt-4" title="Nothing in this category" description="No findings of this kind were produced for this reconstruction." />}
      <ul className="mt-4 space-y-3">
        {rows.map((f) => {
          const c = con[f.ref_ids[0]], r = crb[f.ref_ids[0]], g = gap[f.ref_ids[0]];
          return (
            <Card as="li" key={f.id} padded={false} className="p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {c && <><Badge variant="danger">{c.rule_id}</Badge><Badge variant={c.strength === 'clear' ? 'warning' : 'neutral'}>{c.strength}</Badge></>}
                {r && <><Badge variant="success">{r.rule_id}</Badge><Badge variant="info">{r.independent ? 'independent sources' : 'not independent'}</Badge></>}
                {g && <Badge variant="warning">{g.gap_type.replace(/_/g, ' ')}</Badge>}
                <Badge variant={f.review_status === 'reviewed' ? 'success' : f.review_status === 'disputed' ? 'danger' : 'neutral'}>{f.review_status}</Badge>
              </div>
              <p className="t-small text-fg">{f.text}</p>
              {c && <details className="mt-2"><summary className="t-caption cursor-pointer text-fg-3">Possible innocent explanations and open questions</summary>
                <ul className="t-small mt-1 list-disc pl-5 text-fg-2">{[...(c.basis.benign_explanations || []), ...(c.unresolved_questions || [])].map((x) => <li key={x}>{x}</li>)}</ul></details>}
              {r && <p className="t-caption mt-1 text-fg-3">{r.independence_reason}</p>}
              {g && <p className="t-caption mt-1 text-fg-3">Next step: {g.recommendation}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {(c ? [c.event_a, c.event_b] : r ? r.events.slice(0, 2) : []).map((id, i) => <Button key={id} size="sm" variant="outline" onClick={() => onFocusEvent(id)}>Show event {i + 1}</Button>)}
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => review(f, 'reviewed')}>Mark reviewed</Button>
                <Button size="sm" variant="outline" onClick={() => review(f, 'disputed')}>Dispute</Button>
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
