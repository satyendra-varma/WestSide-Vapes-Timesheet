// Runs the real backend (apps-script/Code.gs, the exact file the owner deploys) inside a Node vm
// sandbox whose globals are the fake Google services. Used by the tests and by the mock server.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createFakeGoogle, FakeGoogle } from './fakeGoogle';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE_FILE = join(ROOT, 'apps-script', 'Code.gs');

export interface ApiResponse {
  status: 'success' | 'error' | 'conflict';
  apiVersion?: number;
  code?: string;
  message?: string;
  data?: unknown;
  previousData?: { name: string; inTime: string; outTime: string };
  [key: string]: unknown;
}

export interface Backend {
  google: FakeGoogle;
  /** POST through doPost/ContentService, like the deployed web app. */
  post(body: Record<string, unknown>): ApiResponse;
  postRaw(raw: string): ApiResponse;
  /** GET through doGet. */
  get(): ApiResponse;
  /** Calls a top-level backend function (e.g. the one-time setup functions). */
  run<T = unknown>(fn: string, ...args: unknown[]): T;
}

interface TextOutput { getContent(): string }

export function createBackend(options: { timeZone?: string; nowMs?: number; liveClock?: boolean; code?: string } = {}): Backend {
  const google = createFakeGoogle(options);
  const context = vm.createContext({ ...google.globals });
  vm.runInContext(options.code ?? readFileSync(BUNDLE_FILE, 'utf8'), context, { filename: 'Code.gs' });

  const call = (fn: string, ...args: unknown[]): unknown => {
    const target = (context as Record<string, unknown>)[fn];
    if (typeof target !== 'function') throw new Error(`Backend has no function ${fn}`);
    return (target as (...a: unknown[]) => unknown)(...args);
  };
  const parse = (out: unknown): ApiResponse => JSON.parse((out as TextOutput).getContent()) as ApiResponse;

  return {
    google,
    post: (body) => parse(call('doPost', { postData: { contents: JSON.stringify(body) } })),
    postRaw: (raw) => parse(call('doPost', { postData: { contents: raw } })),
    get: () => parse(call('doGet', { parameter: {} })),
    run: <T,>(fn: string, ...args: unknown[]) => call(fn, ...args) as T,
  };
}
