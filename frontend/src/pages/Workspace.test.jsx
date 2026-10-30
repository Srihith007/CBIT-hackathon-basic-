import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkProvider, ThemeProvider, ToastProvider } from '../ui-kit';
import { useWorkspace } from '../store';
import Workspace from './Workspace';

vi.mock('../api', () => ({
  api: {
    cases: vi.fn(), case: vi.fn(), evidence: vi.fn(), actors: vi.fn(), scenarios: vi.fn(), timeline: vi.fn(),
    contradictions: vi.fn(), corroborations: vi.fn(), gaps: vi.fn(), findings: vi.fn(), trajectories: vi.fn(),
    seek: vi.fn(), incidentEvents: vi.fn(), incidentNarrative: vi.fn(), incidentFrames: vi.fn(), summary: vi.fn(),
    jobs: vi.fn(), modelRuns: vi.fn(), review: vi.fn(), associations: vi.fn(), completeness: vi.fn(), frames: vi.fn(),
    overlays: vi.fn(), streamUrl: (id) => `/api/v1/evidence/${id}/stream`,
  },
}));
import { api } from '../api';

const video = (id, name, extra = {}) => ({ id, kind: 'cctv', original_filename: `${id}.mp4`, status: 'valid', synthetic: false, video: { playback_ready: false, duration_ms: 10000 }, source: { display_name: name }, ...extra });
const slow = (id, ms, src, title) => ({ id, category: 'machine_detection', event_type: 'vehicle_slowing', title, start_ms: ms, end_ms: ms + 200, uncertainty_ms: 50, source_id: src, source_type: 'video_cctv', synchronized: true, observations: { source_time_ms: [ms, ms + 200] } });
const items = [
  { id: 'evt_a', event_type: 'vehicle_slowing', display: 'neutral', title: 'North vehicle slows', start_ms: 1000, end_ms: 1200, evidence_id: 'ev_n', track_ids: [3], track_classes: ['car'] },
  { id: 'evt_b', event_type: 'vehicle_slowing', display: 'neutral', title: 'South vehicle slows', start_ms: 4000, end_ms: 4200, evidence_id: 'ev_s', track_ids: [3], track_classes: ['car'] },
];

function setup({ hypotheses, designation = 'real', evidence = [video('ev_n', 'North camera', { synthetic: designation === 'synthetic' }), video('ev_s', 'South camera', { synthetic: designation === 'synthetic' })], assoc = null, completeness = null, gaps = [], cons = [], scenarios } = {}) {
  api.cases.mockResolvedValue({ items: [] });
  api.case.mockResolvedValue({ id: 'case_1', title: 'Junction', code: 'TL-1', designation });
  api.evidence.mockResolvedValue({ items: evidence });
  api.actors.mockResolvedValue({ items: [] });
  api.scenarios.mockResolvedValue({ items: scenarios || [{ id: 'scn_1', name: 'Baseline', is_baseline: true }] });
  api.timeline.mockResolvedValue({ lanes: { cctv: [slow('evt_a', 1000, 'ev_n', 'North vehicle slows'), slow('evt_b', 4000, 'ev_s', 'South vehicle slows')] }, unplaced: [], marks: {}, span_ms: [0, 6000], ...(hypotheses ? { hypotheses } : {}) });
  api.contradictions.mockResolvedValue({ items: cons });
  api.corroborations.mockResolvedValue({ items: [] });
  api.gaps.mockResolvedValue({ items: gaps });
  api.findings.mockResolvedValue({ items: [] });
  api.trajectories.mockResolvedValue({ items: [] });
  api.seek.mockResolvedValue({ targets: [], unsynchronized: [] });
  api.jobs.mockResolvedValue({ items: [] });
  api.modelRuns.mockResolvedValue({ items: [] });
  api.incidentEvents.mockResolvedValue({ scenario_id: 'scn_1', contact_status: 'insufficient_evidence', provenance: 'real-detector', items, unplaced: [] });
  api.incidentNarrative.mockResolvedValue({ contact_status: 'insufficient_evidence', deterministic: { headline: 'No collision or near miss was identified in the analysed evidence.', sentences: [] }, ai_narrative_status: 'unavailable', ai_narrative: null });
  api.incidentFrames.mockResolvedValue({ items: [] });
  if (assoc instanceof Error) api.associations.mockRejectedValue(assoc); else api.associations.mockResolvedValue(assoc);
  if (completeness instanceof Error) api.completeness.mockRejectedValue(completeness); else api.completeness.mockResolvedValue(completeness);
  api.frames.mockResolvedValue({ items: [] });
  return render(
    <ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter initialEntries={['/reconstruction/case_1']}>
      <LinkProvider component={Link} prop="to"><Routes><Route path="/reconstruction/:caseId" element={<Workspace />} /></Routes></LinkProvider>
    </MemoryRouter></ToastProvider></ThemeProvider>,
  );
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); useWorkspace.getState().reset('case_1', 'scn_1'); });

