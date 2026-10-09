import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, createBackend } from '../../mock-backend/loadBackend';
import { login, seedWorld, SeededWorld } from '../../mock-backend/seed';

let backend: Backend;
let world: SeededWorld;
let alex: string;

interface Request { id: string; createdAt: string; customerName: string; phone: string; product: string; status: string; statusChangedAt: string; statusChangedBy: string; createdBy: string }
interface StockItem { id: string; product: string; status: string; notedBy: string; notedAt: string; resolved: boolean; resolvedBy: string; resolvedAt: string }

const CUSTOMER = 'Pat Example';
const PHONE_DIGITS = '6045550123';

const call = (token: string, action: string, params: Record<string, unknown> = {}) => backend.post({ action, token, ...params });
const requests = (token = alex) => call(token, 'getRequests').data as Request[];
const addRequest = (extra: Record<string, unknown> = {}, token = alex) =>
  call(token, 'addRequest', { customerName: CUSTOMER, phone: '(604) 555-0123', product: 'Mango Ice 20mg', ...extra });
const auditText = () => JSON.stringify(backend.google.spreadsheet.getSheetByName('Audit')!.dump());

beforeEach(() => {
  backend = createBackend();
  world = seedWorld(backend);
  alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
});

describe('stock list', () => {
  it('any staff member can add low/out items and tick them resolved', () => {
    const list = call(alex, 'addStock', { product: 'Coil 0.4ohm', status: 'low' }).data as StockItem[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ product: 'Coil 0.4ohm', status: 'low', notedBy: 'Alex Demo', resolved: false });
    expect(list[0].notedAt).toMatch(/^2026-10-09 \d{2}:\d{2}$/);
    const resolved = call(alex, 'setStockResolved', { id: list[0].id, resolved: true }).data as StockItem[];
    expect(resolved[0]).toMatchObject({ resolved: true, resolvedBy: 'Alex Demo' });
    expect(auditText()).toContain('stock.resolve');
  });

  it('re-reporting an open item updates it instead of duplicating', () => {
    call(alex, 'addStock', { product: 'Coil 0.4ohm', status: 'low' });
    const list = call(world.managerToken, 'addStock', { product: 'coil 0.4OHM', status: 'out' }).data as StockItem[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'out', notedBy: 'Morgan Demo' });
  });

  it('validates input and needs a session', () => {
    expect(call(alex, 'addStock', { product: '', status: 'low' }).field).toBe('product');
    expect(call(alex, 'addStock', { product: 'x'.repeat(81), status: 'low' }).field).toBe('product');
    expect(call(alex, 'addStock', { product: 'Pods', status: 'gone' }).field).toBe('status');
    expect(backend.post({ action: 'getStock' }).code).toBe('unauthorized');
  });
});

