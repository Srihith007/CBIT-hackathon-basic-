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