describe('reconstruction workspace order', () => {
  it('lists video, summary, vehicles, key observations, keyframes, timeline, contradictions and gaps, scenarios, then technical details', async () => {
    const { container } = setup({ assoc: new Error('404'), completeness: new Error('404') });
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    const order = ['Camera filter', 'Overview', 'Vehicles', 'Key observations', 'Timeline', 'Contradictions and gaps', 'Reconstruction scenarios'];
    const positions = order.map((name) => {
      const el = container.querySelector(`[aria-label="${name}"]`);
      expect(el, name).not.toBeNull();
      return el;
    });
    positions.slice(1).forEach((el, i) => expect(positions[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING, order[i + 1]).toBeTruthy());
    const details = screen.getByText('Technical details').closest('details');
    expect(details.open).toBe(false);
    expect(positions[6].compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('camera filter', () => {
  it('limits the timeline cards and key observations to one camera and restores them', async () => {
    setup();
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    const obs = () => screen.getByLabelText('Key observations');
    expect(obs()).toHaveTextContent('North vehicle slows');
    expect(obs()).toHaveTextContent('South vehicle slows');
    fireEvent.click(within(screen.getByRole('group', { name: 'Camera filter' })).getByRole('button', { name: 'South camera' }));
    expect(obs()).not.toHaveTextContent('North vehicle slows');
    expect(obs()).toHaveTextContent('South vehicle slows');
    expect(screen.queryByRole('button', { name: /North vehicle slows/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All cameras' }));
    expect(obs()).toHaveTextContent('North vehicle slows');
  });
  it('is not offered for a single camera', async () => {
    setup({ evidence: [video('ev_n', 'North camera')] });
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    expect(screen.queryByRole('group', { name: 'Camera filter' })).toBeNull();
  });
});

describe('timeline card seeks the existing player', () => {
  it('a card moves the single clock and does not create a second one', async () => {
    setup();
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    fireEvent.click(screen.getAllByRole('button', { name: /South vehicle slows/ })[0]);
    await waitFor(() => expect(useWorkspace.getState().currentMs).toBe(4000));
    expect(useWorkspace.getState().seek.latest).toBeGreaterThan(0);
  });
});

describe('hypotheses and scenarios', () => {
  it('labels every inference as a hypothesis with alternatives and no probability', async () => {
    setup({ hypotheses: [{ id: 'evt_h', evidence_class: 'hypothesis', statement: 'The lead vehicle may have braked for the junction.', alternatives: ['It may have slowed for traffic.'], premises: ['evt_a'], evidence_ids: ['ev_n'], probability: null }] });
    const section = await screen.findByLabelText('Reconstruction scenarios');
    expect(within(section).getByText('Hypothesis')).toBeInTheDocument();
    expect(section).toHaveTextContent('not a finding');
    expect(section).toHaveTextContent('It may have slowed for traffic.');
    expect(section).toHaveTextContent('likelihood Not established');
    expect(section.textContent).not.toMatch(/\d+\s?%/);
  });
  it('says plainly when the backend does not provide hypotheses yet and invents none', async () => {
    setup();
    const section = await screen.findByLabelText('Reconstruction scenarios');
    expect(section).toHaveTextContent('Not available from this backend build yet');
    expect(within(section).queryByText('Hypothesis')).toBeNull();
  });
  it('says there is insufficient evidence when the stored hypothesis list is empty', async () => {
    setup({ hypotheses: [] });
    expect(await screen.findByText(/Insufficient evidence to propose one/)).toBeInTheDocument();
  });
  it('shows completeness reasons from stored records only', async () => {
    setup({ completeness: { scenario_id: 'scn_1', defensible: false, reasons: ['sources_unsynchronized'], unsupported_hypotheses: [] } });
    const box = await screen.findByLabelText('Evidence completeness');
    expect(box).toHaveTextContent('Insufficient evidence');
    expect(box).toHaveTextContent('no recorded clock relation');
  });
});

describe('cross-camera association, gaps and sensors', () => {
  it('marks associations as not established when the backend has none, and never matches track numbers', async () => {
    setup({ assoc: { scenario_id: 'scn_1', items: [] } });
    fireEvent.click(await screen.findByText('Technical details'));
    expect(await screen.findByText(/Not established: whether any vehicle appears on more than one camera/)).toBeInTheDocument();
    expect(screen.queryByText(/same vehicle/i)).toBeNull();
  });
  it('shows a stored association as uncertain with no likelihood', async () => {
    setup({ assoc: { scenario_id: 'scn_1', items: [{ id: 'vas_1', status: 'uncertain', tracks: [{ evidence_id: 'ev_n', track_id: 3 }, { evidence_id: 'ev_s', track_id: 3 }], supporting: [{ kind: 'investigator', id: 'x' }], contradicting: [], basis: 'Investigator comparison', probability: null }] } });
    fireEvent.click(await screen.findByText('Technical details'));
    const card = await screen.findByText(/North camera track 3/);
    expect(card).toHaveTextContent('South camera track 3');
    const li = card.closest('li');
    expect(li).toHaveTextContent('Uncertain');
    expect(li).toHaveTextContent('likelihood Not established');
    expect(li).toHaveTextContent('not a confirmed identity');
  });
  it('states that association is not available yet when the endpoint does not exist', async () => {
    setup({ assoc: new Error('404') });
    fireEvent.click(await screen.findByText('Technical details'));
    expect(await screen.findByText(/Not available from this backend build yet. Cross-camera association is not established/)).toBeInTheDocument();
  });
  it('lists a recording gap as missing evidence for the camera it belongs to', async () => {
    setup({ gaps: [{ id: 'g1', gap_type: 'video_missing_interval', scope: { evidence_id: 'ev_s', from_ms: 5000, to_ms: 5600 }, recommendation: 'Ask for the original export.' }] });
    const gaps = await screen.findByLabelText('Recording gaps');
    expect(gaps).toHaveTextContent('Missing interval in the recording');
    expect(gaps).toHaveTextContent('South camera');
    expect(screen.getByLabelText('Contradictions and gaps')).toHaveTextContent('not a contradiction');
  });
  it('shows Unavailable for the sensor panel when the case has no sensor file', async () => {
    setup();
    fireEvent.click(await screen.findByText('Technical details'));
    expect(screen.getByLabelText('Sensor panel')).toHaveTextContent('Sensor data: Unavailable');
  });
  it('shows empty contradiction, corroboration and gap states', async () => {
    setup();
    expect(await screen.findByText('No contradiction, corroboration or gap is stored for this scenario.')).toBeInTheDocument();
  });
});

describe('before, during and after inspector', () => {
  it('shows real extracted frames around the selected event and says so for an empty window', async () => {
    api.frames.mockImplementation(async (_id, from) => (from === 0 ? { items: [{ id: 1, frame_no: 3, time_ms: 500, thumbnail_url: '/f/1.jpg' }] } : { items: [] }));
    setup();
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    api.frames.mockImplementation(async (_id, from) => (from < 1000 ? { items: [{ id: 1, frame_no: 3, time_ms: 500, thumbnail_url: '/f/1.jpg' }] } : { items: [] }));
    fireEvent.click(screen.getAllByRole('button', { name: /North vehicle slows/ })[0]);
    fireEvent.click(screen.getByRole('tab', { name: 'Event' }));
    const box = await screen.findByLabelText('Before, during and after');
    await waitFor(() => expect(within(box).getByAltText('before frame 3 at 500 ms')).toBeInTheDocument());
    expect(within(within(box).getByLabelText('during')).getByText('No extracted frame in this window.')).toBeInTheDocument();
    expect(api.frames).toHaveBeenCalledWith('ev_n', 0, 999);
  });
  it('says clocks are unavailable instead of computing them when the backend sends none', async () => {
    setup();
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    fireEvent.click(screen.getAllByRole('button', { name: /North vehicle slows/ })[0]);
    fireEvent.click(screen.getByRole('tab', { name: 'Event' }));
    expect(await screen.findByText(/Clock detail per event: Not available from this backend build yet/)).toBeInTheDocument();
  });
});

describe('real and synthetic banners in the workspace', () => {
  it('shows the synthetic banner for a synthetic case and nothing for a real case', async () => {
    const { unmount } = setup({ designation: 'synthetic' });
    expect(await screen.findByText('Synthetic demonstration data')).toBeInTheDocument();
    unmount();
    setup({ designation: 'real' });
    await screen.findByText('No collision or near miss was identified in the analysed evidence.');
    expect(screen.queryByText('Synthetic demonstration data')).toBeNull();
  });
});
