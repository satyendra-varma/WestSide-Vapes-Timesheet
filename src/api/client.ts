// Transport for the v2 backend. Every call is a POST with a JSON body sent as text/plain, which keeps
// it a "simple" CORS request (Apps Script can't answer a preflight). Tokens only ever travel in the
// body, never in the URL. Nothing here is logged or stored.
import { API_VERSION, getApiUrl } from '../config';
import { ApiErrorCode, ShiftSlot } from './types';

export interface ApiErrorDetails {
  field?: string;
  retryAfterMinutes?: number;
  previousData?: ShiftSlot;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: ApiErrorDetails;

  constructor(code: ApiErrorCode, message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

const KNOWN_CODES: ApiErrorCode[] = [
  'unauthorized', 'forbidden', 'locked', 'invalid_credentials', 'invalid', 'conflict', 'not_found', 'busy', 'server_error',
];

let unauthorizedListener: (() => void) | null = null;

/** The auth layer registers here to return to the login screen when a token is refused. */
export function setUnauthorizedListener(listener: (() => void) | null): void {
  unauthorizedListener = listener;
}

type Fetch = typeof fetch;
let fetchImpl: Fetch | null = null;

/** Tests swap in a fetch that talks to the in-process mock backend. */
export function setFetchImplementation(impl: Fetch | null): void {
  fetchImpl = impl;
}

function doFetch(input: string, init?: RequestInit): Promise<Response> {
  return (fetchImpl ?? globalThis.fetch)(input, init);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asSlot(value: unknown): ShiftSlot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  return { name: asString(v.name) ?? '', inTime: asString(v.inTime) ?? '', outTime: asString(v.outTime) ?? '' };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object') return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError('bad_backend', 'The server sent an unexpected response.');
}

export async function apiCall<T>(action: string, params: Record<string, unknown> = {}, token?: string, url = getApiUrl()): Promise<T> {
  if (!url) throw new ApiError('not_configured', 'This app has no server address configured yet.');
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...params, action, token }),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('network', "Couldn't reach the server. Check the connection and try again.");
  }
  const body = await readJson(res);
  if (body.apiVersion !== API_VERSION) {
    throw new ApiError('bad_backend', "This server isn't the expected version of the WestSide backend.");
  }
  if (body.status === 'success') return body.data as T;

  const message = asString(body.message) ?? 'The request failed.';
  if (body.status === 'conflict') {
    throw new ApiError('conflict', message, { previousData: asSlot(body.previousData) });
  }
  const rawCode = asString(body.code);
  const code: ApiErrorCode = rawCode && (KNOWN_CODES as string[]).includes(rawCode) ? (rawCode as ApiErrorCode) : 'server_error';
  if (code === 'unauthorized') unauthorizedListener?.();
  throw new ApiError(code, message, {
    field: asString(body.field),
    retryAfterMinutes: typeof body.retryAfterMinutes === 'number' ? body.retryAfterMinutes : undefined,
  });
}

/**
 * Confirms the URL points at the v2 backend before anything else is sent to it. GET returns no data
 * (only the API version), so this is safe even against the old v1 script.
 */
export async function checkBackend(url = getApiUrl()): Promise<void> {
  if (!url) throw new ApiError('not_configured', 'This app has no server address configured yet.');
  let res: Response;
  try {
    res = await doFetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new ApiError('network', "Couldn't reach the server. Check the connection and try again.");
  }
  const body = await readJson(res);
  if (body.apiVersion !== API_VERSION) {
    throw new ApiError('bad_backend', "This server isn't the expected version of the WestSide backend.");
  }
}
