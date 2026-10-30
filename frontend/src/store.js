import { create } from 'zustand';

/** One clock for the whole workspace. While playing, the master <video> writes `currentMs` (case time); everything else reads it.
 *  Seeking is a request with an increasing id so a late "seeked" event from an older request can never win. */
export const useWorkspace = create((set, get) => ({
  caseId: null,
  scenarioId: null,
  currentMs: 0,
  playing: false,
  rate: 1,
  activeEventId: null,
  selectedActorId: null,
  seekRequest: { id: 0, ms: 0 },
  overlays: { boxes: true, ids: true },
  reset: (caseId, scenarioId) => set({ caseId, scenarioId, currentMs: 0, playing: false, activeEventId: null, selectedActorId: null, seekRequest: { id: 0, ms: 0 } }),
  setTime: (ms) => set({ currentMs: ms }),
  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  setActive: (activeEventId) => set({ activeEventId }),
  selectActor: (selectedActorId) => set({ selectedActorId }),
  seek: (ms) => set((s) => ({ seekRequest: { id: s.seekRequest.id + 1, ms }, currentMs: ms })),
  toggleOverlay: (k) => set((s) => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
}));
