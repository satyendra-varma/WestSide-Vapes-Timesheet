import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackendApi, login } from '../src/api/backend';
import { ApiError, checkBackend, setFetchImplementation, setUnauthorizedListener } from '../src/api/client';
import { Backend, createBackend } from '../mock-backend/loadBackend';
import { seedWorld, SeededWorld } from '../mock-backend/seed';

const URL = 'https://mock.invalid/exec';

interface Sent { url: string; init?: RequestInit }

let backend: Backend;
let world: SeededWorld;
let sent: Sent[];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** fetch that talks to the in-process backend, recording every request. */
function useMockBackend(): void {
  setFetchImplementation(async (input, init) => {
    const url = String(input);
    sent.push({ url, init });
    if (!init || init.method === 'GET') return jsonResponse(backend.get());
    return jsonResponse(backend.postRaw(String(init.body)));
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_APPS_SCRIPT_URL', URL);
  backend = createBackend();
  world = seedWorld(backend);
  sent = [];
  useMockBackend();
});

afterEach(() => {
  setFetchImplementation(null);
  setUnauthorizedListener(null);
  vi.unstubAllEnvs();
});

describe('transport', () => {
  it('sends tokens in a text/plain POST body, never in the URL', async () => {
    const res = await login('Alex Demo', world.staff['Alex Demo']);
    await createBackendApi(res.token).getTimetable();
    const last = sent[sent.length - 1];
    expect(last.url).toBe(URL);
    expect(last.url).not.toContain(res.token);
    expect(last.init?.method).toBe('POST');
    expect((last.init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(JSON.parse(String(last.init?.body))).toEqual({ action: 'getTimetable', token: res.token });
  });

  it('params cannot override the action or token', async () => {
    const res = await login('Alex Demo', world.staff['Alex Demo']);
    await createBackendApi(res.token).saveShift({ date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:00' });
    const body = JSON.parse(String(sent[sent.length - 1].init?.body)) as Record<string, unknown>;
    expect(body.action).toBe('saveShift');
    expect(body.token).toBe(res.token);
  });

  it('reports network failures as "network"', async () => {
    setFetchImplementation(async () => { throw new TypeError('Failed to fetch'); });
    await expect(login('Alex Demo', '135790')).rejects.toMatchObject({ code: 'network' });
  });

  it('refuses to talk to anything but the v2 backend', async () => {
    await expect(checkBackend()).resolves.toBeUndefined();
    // The old (v1) script answers GET with an error object and no apiVersion.
    setFetchImplementation(async () => jsonResponse({ status: 'error', message: 'Invalid or missing action parameter' }));
    await expect(checkBackend()).rejects.toMatchObject({ code: 'bad_backend' });
    await expect(login('Alex Demo', '135790')).rejects.toMatchObject({ code: 'bad_backend' });
    setFetchImplementation(async () => new Response('<html>Sign in</html>', { status: 200 }));
    await expect(checkBackend()).rejects.toMatchObject({ code: 'bad_backend' });
  });

  it('needs a configured URL', async () => {
    vi.stubEnv('VITE_APPS_SCRIPT_URL', '');
    await expect(login('Alex Demo', '135790')).rejects.toMatchObject({ code: 'not_configured' });
    expect(sent).toHaveLength(0);
  });
});

describe('end to end against the real backend code', () => {
  it('logs in and reads data with the token', async () => {
    const res = await login('Alex Demo', world.staff['Alex Demo']);
    expect(res.user).toEqual({ name: 'Alex Demo', role: 'staff' });
    const api = createBackendApi(res.token);
    await api.saveShift({ date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20' });
    expect((await api.getTimesheet('10-2026')).records).toEqual([
      { date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20' },
    ]);
  });

  it('turns a wrong PIN into a typed error', async () => {
    const err = await login('Alex Demo', '000001').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('invalid_credentials');
  });

  it('reports a lockout with the wait time', async () => {
    for (let i = 0; i < 4; i++) await login('Sam Demo', '000001').catch(() => undefined);
    const err = (await login('Sam Demo', '000001').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('locked');
    expect(err.details.retryAfterMinutes).toBe(15);
  });

  it('calls the unauthorized listener when a token is refused', async () => {
    const listener = vi.fn();
    setUnauthorizedListener(listener);
    await expect(createBackendApi('forged.token').getEmployees()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('surfaces conflicts with the existing slot', async () => {
    const api = createBackendApi(world.managerToken);
    await api.saveShift({ date: '2026-10-08', shift: 'Evening', name: 'Alex Demo', inTime: '16:00', outTime: '23:00' });
    const err = (await api.saveShift({ date: '2026-10-08', shift: 'Evening', name: 'Sam Demo', inTime: '16:00', outTime: '22:00' }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('conflict');
    expect(err.details.previousData).toEqual({ name: 'Alex Demo', inTime: '16:00', outTime: '23:00' });
    await api.saveShift({ date: '2026-10-08', shift: 'Evening', name: 'Sam Demo', inTime: '16:00', outTime: '22:00', forceOverwrite: true });
    expect((await api.getTimesheet('10-2026')).records[0]).toMatchObject({ name: 'Sam Demo', outTime: '22:00' });
  });

  it('passes validation errors through with the field name', async () => {
    const api = createBackendApi(world.managerToken);
    const err = (await api.saveShift({ date: '2026-10-08', shift: 'Morning', name: 'Alex Demo', inTime: '9am', outTime: '15:00' }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('invalid');
    expect(err.details.field).toBe('inTime');
  });
});
