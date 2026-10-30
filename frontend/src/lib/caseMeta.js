/** Incident date/time and location text are entered by the investigator. The backend case record has no field for them yet, so they are kept in this browser only
 *  and always shown with that label (docs/FRONTEND_V2_BACKEND_NEEDS.md). */
const key = (id) => `traceline.caseMeta.${id}`;
export const loadCaseMeta = (id) => { try { return JSON.parse(localStorage.getItem(key(id))); } catch { return null; } };
export const saveCaseMeta = (id, m) => { try { localStorage.setItem(key(id), JSON.stringify(m)); } catch { /* storage unavailable */ } };
