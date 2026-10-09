import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, seedWorld, SeededWorld } from '../../mock-backend/seed';

let backend: Backend;
let world: SeededWorld;

interface Page { entries: Array<{ timestamp: string; actor: string; action: string; target: string; details: string }>; total: number }
const audit = (params: Record<string, unknown> = {}, token = world.managerToken) =>
  backend.post({ action: 'getAudit', token, ...params });

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
});

describe('getAudit', () => {
  it('is manager-only', () => {
    const staff = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    expect(audit({}, staff).code).toBe('forbidden');
    expect(backend.post({ action: 'getAudit' }).code).toBe('unauthorized');
  });

  it('returns entries newest first with a total, and pages with limit/offset', () => {
    for (let d = 1; d <= 3; d++) {
      backend.post({ action: 'saveShift', token: world.managerToken, date: `2026-10-0${d}`, shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:00' });
    }
    const first = audit({ limit: 2 }).data as Page;
    expect(first.entries.map((e) => e.target)).toEqual(['2026-10-03 Morning', '2026-10-02 Morning']);
    expect(first.entries[0]).toMatchObject({ actor: 'Morgan Demo', action: 'shift.create', details: 'Alex Demo 09:00-15:00' });
    const second = audit({ limit: 2, offset: 2 }).data as Page;
    expect(second.entries[0].target).toBe('2026-10-01 Morning');
    expect(second.total).toBe(first.total);
    expect(audit({ offset: first.total }).data).toEqual({ entries: [], total: first.total });
  });

  it('formats timestamps whether stored as text or as date values', () => {
    const page = audit().data as Page;
    for (const e of page.entries) expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('clamps silly limits and never exposes PINs', () => {
    expect((audit({ limit: 10_000 }).data as Page).entries.length).toBeLessThanOrEqual(200);
    expect((audit({ limit: -5 }).data as Page).entries.length).toBe(1);
    const text = JSON.stringify(audit({ limit: 200 }).data);
    for (const pin of [world.managerPin, ...Object.values(world.staff)]) expect(text).not.toContain(pin);
  });
});
