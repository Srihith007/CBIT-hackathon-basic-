import { useEffect, useState } from 'react';
import { Badge } from '../ui-kit';
import { api } from '../api';
import { clock } from '../fmt';

const STATUS = {
  requires_review: ['Requires review', 'warning'], potential_contradiction: ['Potential contradiction', 'danger'], conflicting_accounts: ['Conflicting accounts', 'danger'],
  independently_supported: ['Independently supported', 'success'], insufficient_evidence_for_some_comparisons: ['Some comparisons not possible', 'neutral'],
};

function Layer({ title, items, render }) {
  if (!items?.length) return null;
  return (
    <section className="mt-4">
      <h4 className="t-eyebrow text-fg-3">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">{items.map((it, i) => <li key={i} className="t-small text-fg-2">{render(it)}</li>)}</ul>
    </section>
  );
}

/** Reads the stored summary for the active event. Five separate layers; nothing is merged into a single "what happened". */
export default function SummaryPanel({ eventId }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!eventId) return;
    setErr(null);
    api.summary(eventId).then(setS).catch((e) => setErr(e.message));
  }, [eventId]);
  if (!eventId) return <p className="t-small text-fg-3">Select an event on the timeline, or press play: the summary follows the playhead.</p>;
  if (err) return <p className="t-small text-danger">{err}</p>;
  if (!s || s.event_id !== eventId) return <p className="t-small text-fg-3">Loading summary…</p>;
  return (
    <article aria-live="polite">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="info">{s.category.replace(/_/g, ' ')}</Badge>
        {s.synthetic && <Badge variant="warning">synthetic</Badge>}
        {s.status.map((k) => <Badge key={k} variant={STATUS[k]?.[1] || 'neutral'}>{STATUS[k]?.[0] || k}</Badge>)}
      </div>
      <h3 className="t-h2 mt-2">{s.title}</h3>
      <p className="mono t-caption text-fg-3">{s.time.case_ms != null ? `${clock(s.time.case_ms)} ±${(s.time.uncertainty_ms / 1000).toFixed(2)} s` : 'no time on the case clock'}</p>
      <Layer title="Observations" items={s.observations} render={(x) => x.text} />
      <Layer title="Machine detections" items={s.detections} render={(x) => <>{x.text}{x.model && <span className="text-fg-3"> · {x.model}</span>}</>} />
      <Layer title="Witness claims" items={s.witness_claims} render={(x) => <>{x.witness}: “{x.quote}”</>} />
      <Layer title="Sensor readings" items={s.sensor_observations} render={(x) => x.text} />
      <Layer title="Inferences (possibilities, not facts)" items={s.inferences} render={(x) => <>{x.text}{x.alternatives && <span className="block text-fg-3">Alternatives: {x.alternatives.join('; ')}</span>}</>} />
      <Layer title="Contradictions" items={s.contradictions} render={(x) => <><b className="text-danger">{x.rule_id}</b> ({x.strength}) {x.explanation}</>} />
      <Layer title="Corroborations" items={s.corroborations} render={(x) => <><b className="text-success">{x.rule_id}</b> {x.explanation}</>} />
      <Layer title="Uncertainty" items={s.uncertainty} render={(x) => x} />
      <Layer title="Open questions" items={s.open_questions} render={(x) => x} />
      <p className="t-caption mt-4 text-fg-3">{s.generated_by}</p>
    </article>
  );
}
