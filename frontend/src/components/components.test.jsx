import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ToastProvider } from '../ui-kit';
import DesignationBadge from './DesignationBadge';
import Timeline from './Timeline';
import SummaryPanel from './SummaryPanel';
import { FrameDrawer } from './EvidenceDrawers';
import { useWorkspace } from '../store';

vi.mock('../api', () => ({ api: { summary: vi.fn(), event: vi.fn(), cases: vi.fn(), dashboard: vi.fn(), jobs: vi.fn(), findings: vi.fn(), frames: vi.fn(), overlays: vi.fn(), fullFrameUrl: () => '/x.png' }, ApiError: class extends Error {} }));
import { api } from '../api';

const wrap = (ui) => render(<ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter>{ui}</MemoryRouter></ToastProvider></ThemeProvider>);
const ev = (id, cat, start, end, extra = {}) => ({ id, category: cat, event_type: 'possible_collision', title: `title ${id}`, start_ms: start, end_ms: end, uncertainty_ms: 100, source_type: 'video_cctv', ...extra });
const tl = { span_ms: [1000, 6000], lanes: { cctv: [ev('a', 'machine_detection', 2000, 2000), ev('b', 'machine_detection', 4600, 4600), ev('n', 'machine_detection', 3500, 3500, { event_type: 'vehicle_enters_scene' })], witness: [ev('w', 'witness_claim', 3000, 4600, { source_type: 'witness' })] }, unplaced: [ev('u', 'witness_claim', null, null, { source_type: 'witness' })], marks: { b: { contradicted_by: ['c1'], corroborated_by: [] } }, unplaced_note: 'no time' };

beforeEach(() => { useWorkspace.getState().reset('c', 's'); vi.clearAllMocks(); });

describe('real versus synthetic badges', () => {
  it('always says which kind of data it is, in text', () => {
    const { rerender } = render(<DesignationBadge designation="real" />);
    expect(screen.getByText('REAL')).toBeInTheDocument();
    rerender(<DesignationBadge designation="synthetic" />);
    expect(screen.getByText('SYNTHETIC')).toBeInTheDocument();
    rerender(<DesignationBadge designation="mixed" />);
    expect(screen.getByText('MIXED')).toBeInTheDocument();
    rerender(<DesignationBadge designation="weird" />);
    expect(screen.getByText('WEIRD')).toBeInTheDocument();
  });
});

describe('timeline', () => {
  it('selecting an event calls onSelect with that event (click and keyboard)', () => {
    const onSelect = vi.fn();
    wrap(<Timeline tl={tl} gaps={[]} onSelect={onSelect} onSeek={vi.fn()} />);
    const marker = screen.getByRole('button', { name: /title b, case 00:04.600/ });
    fireEvent.click(marker);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    fireEvent.keyDown(screen.getByRole('button', { name: /title a/ }), { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }));
  });
  it('shows the contradicted event as pressed only when active and lists unplaced events separately', () => {
    useWorkspace.getState().selectEvent('b', 4600);
    wrap(<Timeline tl={tl} gaps={[]} onSelect={vi.fn()} onSeek={vi.fn()} />);
    expect(screen.getByRole('button', { name: /title b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /title a/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/1 items have no usable time/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /title u, case/ })).toBeNull();
  });
  it('shows key events by default and every event on request', () => {
    wrap(<Timeline tl={tl} gaps={[]} onSelect={vi.fn()} onSeek={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /title n, case/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /All events/ }));
    expect(screen.getByRole('button', { name: /title n, case/ })).toBeInTheDocument();
  });
  it('highlights the events of the selected finding and dims the rest', () => {
    useWorkspace.getState().setFinding('f', ['b'], { start: 4500, end: 4700 });
    const { container } = wrap(<Timeline tl={tl} gaps={[]} onSelect={vi.fn()} onSeek={vi.fn()} />);
    expect(container.querySelector('title')).toBeTruthy();
    expect([...container.querySelectorAll('title')].some((t) => t.textContent === 'Selected finding interval')).toBe(true);
    const a = screen.getByRole('button', { name: /title a, case/ }).querySelector('rect:last-child');
    const b = screen.getByRole('button', { name: /title b, case/ }).querySelector('rect:last-child');
    expect(a.getAttribute('opacity')).toBe('0.25');
    expect(b.getAttribute('opacity')).toBe('1');
  });
  it('filters by category', () => {
    wrap(<Timeline tl={tl} gaps={[]} onSelect={vi.fn()} onSeek={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Witness claim/ }));
    expect(screen.queryByRole('button', { name: /title a, case/ })).toBeNull();
    expect(screen.getByRole('button', { name: /title w, case/ })).toBeInTheDocument();
  });
  it('the playhead follows the clock without a React render', () => {
    const { container } = wrap(<Timeline tl={tl} gaps={[]} onSelect={vi.fn()} onSeek={vi.fn()} />);
    const label = container.querySelector('text.mono[text-anchor="middle"]');
    expect(label.textContent).toBe('00:00.000');
    act(() => useWorkspace.getState().setTime(4600));
    expect(label.textContent).toBe('00:04.600');
    const g = label.closest('g');
    const x1 = g.getAttribute('transform');
    act(() => useWorkspace.getState().setTime(2000));
    expect(g.getAttribute('transform')).not.toBe(x1);
    expect(label.textContent).toBe('00:02.000');
  });
  it('shows missing-data bands from the gap records with case-clock times', () => {
    const { container } = wrap(<Timeline tl={tl} gaps={[{ id: 'g', gap_type: 'video_missing_interval', scope: { case_from_ms: 2500, case_to_ms: 3500 } }]} onSelect={vi.fn()} onSeek={vi.fn()} />);
    expect(container.querySelector('title')).toBeTruthy();
    expect([...container.querySelectorAll('title')].some((t) => /video missing interval · 00:02.500 to 00:03.500 \(case clock\)/.test(t.textContent))).toBe(true);
  });
});

