import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/client';
import {
  clearOwner,
  enqueueShift,
  entriesFor,
  loadQueue,
  MAX_ENTRIES,
  otherOwnersCount,
  processQueue,
  QUEUE_KEY,
  QueuedInput,
  QueueStorage,
} from '../src/offline/shiftQueue';

class MemoryStorage implements QueueStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

let storage: MemoryStorage;
const shift = (date: string, extra: Partial<QueuedInput> = {}): QueuedInput => ({ date, shift: 'Morning', name: 'Alex Demo', inTime: '09:00', outTime: '15:20', ...extra });

beforeEach(() => {
  storage = new MemoryStorage();
});

describe('queueing', () => {
  it('stores only the shift fields, never force flags', () => {
    enqueueShift('Alex Demo', { ...shift('2026-10-08'), ...({ forceOverwrite: true } as object) } as QueuedInput, storage);
    const [entry] = loadQueue(storage);
    expect(entry.input).toEqual(shift('2026-10-08'));
    expect(entry.status).toBe('queued');
  });

  it('a newer log for the same date and shift replaces the older one', () => {
    enqueueShift('Alex Demo', shift('2026-10-08'), storage);
    enqueueShift('Alex Demo', shift('2026-10-08', { outTime: '16:00' }), storage);
    enqueueShift('Alex Demo', shift('2026-10-08', { shift: 'Evening' }), storage);
    expect(entriesFor('Alex Demo', storage).map((e) => [e.input.shift, e.input.outTime])).toEqual([['Morning', '16:00'], ['Evening', '15:20']]);
  });

  it('is capped so a broken device cannot grow it forever', () => {
    for (let i = 0; i < MAX_ENTRIES; i++) enqueueShift('Alex Demo', shift(`2026-10-${String((i % 28) + 1).padStart(2, '0')}`, { shift: i < 28 ? 'Morning' : 'Evening', name: `n${i}` }), storage);
    expect(() => enqueueShift('Alex Demo', shift('2026-09-01'), storage)).toThrow(/Too many/);
  });

  it('ignores corrupt storage', () => {
    storage.setItem(QUEUE_KEY, '{not json');
    expect(loadQueue(storage)).toEqual([]);
    storage.setItem(QUEUE_KEY, JSON.stringify([{ id: 1 }, 'x']));
    expect(loadQueue(storage)).toEqual([]);
  });
});

describe('owners', () => {
  it("keeps each user's entries separate and logout clears only that user's", () => {
    enqueueShift('Alex Demo', shift('2026-10-08'), storage);
    enqueueShift('Sam Demo', shift('2026-10-08', { name: 'Sam Demo' }), storage);
    expect(entriesFor('Alex Demo', storage)).toHaveLength(1);
    expect(otherOwnersCount('Alex Demo', storage)).toBe(1);
    clearOwner('Alex Demo', storage);
    expect(entriesFor('Alex Demo', storage)).toEqual([]);
    expect(entriesFor('Sam Demo', storage)).toHaveLength(1);
    clearOwner('Sam Demo', storage);
    expect(storage.getItem(QUEUE_KEY)).toBeNull();
  });
});

describe('processQueue', () => {
  it('sends in order and removes what was saved', async () => {
    enqueueShift('Alex Demo', shift('2026-10-07'), storage);
    enqueueShift('Alex Demo', shift('2026-10-08'), storage);
    const sent: string[] = [];
    const result = await processQueue('Alex Demo', async (input) => { sent.push(input.date); }, storage);
    expect(sent).toEqual(['2026-10-07', '2026-10-08']);
    expect(result).toEqual({ sent: 2, failed: 0, remaining: 0, stopped: false });
  });

  it('stops and keeps everything while still offline or busy', async () => {
    enqueueShift('Alex Demo', shift('2026-10-07'), storage);
    enqueueShift('Alex Demo', shift('2026-10-08'), storage);
    for (const code of ['network', 'busy'] as const) {
      const result = await processQueue('Alex Demo', async () => { throw new ApiError(code, 'x'); }, storage);
      expect(result).toMatchObject({ sent: 0, failed: 0, remaining: 2, stopped: true });
    }
    expect(entriesFor('Alex Demo', storage)[0].attempts).toBe(2);
  });

  it('stops without failing anything when the session is refused (re-login, then it continues)', async () => {
    enqueueShift('Alex Demo', shift('2026-10-08'), storage);
    const result = await processQueue('Alex Demo', async () => { throw new ApiError('unauthorized', 'x'); }, storage);
    expect(result.stopped).toBe(true);
    expect(entriesFor('Alex Demo', storage)[0].status).toBe('queued');
  });

  it('marks conflicts and validation errors as failed with a reason, and keeps going', async () => {
    enqueueShift('Alex Demo', shift('2026-10-06'), storage);
    enqueueShift('Alex Demo', shift('2026-10-07'), storage);
    enqueueShift('Alex Demo', shift('2026-10-08'), storage);
    const result = await processQueue('Alex Demo', async (input) => {
      if (input.date === '2026-10-06') throw new ApiError('conflict', 'x', { previousData: { name: 'Sam Demo', inTime: '09:00', outTime: '16:00' } });
      if (input.date === '2026-10-07') throw new ApiError('invalid', "Future dates can't be logged.");
    }, storage);
    expect(result).toEqual({ sent: 1, failed: 2, remaining: 2, stopped: false });
    const [a, b] = entriesFor('Alex Demo', storage);
    expect(a).toMatchObject({ status: 'failed', error: 'Already logged with different details (Sam Demo 09:00-16:00). Check the Timesheet.' });
    expect(b).toMatchObject({ status: 'failed', error: "Future dates can't be logged." });
    // Failed entries are not retried automatically; they wait for the user to discard them.
    const again = await processQueue('Alex Demo', async () => undefined, storage);
    expect(again.sent).toBe(0);
  });

  it("never sends another user's entries", async () => {
    enqueueShift('Sam Demo', shift('2026-10-08', { name: 'Sam Demo' }), storage);
    const sent: string[] = [];
    await processQueue('Alex Demo', async (input) => { sent.push(input.name); }, storage);
    expect(sent).toEqual([]);
    expect(entriesFor('Sam Demo', storage)).toHaveLength(1);
  });
});
