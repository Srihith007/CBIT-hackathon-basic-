import { loadCaseMeta } from '../lib/caseMeta';

/** Shows investigator-entered incident time and location for a case, only if they were entered in this browser. Never fills in a value. */
export default function LocalCaseMeta({ caseId }) {
  const m = loadCaseMeta(caseId);
  if (!m || (!m.incident_at && !m.location)) return null;
  return (
    <p className="t-caption text-fg-3" data-testid="local-case-meta">
      {m.incident_at && <>Incident: {m.incident_at.replace('T', ' ')} </>}
      {m.location && <>· Location: {m.location} </>}
      <span className="text-fg-3">(entered by you, saved in this browser only)</span>
    </p>
  );
}