describe('summary is never stale', () => {
  it('ignores a late response for an event that is no longer active', async () => {
    let resolveOld;
    api.summary.mockImplementation((id) => (id === 'old' ? new Promise((r) => { resolveOld = r; }) : Promise.resolve({ event_id: id, title: `summary ${id}`, category: 'machine_detection', status: [], time: { case_ms: 1, uncertainty_ms: 0 }, observations: [], detections: [], witness_claims: [], sensor_observations: [], inferences: [], contradictions: [], corroborations: [], uncertainty: [], open_questions: [], generated_by: 'g', synthetic: true })));
    api.event.mockImplementation((id) => Promise.resolve({ id, source_type: 'video_cctv', observations: {} }));
    const { rerender } = wrap(<SummaryPanel eventId="old" onSelectEvent={vi.fn()} onOpenTrail={vi.fn()} />);
    rerender(<ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter><SummaryPanel eventId="new" onSelectEvent={vi.fn()} onOpenTrail={vi.fn()} /></MemoryRouter></ToastProvider></ThemeProvider>);
    await screen.findByText('summary new');
    await act(async () => { resolveOld({ event_id: 'old', title: 'summary old', category: 'machine_detection', status: [], time: {}, observations: [], detections: [], witness_claims: [], sensor_observations: [], inferences: [], contradictions: [], corroborations: [], uncertainty: [], open_questions: [], generated_by: 'g', synthetic: true }); });
    expect(screen.queryByText('summary old')).toBeNull();
    expect(screen.getByText('summary new')).toBeInTheDocument();
  });
  it('shows an error state instead of old content when the request fails', async () => {
    api.summary.mockRejectedValue(new Error('boom'));
    api.event.mockRejectedValue(new Error('boom'));
    wrap(<SummaryPanel eventId="e1" onSelectEvent={vi.fn()} onOpenTrail={vi.fn()} />);
    expect(await screen.findByText(/Could not load this summary/)).toBeInTheDocument();
  });
});

describe('evidence drawers', () => {
  it('survive being closed after use (regression: crash when the event became undefined)', async () => {
    api.frames.mockResolvedValue({ items: [{ id: 1, frame_no: 5, time_ms: 4600 }] });
    api.overlays.mockResolvedValue({ items: [] });
    const e = { title: 't', start_ms: 4600, observations: { source_time_ms: [4600, 4600] } };
    const el = (open, event) => <ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><FrameDrawer open={open} onClose={() => {}} evidence={{ id: 'ev' }} event={event} /></ToastProvider></ThemeProvider>;
    const { rerender } = render(el(true, e));
    await screen.findByText('Seek the player to this moment');
    expect(() => rerender(el(false, undefined))).not.toThrow();
  });
});

import { FindingDetail } from './FindingParts';
import Overview from './Overview';
import { buildModel } from '../lib/overview';

