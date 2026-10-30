import { useMemo, useState } from 'react';
import { CATEGORY_STYLE, LANES, clock, sec } from '../fmt';

const LANE_H = 34;
const LEFT = 78;
const W = 1000;

/** Lanes by source on one case clock. Markers: bar = interval, diamond = instant. Red ring = contradicted, green ring = corroborated.
 *  Hatched bands = known missing footage / sensor data. Events without a usable time are listed under the chart, not placed. */
export default function Timeline({ tl, gaps = [], currentMs = 0, onSelect, activeId, compact = false }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const lanes = LANES.filter(([k]) => tl.lanes[k]?.length);
  const [lo0, hi0] = tl.span_ms?.[0] != null ? tl.span_ms : [0, 1000];
  const pad = Math.max((hi0 - lo0) * 0.06, 200);
  const full = [lo0 - pad, hi0 + pad];
  const width = (full[1] - full[0]) / zoom;
  const start = Math.min(Math.max(full[0] + pan, full[0]), full[1] - width);
  const x = (ms) => LEFT + ((ms - start) / width) * (W - LEFT - 10);
  const h = lanes.length * LANE_H + 30;

  const ticks = useMemo(() => {
    const step = [100, 200, 500, 1000, 2000, 5000].find((s) => width / s <= 14) || 5000;
    const out = [];
    for (let t = Math.ceil(start / step) * step; t <= start + width; t += step) out.push(t);
    return out;
  }, [start, width]);
  const bands = gaps.filter((g) => g.scope.case_from_ms != null && g.scope.case_to_ms != null);

  return (
    <div>
      {!compact && (
        <div className="mb-2 flex items-center gap-2">
          <button className="btn btn-sm btn-outline" onClick={() => setZoom((z) => Math.min(z * 2, 16))} aria-label="Zoom in">+</button>
          <button className="btn btn-sm btn-outline" onClick={() => setZoom((z) => Math.max(z / 2, 1))} aria-label="Zoom out">−</button>
          <button className="btn btn-sm btn-outline" onClick={() => { setZoom(1); setPan(0); }}>Fit</button>
          {zoom > 1 && <input type="range" min={0} max={Math.max(full[1] - full[0] - width, 1)} value={pan} onChange={(e) => setPan(+e.target.value)} className="w-40" aria-label="Pan" />}
          <span className="t-caption ml-auto flex flex-wrap gap-3 text-fg-3">
            {Object.values(CATEGORY_STYLE).map((c) => <span key={c.label} className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: c.color }} />{c.label}</span>)}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label="Investigation timeline">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgb(var(--danger))" strokeWidth="2" opacity="0.5" /></pattern>
          <clipPath id="plot"><rect x={LEFT} y="0" width={W - LEFT - 10} height={h} /></clipPath>
        </defs>
        {lanes.map(([k, label], i) => (
          <g key={k}>
            <text x={4} y={26 + i * LANE_H + 4} className="fill-fg-3 text-[11px]">{label}</text>
            <line x1={LEFT} x2={W - 10} y1={26 + i * LANE_H + LANE_H / 2} y2={26 + i * LANE_H + LANE_H / 2} stroke="rgb(var(--line))" />
          </g>
        ))}
        <g clipPath="url(#plot)">
          {ticks.map((t) => (
            <g key={t}><line x1={x(t)} x2={x(t)} y1={16} y2={h} stroke="rgb(var(--line))" strokeDasharray="2 4" /><text x={x(t)} y={11} textAnchor="middle" className="mono fill-fg-3 text-[10px]">{(t / 1000).toFixed(1)}s</text></g>
          ))}
          {bands.map((g) => (
            <rect key={g.id} x={x(g.scope.case_from_ms)} y={18} width={Math.max(x(g.scope.case_to_ms) - x(g.scope.case_from_ms), 3)} height={h - 20} fill="url(#hatch)">
              <title>{g.gap_type.replace(/_/g, ' ')}: {sec(g.scope.case_to_ms - g.scope.case_from_ms)} without data</title>
            </rect>
          ))}
          {lanes.flatMap(([k], i) => tl.lanes[k].map((e) => {
            const cy = 26 + i * LANE_H + LANE_H / 2;
            const m = tl.marks[e.id] || {};
            const color = CATEGORY_STYLE[e.category]?.color || 'gray';
            const x0 = x(e.start_ms);
            const x1 = x(e.end_ms ?? e.start_ms);
            const w = x1 - x0;
            const sel = activeId === e.id;
            const ring = m.contradicted_by?.length ? 'rgb(var(--danger))' : m.corroborated_by?.length ? 'rgb(var(--success))' : null;
            return (
              <g key={e.id} onClick={() => onSelect(e)} style={{ cursor: 'pointer' }} tabIndex={0} role="button" aria-label={e.title}
                 onKeyDown={(ev) => ev.key === 'Enter' && onSelect(e)}>
                <title>{e.title} · {clock(e.start_ms)} ±{(e.uncertainty_ms / 1000).toFixed(2)}s</title>
                {e.uncertainty_ms > 0 && <rect x={x(e.start_ms - e.uncertainty_ms)} y={cy - 2} width={Math.max(x(e.start_ms + e.uncertainty_ms) - x(e.start_ms - e.uncertainty_ms), 2)} height={4} fill={color} opacity="0.25" />}
                {w > 8 ? <rect x={x0} y={cy - 7} width={w} height={14} rx={3} fill={color} opacity={sel ? 1 : 0.7} stroke={ring || (sel ? 'white' : 'none')} strokeWidth={ring || sel ? 2 : 0} />
                  : <rect x={x0 - 6} y={cy - 6} width={12} height={12} transform={`rotate(45 ${x0} ${cy})`} fill={color} opacity={sel ? 1 : 0.85} stroke={ring || (sel ? 'white' : 'none')} strokeWidth={ring || sel ? 2 : 0} />}
              </g>
            );
          }))}
          <line x1={x(currentMs)} x2={x(currentMs)} y1={14} y2={h} stroke="rgb(var(--accent))" strokeWidth="2" />
        </g>
      </svg>
      {tl.unplaced?.length > 0 && !compact && (
        <details className="mt-3">
          <summary className="t-small cursor-pointer text-fg-2">{tl.unplaced.length} items could not be placed on the timeline</summary>
          <p className="t-caption mt-1 text-fg-3">{tl.unplaced_note}</p>
          <ul className="mt-2 space-y-1">
            {tl.unplaced.map((e) => <li key={e.id}><button className="t-small text-left text-fg-2 hover:text-fg" onClick={() => onSelect(e)}>{e.title}</button></li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
