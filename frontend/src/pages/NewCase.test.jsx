import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, ToastProvider } from '../ui-kit';
import NewCase from './NewCase';

vi.mock('../api', () => ({ api: { cases: vi.fn().mockResolvedValue({ items: [] }), createCase: vi.fn(), upload: vi.fn(), jobs: vi.fn(), buildScenario: vi.fn(), addWitness: vi.fn(), addStatement: vi.fn() }, ApiError: class extends Error {} }));
import { api } from '../api';

const wrap = (url = '/new') => render(<ThemeProvider defaultTheme="dark" storageKey="t"><ToastProvider><MemoryRouter initialEntries={[url]}><NewCase /></MemoryRouter></ToastProvider></ThemeProvider>);
const pick = (name) => { const input = document.querySelector('input[type=file][accept="video/*"]'); fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'video/mp4' })] } }); };
beforeEach(() => vi.clearAllMocks());

describe('upload flow honesty', () => {
  it('a rejected upload shows the backend message and does not build a reconstruction', async () => {
    api.createCase.mockResolvedValue({ id: 'c1' });
    api.upload.mockRejectedValue(Object.assign(new Error('content looks like text (text/plain), which is not valid for kind cctv'), { code: 'UNSUPPORTED_CONTENT' }));
    wrap();
    fireEvent.change(screen.getByRole('textbox', { name: /Case title/ }), { target: { value: 'Broken upload' } });
    pick('garbage.mp4');
    fireEvent.click(screen.getByRole('button', { name: /Upload and analyse/ }));
    expect(await screen.findByText(/content looks like text/)).toBeInTheDocument();
    expect(api.buildScenario).not.toHaveBeenCalled();
  });
  it('declares footage real or synthetic exactly as chosen, never defaulting to synthetic', async () => {
    api.createCase.mockResolvedValue({ id: 'c1' });
    api.upload.mockRejectedValue(new Error('stop'));
    wrap('/new?title=Junction&designation=real');
    pick('clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: /Upload and analyse/ }));
    await waitFor(() => expect(api.upload).toHaveBeenCalled());
    expect(api.createCase).toHaveBeenCalledWith({ title: 'Junction', designation: 'real' });
    expect(api.upload.mock.calls[0][3]).toBe(false);
  });
  it('a job failure is reported with the stage and its error', async () => {
    api.createCase.mockResolvedValue({ id: 'c1' });
    api.upload.mockResolvedValue({});
    api.jobs.mockResolvedValue({ items: [{ id: 'j', stage: 'detect', status: 'failed', error: 'weights missing' }] });
    wrap('/new?title=T&designation=real');
    pick('clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: /Upload and analyse/ }));
    expect(await screen.findByText(/Detecting vehicles and people failed: weights missing/)).toBeInTheDocument();
    expect(api.buildScenario).not.toHaveBeenCalled();
  });
});
