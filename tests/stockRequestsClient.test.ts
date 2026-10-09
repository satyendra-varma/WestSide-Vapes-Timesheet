import { describe, expect, it } from 'vitest';
import { normalizePhone, telHref } from '../src/utils/phone';
import { requestsCsv } from '../src/utils/csv';
import { CustomerRequest } from '../src/api/types';
import { createBackend } from '../mock-backend/loadBackend';

describe('phone numbers', () => {
  it.each([
    ['(604) 555-0123', '604-555-0123'],
    ['604 555 0123', '604-555-0123'],
    ['+1 604.555.0123', '604-555-0123'],
    ['16045550123', '604-555-0123'],
    ['555-0123', ''],
    ['104-555-0123', ''],
    ['604-055-0123', ''],
    ['604-555-0123 x2', ''],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('builds tap-to-call links in E.164 form', () => {
    expect(telHref('604-555-0123')).toBe('tel:+16045550123');
    expect(telHref('garbage')).toBe('');
  });

  it('frontend and backend agree on every case', () => {
    const backend = createBackend();
    const inputs = ['(604) 555-0123', '+1 (778) 555-0199', '1 236 555 0100', '555-0123', '104-555-0123', '604-155-0123', 'abc', '604-555-01234', '+44 20 7946 0958', ''];
    for (const input of inputs) expect(backend.run<string>('normalizePhone', input), input).toBe(normalizePhone(input));
  });
});

describe('requests CSV (manager only)', () => {
  it('neutralises formula-looking names and keeps phones as text', () => {
    const rows: CustomerRequest[] = [{
      id: 'R-1', createdAt: '2026-10-09 10:00', customerName: '=HYPERLINK("x")', phone: '604-555-0123', product: 'Pods',
      status: 'open', statusChangedAt: '2026-10-09 10:00', statusChangedBy: 'Alex Demo', createdBy: 'Alex Demo',
    }];
    const lines = requestsCsv(rows).replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe('ID,Created,Customer name,Phone,Product,Status,Status changed,Changed by,Created by');
    expect(lines[1]).toBe(`R-1,2026-10-09 10:00,"'=HYPERLINK(""x"")",604-555-0123,Pods,open,2026-10-09 10:00,Alex Demo,Alex Demo`);
  });
});
