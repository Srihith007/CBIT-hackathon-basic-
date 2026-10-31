import { useEffect, useState } from 'react';
import { useWorkspace } from './store';

/** Case-clock time for React-rendered consumers, updated at most `hz` times per second (the clock itself ticks every frame). */
export function useThrottledTime(hz = 8) {
  const [t, setT] = useState(() => useWorkspace.getState().currentMs);
  useEffect(() => {
    let last = 0;
    let timer = 0;
    const unsub = useWorkspace.subscribe((s, p) => {
      if (s.currentMs === p.currentMs) return;
      const now = performance.now();
      clearTimeout(timer);
      if (now - last >= 1000 / hz) { last = now; setT(s.currentMs); } else timer = setTimeout(() => { last = performance.now(); setT(useWorkspace.getState().currentMs); }, 1000 / hz);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [hz]);
  return t;
}

import { api } from './api';
import { describeMotion } from './lib/moment';

/** Image-space motion of the vehicles involved in the possible accident moment, read from their stored track positions. null while loading. */
export function useMotions(moment, trajs) {
  const [motions, setMotions] = useState(null);
  useEffect(() => {
    setMotions(null);
    if (!moment || moment.mediaMs == null || !moment.trackIds.length) { setMotions([]); return undefined; }
    let off = false;
    const pks = moment.trackIds.map((id) => trajs.find((t) => t.track_ref?.evidence_id === moment.evidenceId && t.track_ref?.track_id === id)?.track_ref?.track_pk);
    Promise.all(moment.trackIds.slice(0, 4).map((id, i) => (pks[i]
      ? api.track(pks[i]).then((t) => describeMotion(t, moment.mediaMs)).catch(() => ({ kind: 'unknown', text: `object #${id}: its stored positions could not be read.` }))
      : Promise.resolve({ kind: 'unknown', text: `object #${id}: no stored trajectory to describe.` }))))
      .then((r) => { if (!off) setMotions(r); });
    return () => { off = true; };
  }, [moment?.eventId]); // eslint-disable-line react-hooks/exhaustive-deps
  return motions;
}