describe('finding structure', () => {
  const f = { id: 'x', kind: 'contradiction', ruleId: 'CON-ACTION-01', classification: 'inferred', title: 'Camera does not match a witness account', summary: 'One sentence.', interval: { start: 1000, end: 1200, at: 1000 },
    supporting: [{ eventId: 'm', label: 'video says straight', source: 'CCTV', classification: 'observed', time: 1000 }], contradicting: [{ eventId: 'w', label: 'witness says left', source: 'Witness', classification: 'reported', time: 900 }],
    uncertainty: 'Different moment.', action: 'Check the moment.', review: { id: 'f1', review_status: 'unreviewed' }, technical: { text: 'raw rule text', ruleId: 'CON-ACTION-01', refs: ['m', 'w'], strength: 'clear' } };
  it('shows title, sentence, classification, time, supporting, contradicting, uncertainty and action, with technical detail folded', () => {
    wrap(<FindingDetail f={f} events={{ m: { id: 'm' }, w: { id: 'w' } }} onPick={vi.fn()} onOpenTrail={vi.fn()} onReview={vi.fn()} />);
    expect(screen.getByText('Camera does not match a witness account')).toBeInTheDocument();
    expect(screen.getByText('One sentence.')).toBeInTheDocument();
    expect(screen.getByText('Inferred by rule')).toBeInTheDocument();
    expect(screen.getByText('00:01.000 (case clock)')).toBeInTheDocument();
    expect(screen.getByText('Supporting evidence')).toBeInTheDocument();
    expect(screen.getByText('Contradicting evidence')).toBeInTheDocument();
    expect(screen.getByText('Uncertainty and limits')).toBeInTheDocument();
    expect(screen.getByText('Check the moment.')).toBeInTheDocument();
    expect(screen.getByText('raw rule text').closest('details')).not.toHaveAttribute('open');
  });
  it('an unknown finding with no evidence says so instead of inventing support', () => {
    wrap(<FindingDetail f={{ ...f, classification: 'unknown', supporting: [], contradicting: [], interval: null, review: null }} events={{}} onPick={vi.fn()} onOpenTrail={vi.fn()} />);
    expect(screen.getByText(/There is no evidence for this: that is the finding./)).toBeInTheDocument();
    expect(screen.getByText(/no time on the shared clock/)).toBeInTheDocument();
  });
  it('the overview labels imported boxes and shows nothing when there is nothing', () => {
    const m = buildModel({ evidence: [{ id: 'v', kind: 'cctv' }], actors: [], modelRuns: { v: [{ id: 'r', stage: 'detect', model_id: 'oracle:synthetic-world', status: 'completed', started_at: '2026-01-01', metrics: { boxes: 5 } }] } });
    wrap(<Overview model={m} designation="synthetic" onSelectFinding={vi.fn()} onSeeAll={vi.fn()} />);
    expect(screen.getByText('Imported boxes, not detector output')).toBeInTheDocument();
    expect(screen.getByText(/has not produced any tracked road users/)).toBeInTheDocument();
    expect(screen.getByText('Nothing is flagged for immediate review.')).toBeInTheDocument();
  });
});

describe('executive overview', () => {
  const ev = (id, o = {}) => ({ id, category: 'machine_detection', event_type: 'possible_collision', title: `t ${id}`, start_ms: 4600, end_ms: 4600, uncertainty_ms: 100, source_type: 'video_cctv', source_id: 'ev1', observations: { track_ids: [3] }, provenance: {}, ...o });
  it('opens with What happened, folds raw data away, and expands a factor into its evidence', async () => {
    const evidence = [{ id: 'ev1', kind: 'cctv' }];
    const events = [ev('c1'), ev('b1', { event_type: 'hard_braking', source_type: 'sensor', source_id: 'imu', start_ms: 4000, title: 'Braking recorded' })];
    const model = buildModel({ events, unplaced: [], cons: [], crbs: [], gaps: [], finds: [], trajs: [], actors: [], evidence, modelRuns: { ev1: [{ id: 'r', stage: 'detect', model_id: 'yolo26s', status: 'completed', started_at: '2026', metrics: {} }] }, jobs: [] });
    const { pickMoment } = await import('../lib/moment');
    const { buildExecutive } = await import('../lib/executive');
    const moment = pickMoment(events, []);
    const executive = buildExecutive({ model, moment, motions: [], events, evidence, actors: [], trajs: [], gaps: [], nameOf: () => 'North' });
    wrap(<Overview model={model} executive={executive} moment={moment} motions={[]} events={events} designation="real" nameOf={() => 'North'} onSelectFinding={vi.fn()} onSeeAll={vi.fn()} onPick={vi.fn()} onOpenTrail={vi.fn()} onTechnical={vi.fn()} />);
    expect(screen.getByText('What happened?')).toBeInTheDocument();
    const raw = screen.getByText('Raw analysis data').closest('details');
    expect(raw).not.toHaveAttribute('open');
    const factor = screen.getByRole('button', { name: /A vehicle sensor recorded a related signal/ });
    expect(factor).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(factor);
    expect(factor).toHaveAttribute('aria-expanded', 'true');
    expect((await screen.findAllByText('Braking recorded')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Verification:/)).toBeInTheDocument();
  });
});
