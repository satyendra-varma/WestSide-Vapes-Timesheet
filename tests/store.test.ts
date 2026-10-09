import { describe, expect, it } from 'vitest';
import { clearCache, invalidateCache, isStale, REFRESH_AFTER_MS, writeCache } from '../src/data/store';

describe('cache staleness (refresh when the app comes back into view)', () => {
  it('fresh data is not stale; data older than the limit is', () => {
    writeCache('timetable', []);
    const now = Date.now();
    expect(isStale('timetable', now)).toBe(false);
    expect(isStale('timetable', now + REFRESH_AFTER_MS + 1)).toBe(true);
  });

  it('missing, invalidated or cleared entries are never "stale" (they load normally instead)', () => {
    expect(isStale('never-loaded', Date.now() + 10 * REFRESH_AFTER_MS)).toBe(false);
    writeCache('a', 1);
    invalidateCache('a');
    expect(isStale('a', Date.now() + 10 * REFRESH_AFTER_MS)).toBe(false);
    writeCache('b', 1);
    clearCache();
    expect(isStale('b', Date.now() + 10 * REFRESH_AFTER_MS)).toBe(false);
  });
});
