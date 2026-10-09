import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, seedWorld, SeededWorld } from '../../mock-backend/seed';

// Fake clock: 2026-10-09 13:00 America/Vancouver.
let backend: Backend;
let world: SeededWorld;
let alex: string;

interface CashCount { date: string; countedBy: string; updatedAt: string; counts: Record<string, number>; totalCents: number; floatCents: number; differenceCents: number }
interface CashDay { date: string; floatCents: number; count: CashCount | null }

const call = (token: string, action: string, params: Record<string, unknown> = {}) => backend.post({ action, token, ...params });
const save = (counts: Record<string, unknown>, token = alex, extra: Record<string, unknown> = {}) => call(token, 'saveCashCount', { counts, ...extra });
const auditRows = () => backend.google.spreadsheet.getSheetByName('Audit')!.dump().map((r) => r.slice(1).join(' | '));

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
  alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
});

describe('cash count totals (integer cents)', () => {
  it('adds every Canadian denomination exactly', () => {
    call(world.managerToken, 'setCashSettings', { floatCents: 20000 });
    const counts = { '10000': 1, '5000': 1, '2000': 3, '1000': 2, '500': 1, '200': 4, '100': 7, '25': 9, '10': 3, '5': 1 };
    const day = save(counts).data as CashDay;
    // 100 + 50 + 60 + 20 + 5 + 8 + 7 + 2.25 + 0.30 + 0.05 = $252.60
    expect(day.count).toMatchObject({ date: '2026-10-09', countedBy: 'Alex Demo', totalCents: 25260, floatCents: 20000, differenceCents: 5260 });
    expect(day.count!.counts).toEqual(counts);
  });

  it('cents never drift: 10¢ + 5¢ coins that would be 0.1 + 0.05 in floating point', () => {
    const day = save({ '10': 3, '5': 3 }).data as CashDay; // 0.30 + 0.15
    expect(day.count!.totalCents).toBe(45);
    expect(Number.isInteger(day.count!.differenceCents)).toBe(true);
  });

  it('a missing float means the difference equals the total', () => {
    const day = save({ '2000': 1 }).data as CashDay;
    expect(day.count).toMatchObject({ totalCents: 2000, floatCents: 0, differenceCents: 2000 });
  });

  it.each([
    [{ '2000': -1 }],
    [{ '2000': 1.5 }],
    [{ '2000': 'ten' }],
    [{ '2000': 10001 }],
    [{ '1': 3 }],
    [{ '2500': 1 }],
  ])('rejects %j', (counts) => {
    const res = save(counts);
    expect(res.code).toBe('invalid');
    expect(res.field).toBe('counts');
  });
});

describe('one count per day', () => {
  it('saving again today updates the same row and audits old -> new', () => {
    save({ '2000': 5 });
    const day = save({ '2000': 6 }).data as CashDay;
    expect(day.count!.totalCents).toBe(12000);
    expect(backend.google.spreadsheet.getSheetByName('CashCounts')!.getLastRow()).toBe(2);
    const rows = auditRows();
    expect(rows).toContain('Alex Demo | cash.create | 2026-10-09 | $100.00 (difference $100.00)');
    expect(rows).toContain('Alex Demo | cash.update | 2026-10-09 | $100.00 -> $120.00 (difference $120.00)');
  });

  it('keeps the float the day was first counted with, even if the setting changes later', () => {
    call(world.managerToken, 'setCashSettings', { floatCents: 20000 });
    save({ '2000': 10 });
    call(world.managerToken, 'setCashSettings', { floatCents: 30000 });
    const day = save({ '2000': 11 }).data as CashDay;
    expect(day.count).toMatchObject({ floatCents: 20000, differenceCents: 2000 });
    expect(day.floatCents).toBe(30000);
  });

  it('staff can only count today; the manager can fix a past day; nobody can count the future', () => {
    expect(save({ '2000': 1 }, alex, { date: '2026-10-08' }).code).toBe('forbidden');
    expect(save({ '2000': 1 }, world.managerToken, { date: '2026-10-08' }).status).toBe('success');
    expect(save({ '2000': 1 }, world.managerToken, { date: '2026-10-10' }).code).toBe('invalid');
    expect(save({ '2000': 1 }, world.managerToken, { date: '2026-02-30' }).code).toBe('invalid');
  });
});

describe('who sees what', () => {
  it("staff see today's count only; history is manager-only, newest first, by month", () => {
    save({ '2000': 1 }, world.managerToken, { date: '2026-10-01' });
    save({ '2000': 2 }, world.managerToken, { date: '2026-09-30' });
    save({ '2000': 3 });
    expect((call(alex, 'getCashToday').data as CashDay).count!.totalCents).toBe(6000);
    expect(call(alex, 'getCashHistory', { month: '2026-10' }).code).toBe('forbidden');
    const october = call(world.managerToken, 'getCashHistory', { month: '2026-10' }).data as CashCount[];
    expect(october.map((c) => [c.date, c.totalCents])).toEqual([['2026-10-09', 6000], ['2026-10-01', 2000]]);
    expect(call(world.managerToken, 'getCashHistory', { month: '2026-13' }).code).toBe('invalid');
  });

  it('only the manager sets the float, in whole cents within limits', () => {
    expect(call(alex, 'setCashSettings', { floatCents: 100 }).code).toBe('forbidden');
    for (const bad of [-1, 12.5, '200', 10_000_001]) {
      expect(call(world.managerToken, 'setCashSettings', { floatCents: bad }).code, String(bad)).toBe('invalid');
    }
    expect(call(world.managerToken, 'setCashSettings', { floatCents: 25050 }).data).toEqual({ floatCents: 25050 });
    expect(auditRows()).toContain('Morgan Demo | cash.float | CashCounts | $0.00 -> $250.50');
  });
});

describe('centsText', () => {
  it.each([[0, '$0.00'], [5, '$0.05'], [25260, '$252.60'], [123456789, '$1,234,567.89'], [-500, '-$5.00']])('%i -> %s', (cents, text) => {
    expect(backend.run<string>('centsText', cents)).toBe(text);
  });
});
