import { describe, expect, it } from 'vitest';
import { centsToInput, DENOMINATIONS, formatCents, parseCount, parseDollarsToCents, totalCents } from '../src/utils/money';
import { createBackend } from '../mock-backend/loadBackend';

describe('money is integer cents', () => {
  it('formats cents without floating point', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(25260)).toBe('$252.60');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('parses dollars from text digit by digit', () => {
    expect(parseDollarsToCents('200')).toBe(20000);
    expect(parseDollarsToCents('200.5')).toBe(20050);
    expect(parseDollarsToCents('$1,200.05')).toBe(120005);
    expect(parseDollarsToCents('0.10')).toBe(10);
    // 0.1 + 0.2 style traps: the text "0.29" is exactly 29 cents, not 28.999…
    expect(parseDollarsToCents('0.29')).toBe(29);
    for (const bad of ['', '-5', '1.234', 'abc', '1.2.3', '$']) expect(parseDollarsToCents(bad), bad).toBeNull();
    expect(centsToInput(20050)).toBe('200.50');
  });

  it('parses piece counts strictly', () => {
    expect(parseCount('')).toBe(0);
    expect(parseCount(' 12 ')).toBe(12);
    for (const bad of ['-1', '1.5', 'x', '10001']) expect(parseCount(bad), bad).toBeNull();
  });

  it('has exactly the Canadian denominations in circulation (no pennies)', () => {
    expect(DENOMINATIONS.map((d) => d.cents)).toEqual([10000, 5000, 2000, 1000, 500, 200, 100, 25, 10, 5]);
  });

  it('matches the backend total and formatting for the same counts', () => {
    const backend = createBackend();
    const samples: Array<Record<string, number>> = [
      { '10000': 1, '5000': 1, '2000': 3, '1000': 2, '500': 1, '200': 4, '100': 7, '25': 9, '10': 3, '5': 1 },
      { '10': 3, '5': 3 },
      {},
      { '25': 10000 },
    ];
    for (const counts of samples) {
      const ordered = DENOMINATIONS.map((d) => counts[String(d.cents)] ?? 0);
      const backendTotal = backend.run<number>('cashTotalCents', ordered);
      expect(totalCents(counts)).toBe(backendTotal);
      expect(formatCents(backendTotal)).toBe(backend.run<string>('centsText', backendTotal));
    }
  });
});