describe('customer requests', () => {
  it('stores minimal fields with a normalised phone and starts as open', () => {
    const [r] = addRequest().data as Request[];
    expect(r).toMatchObject({ customerName: CUSTOMER, phone: '604-555-0123', product: 'Mango Ice 20mg', status: 'open', createdBy: 'Alex Demo' });
    expect(r.id).toMatch(/^R-[0-9A-F]{8}$/);
    expect(Object.keys(r).sort()).toEqual(['createdAt', 'createdBy', 'customerName', 'id', 'phone', 'product', 'status', 'statusChangedAt', 'statusChangedBy']);
  });

  it.each([
    ['604 555 0123', '604-555-0123'],
    ['604.555.0123', '604-555-0123'],
    ['+1 (604) 555-0123', '604-555-0123'],
    ['1-604-555-0123', '604-555-0123'],
  ])('accepts %s', (phone, stored) => {
    expect((addRequest({ phone }).data as Request[])[0].phone).toBe(stored);
  });

  it.each(['555-0123', '604-555-01234', '104-555-0123', '604-155-0123', 'call me', '604-555-0123 ext 2', ''])('rejects %j without echoing it', (phone) => {
    const res = addRequest({ phone });
    expect(res.code).toBe('invalid');
    expect(res.field).toBe('phone');
    expect(res.message).not.toContain(phone || '§');
    expect(res.message).not.toContain(CUSTOMER);
  });

  it('error messages never contain the customer name or phone', () => {
    for (const res of [addRequest({ customerName: '' }), addRequest({ customerName: 'x'.repeat(61) }), addRequest({ product: '' })]) {
      expect(res.code).toBe('invalid');
      expect(JSON.stringify(res)).not.toContain(PHONE_DIGITS.slice(3));
      expect(JSON.stringify(res)).not.toContain(CUSTOMER);
    }
  });

  it('any staff member can view and change status; changes are audited by ID and status only', () => {
    const [r] = addRequest().data as Request[];
    const sam = login(backend, 'Sam Demo', world.staff['Sam Demo']);
    expect(requests(sam)[0].customerName).toBe(CUSTOMER);
    const updated = call(sam, 'updateRequestStatus', { id: r.id, status: 'contacted' }).data as Request[];
    expect(updated[0]).toMatchObject({ status: 'contacted', statusChangedBy: 'Sam Demo' });
    expect(call(sam, 'updateRequestStatus', { id: r.id, status: 'lost' }).field).toBe('status');

    const text = auditText();
    expect(text).toContain(`request.create","${r.id}","open`);
    expect(text).toContain(`request.status","${r.id}","open -> contacted`);
    expect(text).not.toContain(CUSTOMER);
    expect(text).not.toContain('555');
    expect(text).not.toContain('Mango');
  });

  it('only the manager can delete or change the purge period', () => {
    const [r] = addRequest().data as Request[];
    expect(call(alex, 'deleteRequest', { id: r.id }).code).toBe('forbidden');
    expect(call(alex, 'setRequestSettings', { purgeDays: 7 }).code).toBe('forbidden');
    expect(call(alex, 'getRequestSettings').code).toBe('forbidden');
    expect(call(world.managerToken, 'getRequestSettings').data).toEqual({ purgeDays: 30 });
    expect(call(world.managerToken, 'setRequestSettings', { purgeDays: 0 }).code).toBe('invalid');
    expect(call(world.managerToken, 'setRequestSettings', { purgeDays: 7 }).data).toEqual({ purgeDays: 7 });
    expect(call(world.managerToken, 'deleteRequest', { id: r.id }).data).toEqual([]);
    expect(auditText()).toContain('request.delete');
  });

  it('stores formula-looking names as plain text', () => {
    addRequest({ customerName: '=HYPERLINK("http://x","y")' });
    const sheet = backend.google.spreadsheet.getSheetByName('Requests')!;
    expect(sheet.formulas.size).toBe(0);
    expect(requests()[0].customerName).toBe('=HYPERLINK("http://x","y")');
  });

  it('never logs customer data to the console or Logger', () => {
    addRequest();
    addRequest({ phone: 'bad' });
    expect(backend.google.logs.join('\n')).not.toContain(CUSTOMER);
  });
});

describe('purge of fulfilled requests', () => {
  it('deletes only fulfilled requests older than the purge period and logs the count only', () => {
    const [keep] = addRequest({ product: 'Keep open' }).data as Request[];
    const list = addRequest({ product: 'Old fulfilled' }).data as Request[];
    const old = list.find((r) => r.product === 'Old fulfilled')!;
    call(alex, 'updateRequestStatus', { id: old.id, status: 'fulfilled' });

    backend.google.clock.advanceMinutes(60 * 24 * 29);
    expect(backend.run<number>('purgeFulfilledRequests')).toBe(0);
    alex = login(backend, 'Alex Demo', world.staff['Alex Demo']); // the 8 h session expired meanwhile

    const [recent] = (addRequest({ product: 'Recent fulfilled' }).data as Request[]).filter((r) => r.product === 'Recent fulfilled');
    call(alex, 'updateRequestStatus', { id: recent.id, status: 'fulfilled' });

    backend.google.clock.advanceMinutes(60 * 24 * 2);
    alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    expect(backend.run<number>('purgeFulfilledRequests')).toBe(1);
    expect(requests().map((r) => r.id).sort()).toEqual([keep.id, recent.id].sort());
    const text = auditText();
    expect(text).toContain('1 fulfilled request(s) older than 30 days deleted');
    expect(text).not.toContain('Old fulfilled');
  });

  it('honours the configured purge period', () => {
    const [r] = addRequest().data as Request[];
    call(alex, 'updateRequestStatus', { id: r.id, status: 'fulfilled' });
    call(world.managerToken, 'setRequestSettings', { purgeDays: 3 });
    backend.google.clock.advanceMinutes(60 * 24 * 4);
    alex = login(backend, 'Alex Demo', world.staff['Alex Demo']);
    expect(backend.run<number>('purgeFulfilledRequests')).toBe(1);
  });

  it('installTriggers sets up one daily purge trigger and is idempotent', () => {
    backend.run('installTriggers');
    backend.run('installTriggers');
    expect(backend.google.triggers.filter((t) => t.handler === 'purgeFulfilledRequests')).toEqual([
      { handler: 'purgeFulfilledRequests', kind: 'days', every: 1 },
    ]);
  });
});
