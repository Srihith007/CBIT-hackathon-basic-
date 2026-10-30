/** Source metadata an investigator states about one video: camera name and kind, location text, recording start and end, timezone and clock offset.
 *  Only the clock part (start, timezone, offset, uncertainty) maps to a backend endpoint today (PUT /evidence/{id}/clock). The rest is kept in this
 *  browser and labelled as such until the backend stores it (docs/FRONTEND_V2_BACKEND_NEEDS.md). */

export const CAMERA_KINDS = [
  { value: 'cctv', label: 'CCTV (fixed)' },
  { value: 'dashcam', label: 'Dashcam (moving)' },
  { value: 'other', label: 'Other (not supported by the backend yet)', disabled: true },
];

export const EMPTY_META = { camera_name: '', camera_kind: 'cctv', location_text: '', recording_start: '', recording_end: '', timezone: '', clock_offset_s: '', clock_bound_s: '' };

export const isTimezone = (tz) => {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};
export const browserTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
export const timezoneList = () => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC']; } };

/** "2026-10-30T10:32" read as wall time in `tz` -> UTC Date. Two passes settle the offset across a DST change. */
export function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local || '');
  if (!m || !isTimezone(tz)) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || '0'].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const offsetAt = (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Errors keyed by field. Nothing is defaulted: a start time without a stated uncertainty is refused, because the backend would treat 0 as exact. */
export function validateMeta(m, { durationMs } = {}) {
  const e = {};
  if (m.recording_start && !m.timezone) e.timezone = 'Choose the timezone the camera clock was set to.';
  if (m.timezone && !isTimezone(m.timezone)) e.timezone = 'Not a valid IANA timezone, for example Asia/Kolkata or UTC.';
  if (m.recording_start && !zonedToUtc(m.recording_start, m.timezone)) e.recording_start = e.recording_start || 'Enter a valid start date and time.';
  if (m.recording_end) {
    const a = zonedToUtc(m.recording_start, m.timezone);
    const b = zonedToUtc(m.recording_end, m.timezone);
    if (!b) e.recording_end = 'Enter a valid end date and time.';
    else if (!m.recording_start) e.recording_end = 'Enter the start before the end.';
    else if (a && b <= a) e.recording_end = 'The end must be after the start.';
    else if (a && durationMs != null && Math.abs((b - a) - durationMs) > Math.max(2000, durationMs * 0.05)) {
      e.recording_end = `The file is ${(durationMs / 1000).toFixed(1)} s long, but start to end is ${((b - a) / 1000).toFixed(1)} s. Check both times.`;
    }
  }
  if (m.clock_offset_s !== '' && !Number.isFinite(num(m.clock_offset_s))) e.clock_offset_s = 'Enter a number of seconds.';
  if (m.clock_bound_s !== '' && !(Number.isFinite(num(m.clock_bound_s)) && num(m.clock_bound_s) >= 0)) e.clock_bound_s = 'Enter zero or more seconds.';
  if (m.recording_start && m.clock_bound_s === '') e.clock_bound_s = 'State how certain the start time is (± seconds). It is not assumed.';
  return e;
}

/** Body for PUT /evidence/{id}/clock, or null when no start time was entered. `clock_offset_s` > 0 means the camera clock runs ahead of true time. */
export function toClockBody(m) {
  if (!m.recording_start) return null;
  const start = zonedToUtc(m.recording_start, m.timezone);
  if (!start) return null;
  const offsetMs = (num(m.clock_offset_s) || 0) * 1000;
  const utcZero = new Date(start.getTime() - offsetMs);
  const parts = [m.camera_name && `camera ${m.camera_name}`, m.clock_offset_s !== '' && `stated clock offset ${num(m.clock_offset_s)} s`].filter(Boolean);
  return { utc_zero: utcZero.toISOString(), bound_ms: (num(m.clock_bound_s) || 0) * 1000, basis: 'declared_by_investigator', timezone: m.timezone, note: parts.join('; ') || null };
}

const key = (evidenceId) => `traceline.sourceMeta.${evidenceId}`;
export const loadLocalMeta = (evidenceId) => { try { return JSON.parse(localStorage.getItem(key(evidenceId))); } catch { return null; } };
export const saveLocalMeta = (evidenceId, m) => { try { localStorage.setItem(key(evidenceId), JSON.stringify(m)); } catch { /* storage unavailable */ } };
