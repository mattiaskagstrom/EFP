import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => {
  const mock = vi.fn();
  window.fetch = mock;
  return mock;
});
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }));
vi.mock('@geoman-io/leaflet-geoman-free', () => ({}));

import { UserInvestigationView } from './main';

const finding = { id: 'finding-1', submittedBy: 'Alfa 1', observedAt: '2026-10-12T08:30:00Z', submittedAt: '2026-10-12T09:00:00Z', latitude: 59.33, longitude: 18.06 };

beforeEach(() => {
  request.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  localStorage.setItem('efp.userConnection:investigation-1', JSON.stringify({ token: 'session-token', callsign: 'Alfa 1', investigationId: 'investigation-1' }));
  request.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, json: async () => finding };
    return { ok: true, json: async () => url.endsWith('/auth/user/session') ? { callsign: 'Alfa 1' } : [] };
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function prepareFinding() {
  render(<UserInvestigationView investigation={{ id: 'investigation-1', name: 'Sökinsats', status: 'Active' }} onBack={vi.fn()} />);
  const imageInput = await screen.findByLabelText('Bild');
  const image = new File(['image'], 'fynd.jpg', { type: 'image/jpeg' });
  fireEvent.change(imageInput, { target: { files: [image] } });
  fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '59.33' } });
  fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: '18.06' } });
  fireEvent.change(screen.getByLabelText('Tidpunkt'), { target: { value: '2026-10-12T10:30' } });
  fireEvent.change(screen.getByLabelText('Beskrivning'), { target: { value: '  En röd ryggsäck  ' } });
  return { imageInput, image };
}

function submissions() {
  return request.mock.calls.filter(([, init]) => init?.method === 'POST');
}

describe('Submitting a finding', () => {
  it('keeps the image and metadata local until Skicka is clicked, then sends them together', async () => {
    await prepareFinding();
    expect(submissions()).toHaveLength(0);

    fireEvent.submit(screen.getByRole('button', { name: 'Skicka' }).closest('form')!);
    await screen.findByText('Fyndet skickades.');

    expect(submissions()).toHaveLength(1);
    const [url, init] = submissions()[0];
    expect(url).toBe('/api/v1/investigations/investigation-1/findings');
    expect(init.headers).toEqual({ Authorization: 'Bearer session-token' });
    const form = init.body as FormData;
    expect((form.get('image') as File).name).toBe('fynd.jpg');
    expect(form.get('latitude')).toBe('59.33');
    expect(form.get('longitude')).toBe('18.06');
    expect(form.get('observedAt')).toBe(new Date('2026-10-12T10:30').toISOString());
    expect(form.get('description')).toBe('En röd ryggsäck');
    expect(screen.getByLabelText('Beskrivning')).toHaveValue('');
    expect(screen.getByLabelText('Bild')).toHaveValue('');
    fireEvent.submit(screen.getByRole('button', { name: 'Skicka' }).closest('form')!);
    expect(submissions()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Bild, position och tidpunkt måste anges för fyndet.');
  });

  it('prevents duplicate submissions while the request is pending', async () => {
    await prepareFinding();
    let resolve!: (response: unknown) => void;
    request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const submit = screen.getByRole('button', { name: 'Skicka' });
    fireEvent.submit(submit.closest('form')!);
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Skickar…');
    expect(screen.getByLabelText('Beskrivning')).toBeDisabled();
    fireEvent.submit(submit.closest('form')!);
    expect(submissions()).toHaveLength(1);
    resolve({ ok: true, json: async () => finding });
    await screen.findByText('Fyndet skickades.');
    expect(screen.getByRole('button', { name: 'Skicka' })).toBeEnabled();
  });

  it('preserves the draft after a network error and allows a retry', async () => {
    await prepareFinding();
    request.mockRejectedValueOnce(new TypeError('Network unavailable'));
    fireEvent.submit(screen.getByRole('button', { name: 'Skicka' }).closest('form')!);
    await screen.findByText('Fyndet kunde inte skickas. Försök igen.');
    expect(screen.getByLabelText('Beskrivning')).toHaveValue('  En röd ryggsäck  ');
    expect(screen.getByRole('button', { name: 'Skicka' })).toBeEnabled();
    fireEvent.submit(screen.getByRole('button', { name: 'Skicka' }).closest('form')!);
    await screen.findByText('Fyndet skickades.');
    await waitFor(() => expect(submissions()).toHaveLength(2));
  });
});
