// North American phone numbers for customer requests. Mirrors normalizePhone() in
// apps-script/src/12_requests.js (tests/stockRequestsClient.test.ts checks they agree).

/** "(604) 555-0123", "+1 604 555 0123", … -> "604-555-0123"; "" if it isn't a valid NANP number. */
export function normalizePhone(value: string): string {
  const raw = value.trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** "604-555-0123" -> "tel:+16045550123" (empty string if the stored value isn't a valid number). */
export function telHref(stored: string): string {
  const normalized = normalizePhone(stored);
  return normalized ? `tel:+1${normalized.replace(/-/g, '')}` : '';
}
