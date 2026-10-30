import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, StepBack, StepForward } from 'lucide-react';
import { Button, Card, IconButton, Segmented } from '../ui-kit';
import { api } from '../api';
import { useWorkspace } from '../store';
import { ACTOR_COLORS, clock } from '../fmt';

/** One <video> per synchronized source. The first synchronized video is the clock while playing; the others follow it through the
 *  recorded offsets (media time = case time + shift). A source with no recorded clock relation is shown but never slaved. */
export default function Player({ videos, shifts, trackActors, actorLabels }) {
  const refs = useRef({});
  const raf = useRef(0);
  const { playing, rate, currentMs, seekRequest, overlays, setPlaying, setTime, setRate, seek } = useWorkspace();
  const master = videos.find((v) => shifts[v.id] != null);
  const lastSeek = useRef(0);
  const lastWrite = useRef(0);

  const toMedia = (v, caseMs) => (shifts[v.id] == null ? null : caseMs + shifts[v.id]);

  // seek requests: latest wins
  useEffect(() => {
    if (seekRequest.id === lastSeek.current) return;
    lastSeek.current = seekRequest.id;
    videos.forEach((v) => {
      const el = refs.current[v.id];
      const m = toMedia(v, seekRequest.ms);
      if (el && m != null) el.currentTime = Math.max(0, m / 1000);
    });
  }, [seekRequest, videos, shifts]);

  useEffect(() => {
    videos.forEach((v) => {
      const el = refs.current[v.id];
      if (!el) return;
      el.playbackRate = rate;
      const m = toMedia(v, currentMs);
      const inside = m != null && m >= 0 && m <= (v.video.duration_ms ?? 0);
      if (playing && inside) el.play().catch(() => {});
      else el.pause();
    });
  }, [playing, rate]);

  // the master video is the clock while playing
  useEffect(() => {
    if (!playing || !master) return undefined;
    const tick = (now) => {
      const el = refs.current[master.id];
      if (el) {
        const caseMs = el.currentTime * 1000 - shifts[master.id];
        if (now - lastWrite.current > 33) { lastWrite.current = now; setTime(caseMs); }
        videos.forEach((v) => {
          const s = refs.current[v.id];
          const m = toMedia(v, caseMs);
          if (!s || v.id === master.id || m == null) return;
          const inside = m >= 0 && m <= v.video.duration_ms;
          if (!inside) { if (!s.paused) s.pause(); return; }
          if (Math.abs(s.currentTime * 1000 - m) > 200) s.currentTime = m / 1000;
          if (s.paused) s.play().catch(() => {});
        });
        if (el.ended) setPlaying(false);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, master?.id]);

  // paused: keep slaves on the current time (e.g. after a click on the timeline)
  useEffect(() => {
    if (playing) return;
    videos.forEach((v) => {
      const el = refs.current[v.id];
      const m = toMedia(v, currentMs);
      if (el && m != null && Math.abs(el.currentTime * 1000 - m) > 80) el.currentTime = Math.max(0, m / 1000);
    });
  }, [currentMs, playing]);

  const step = useCallback((dir, big) => { setPlaying(false); seek(currentMs + dir * (big ? 1000 : 200)); }, [currentMs]);

  useEffect(() => {
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === 'ArrowRight') step(1, e.shiftKey);
      else if (e.key === 'ArrowLeft') step(-1, e.shiftKey);
      else if (e.key === 'ArrowUp') setRate(Math.min(rate * 2, 2));
      else if (e.key === 'ArrowDown') setRate(Math.max(rate / 2, 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, rate, step]);

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        {videos.map((v) => (
          <VideoTile key={v.id} v={v} setRef={(el) => { refs.current[v.id] = el; }} getEl={() => refs.current[v.id]} shift={shifts[v.id]} caseMs={currentMs}
                     overlays={overlays} trackActors={trackActors} actorLabels={actorLabels} isMaster={master?.id === v.id} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</Button>
        <IconButton icon={StepBack} label="Back 0.2 s" variant="outline" size="sm" onClick={() => step(-1)} />
        <IconButton icon={StepForward} label="Forward 0.2 s" variant="outline" size="sm" onClick={() => step(1)} />
        <span className="mono t-small ml-2" aria-label="Case time">case {clock(currentMs)}</span>
        <Segmented className="ml-auto" size="sm" label="Playback speed" value={rate} onChange={(v) => setRate(Number(v))} options={[0.25, 0.5, 1, 2].map((r) => ({ id: r, label: `${r}×` }))} />
      </div>
      <p className="t-caption mt-2 text-fg-3">Space play/pause · ←/→ 0.2 s (Shift 1 s) · ↑/↓ speed. The first synchronized video is the clock; others follow through the recorded offsets.</p>
    </div>
  );
}

function VideoTile({ v, setRef, getEl, shift, caseMs, overlays, trackActors, actorLabels, isMaster }) {
  const canvas = useRef(null);
  const cache = useRef({ from: -1, to: -1, items: [] });
  const media = shift == null ? null : caseMs + shift;
  const inside = media != null && media >= 0 && media <= v.video.duration_ms;

  // overlays are fetched in 10 s windows of media time
  useEffect(() => {
    if (!inside) return;
    const c = cache.current;
    if (media >= c.from && media < c.to) return;
    const from = Math.floor(media / 10000) * 10000;
    c.from = from; c.to = from + 10000;
    api.overlays(v.id, from, from + 10000).then((r) => { if (cache.current === c) c.items = r.items; }).catch(() => { c.items = []; });
  }, [Math.floor((media ?? 0) / 10000), inside]);

  useEffect(() => {
    const cv = canvas.current;
    const el = getEl();
    if (!cv || !el) return undefined;
    let id;
    const draw = () => {
      const ctx = cv.getContext('2d');
      const w = (cv.width = cv.clientWidth), h = (cv.height = cv.clientHeight);
      ctx.clearRect(0, 0, w, h);
      if (overlays.boxes && el.videoWidth) {
        const t = el.currentTime * 1000;
        const items = cache.current.items;
        let best = null;
        for (const it of items) if (it.time_ms <= t + 20 && (!best || it.time_ms > best.time_ms)) best = it;
        if (best && t - best.time_ms < 350) {
          const sc = Math.min(w / el.videoWidth, h / el.videoHeight);
          const ox = (w - el.videoWidth * sc) / 2, oy = (h - el.videoHeight * sc) / 2;
          best.boxes.forEach((b) => {
            const [x1, y1, x2, y2] = b.bbox;
            const actor = trackActors[`${v.id}:${b.track_id}`];
            const color = actor ? ACTOR_COLORS[actor.index % ACTOR_COLORS.length] : '#94a3b8';
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.setLineDash(b.backfilled ? [4, 3] : []);
            ctx.strokeRect(ox + x1 * sc, oy + y1 * sc, (x2 - x1) * sc, (y2 - y1) * sc);
            if (overlays.ids) {
              ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = '11px ui-monospace, monospace';
              const txt = `${actor ? actorLabels[actor.id] : `${b.class} #${b.track_id ?? '?'}`} ${Math.round(b.confidence * 100)}%`;
              ctx.fillText(txt, Math.min(ox + x1 * sc, w - ctx.measureText(txt).width - 2), Math.max(12, oy + y1 * sc - 4));
            }
          });
        }
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [overlays, trackActors, actorLabels]);

  return (
    <Card as="figure" padded={false} className="overflow-hidden">
      <div className="relative bg-black" style={{ aspectRatio: `${v.video.width} / ${v.video.height}` }}>
        <video ref={setRef} src={api.streamUrl(v.id)} muted playsInline preload="auto" className="absolute inset-0 h-full w-full object-contain" />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
        {shift == null && <Notice>Not synchronized with the other sources: no recorded clock relation. It plays on its own clock.</Notice>}
        {shift != null && !inside && <Notice>No footage at this case time.</Notice>}
      </div>
      <figcaption className="t-caption flex items-center justify-between gap-2 px-3 py-2 text-fg-3">
        <span className="truncate">{v.kind === 'cctv' ? 'CCTV' : 'Dashcam'} · {v.original_filename}{v.synthetic ? ' · synthetic' : ''}</span>
        <span className="mono">{media != null ? `media ${clock(media)}` : 'own clock'}{isMaster ? ' · clock' : ''}</span>
      </figcaption>
    </Card>
  );
}

const Notice = ({ children }) => <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-xs text-white">{children}</div>;
