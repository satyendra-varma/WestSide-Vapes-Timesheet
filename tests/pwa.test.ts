// The service worker must cache only the app's own static files and never touch API traffic
// (timesheets, roster, customer requests). Runs the real public/sw.js in a vm with fake browser APIs.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { renderPng } from '../scripts/make-icons';

const ROOT = resolve(__dirname, '..');
const ORIGIN = 'https://satyendra-varma.github.io';
const SCOPE = `${ORIGIN}/WestSide-Vapes-Timesheet/`;

interface FakeResponse { ok: boolean; type: string; body: string; clone(): FakeResponse }
interface FakeRequest { url: string; method: string; mode: string }
type Handler = (event: Record<string, unknown>) => void;

const response = (body: string, ok = true, type = 'basic'): FakeResponse => {
  const r: FakeResponse = { ok, type, body, clone: () => r };
  return r;
};

function loadServiceWorker(fetchImpl: (req: FakeRequest) => Promise<FakeResponse>) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, FakeResponse>>();
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const c = store.get(name)!;
      return { put: async (req: FakeRequest, res: FakeResponse) => { c.set(req.url, res); } };
    },
    match: async (req: FakeRequest) => {
      for (const c of store.values()) if (c.has(req.url)) return c.get(req.url);
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  class Request implements FakeRequest {
    url: string; method: string; mode: string;
    constructor(input: string, init: { method?: string; mode?: string } = {}) {
      this.url = new URL(input, `${SCOPE}sw.js`).href;
      this.method = init.method ?? 'GET';
      this.mode = init.mode ?? 'cors';
    }
  }
  const fetchSpy = vi.fn(fetchImpl);
  const context = vm.createContext({
    self: {
      addEventListener: (type: string, fn: Handler) => { handlers[type] = fn; },
      registration: { scope: SCOPE },
      location: { href: `${SCOPE}sw.js`, origin: ORIGIN },
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
    },
    caches,
    fetch: fetchSpy,
    Request,
    Response: { error: () => response('network error', false, 'error') },
    URL,
    Promise,
  });
  vm.runInContext(readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8'), context);

  /** Dispatches a fetch event; returns the response the worker chose, or null if it stayed out of it. */
  const dispatch = async (url: string, init: { method?: string; mode?: string } = {}): Promise<FakeResponse | null> => {
    const box: { responded: Promise<FakeResponse> | null } = { responded: null };
    handlers.fetch({ request: new Request(url, init), respondWith: (p: Promise<FakeResponse>) => { box.responded = p; } });
    return box.responded ? await box.responded : null;
  };
  return { dispatch, fetchSpy, store, handlers };
}

describe('service worker never touches API or customer data', () => {
  const sw = loadServiceWorker(async () => response('net'));

  it.each([
    ['every POST, even same-origin', `${SCOPE}anything`, { method: 'POST' }],
    ['the Apps Script backend', 'https://script.google.com/macros/s/abc/exec', {}],
    ['Apps Script redirects', 'https://script.googleusercontent.com/macros/echo?x=1', {}],
    ['the mock backend', 'http://localhost:8787/exec', {}],
    ['same-origin /exec paths', `${SCOPE}exec`, {}],
    ['same-origin ?action= URLs', `${SCOPE}assets/x.js?action=getRequests`, {}],
    ['other sites', 'https://fonts.example.com/font.woff2', {}],
    ['paths outside the app', `${ORIGIN}/other-app/assets/x.js`, {}],
  ])('ignores %s', async (_label, url, init) => {
    expect(await sw.dispatch(url, init)).toBeNull();
    expect(sw.fetchSpy).not.toHaveBeenCalled();
  });
});

describe('static assets', () => {
  it('caches hashed bundles and icons, then serves them from cache', async () => {
    const sw = loadServiceWorker(async () => response('js'));
    const url = `${SCOPE}assets/index-abc123.js`;
    expect((await sw.dispatch(url))?.body).toBe('js');
    await new Promise((r) => setTimeout(r, 0));
    expect((await sw.dispatch(url))?.body).toBe('js');
    expect(sw.fetchSpy).toHaveBeenCalledTimes(1);
    expect([...sw.store.get('wsv-static-v1')!.keys()]).toEqual([url]);
  });

  it('does not cache failed or opaque responses', async () => {
    const sw = loadServiceWorker(async () => response('err', false));
    await sw.dispatch(`${SCOPE}icons/icon-192.png`);
    const sw2 = loadServiceWorker(async () => response('opaque', true, 'opaque'));
    await sw2.dispatch(`${SCOPE}icons/icon-192.png`);
    await new Promise((r) => setTimeout(r, 0));
    expect(sw.store.size).toBe(0);
    expect(sw2.store.size).toBe(0);
  });

  it('pages are network-first, with the cached shell only as an offline fallback', async () => {
    let online = true;
    const sw = loadServiceWorker(async () => (online ? response('<html>new</html>') : Promise.reject(new TypeError('offline'))));
    expect((await sw.dispatch(SCOPE, { mode: 'navigate' }))?.body).toBe('<html>new</html>');
    await new Promise((r) => setTimeout(r, 0));
    online = false;
    expect((await sw.dispatch(SCOPE, { mode: 'navigate' }))?.body).toBe('<html>new</html>');
    expect(sw.fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('activation deletes caches from older versions', async () => {
    const sw = loadServiceWorker(async () => response('x'));
    sw.store.set('wsv-static-v0', new Map());
    let done: Promise<unknown> = Promise.resolve();
    sw.handlers.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect([...sw.store.keys()]).toEqual([]);
  });
});

describe('manifest and icons', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'manifest.webmanifest'), 'utf8')) as {
    name: string; start_url: string; scope: string; display: string; icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  it('is installable: name, standalone, relative start_url/scope, 192 + 512 + maskable icons', () => {
    expect(manifest.name).toBe('WestSide Vapes Timesheet');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('every icon exists with the declared pixel size and matches the generator', () => {
    for (const icon of manifest.icons) {
      const file = join(ROOT, 'public', icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const png = readFileSync(file);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w, h]);
    }
    expect(readFileSync(join(ROOT, 'public', 'icons', 'icon-192.png')).equals(renderPng(192))).toBe(true);
    expect(readFileSync(join(ROOT, 'public', 'icons', 'icon-maskable-512.png')).equals(renderPng(512, 0.8))).toBe(true);
  });

  it('index.html links the manifest and icons through the base path', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />');
    expect(html).toContain('%BASE_URL%icons/apple-touch-icon.png');
  });
});
