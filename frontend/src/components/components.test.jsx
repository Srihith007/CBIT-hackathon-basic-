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
const ev = (id, cat, start, end, extra = {}) => ({ id, category: cat, event_type: 'x', title: `title ${id}`, start_ms: start, end_ms: end, uncertainty_ms: 100, source_type: 'video_cctv', ...extra });
const tl = { span_ms: [1000, 6000], lanes: { cctv: [ev('a', 'machine_detection', 2000, 2000), ev('b', 'machine_detection', 4600, 4600)], witness: [ev('w', 'witness_claim', 3000, 4600, { source_type: 'witness' })] }, unplaced: [ev('u', 'witness_claim', null, null, { source_type: 'witness' })], marks: { b: { contradicted_by: ['c1'], corroborated_by: [] } }, unplaced_note: 'no time' };

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
