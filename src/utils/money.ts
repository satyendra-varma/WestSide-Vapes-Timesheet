// Money is integer cents everywhere (DECISIONS D-015). No floating-point arithmetic on amounts:
// dollars are parsed from text digit by digit. Mirrors cashTotalCents/centsText in
// apps-script/src/13_cash.js (tests/money.test.ts checks they agree).

export interface Denomination {
  cents: number;
  label: string;
  kind: 'bill' | 'coin';
}

/** Canadian cash in circulation (no pennies since 2013). */
export const DENOMINATIONS: Denomination[] = [
  { cents: 10000, label: '$100', kind: 'bill' },
  { cents: 5000, label: '$50', kind: 'bill' },
  { cents: 2000, label: '$20', kind: 'bill' },
  { cents: 1000, label: '$10', kind: 'bill' },
  { cents: 500, label: '$5', kind: 'bill' },
  { cents: 200, label: '$2', kind: 'coin' },
  { cents: 100, label: '$1', kind: 'coin' },
  { cents: 25, label: '25¢', kind: 'coin' },
  { cents: 10, label: '10¢', kind: 'coin' },
  { cents: 5, label: '5¢', kind: 'coin' },
];

export const MAX_PIECES = 10000;

/** A count typed by the user: "" -> 0; whole numbers 0..10000; anything else -> null (invalid). */
export function parseCount(text: string): number | null {
  const t = text.trim();
  if (t === '') return 0;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_PIECES ? n : null;
}

/** Sum in integer cents of {"10000": n, …}. */
export function totalCents(counts: Record<string, number>): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d.cents * (counts[String(d.cents)] ?? 0), 0);
}

/** 25260 -> "$252.60", -500 -> "-$5.00", 123456789 -> "$1,234,567.89". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** "200", "200.5", "$1,200.50" -> integer cents; null if it isn't a valid non-negative amount. */
export function parseDollarsToCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents -> "200.50" for an input box (no currency sign, no thousands separators). */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
