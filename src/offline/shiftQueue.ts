// Offline queue for NEW shift logs only (DECISIONS D-039). When the network is down, a shift is kept on
// this device and sent automatically later; it's never silently dropped. Edits, deletes, roster and
// customer data are never queued. Entries belong to the user who queued them, are only sent with that
// user's own session, and the user's entries are removed (after a warning) when they log out.
import { ApiError } from '../api/client';
import { SaveShiftInput } from '../api/types';

export const QUEUE_KEY = 'wsv_shift_queue';
export const MAX_ENTRIES = 50;

export type QueuedInput = Omit<SaveShiftInput, 'forceOverwrite' | 'expectedPrevious'>;

export interface QueuedShift {
  id: string;
  owner: string;
  input: QueuedInput;
  queuedAt: number;
  attempts: number;
  status: 'queued' | 'failed';
  error?: string;
}

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): QueueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let version = 0;

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function queueVersion(): number {
  return version;
}

function isEntry(value: unknown): value is QueuedShift {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const input = v.input as Record<string, unknown> | undefined;
  return typeof v.id === 'string' && typeof v.owner === 'string' && !!input &&
    typeof input.date === 'string' && typeof input.name === 'string' &&
    (v.status === 'queued' || v.status === 'failed');
}

export function loadQueue(storage: QueueStorage | null = defaultStorage()): QueuedShift[] {
  try {
    const raw = storage?.getItem(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function saveQueue(entries: QueuedShift[], storage: QueueStorage | null): void {
  try {
    if (entries.length === 0) storage?.removeItem(QUEUE_KEY);
    else storage?.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the caller still has the entry in memory for this session.
  }
  version += 1;
  listeners.forEach((l) => l());
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Adds a shift for later; a newer log for the same owner, date and shift replaces the older one. */
export function enqueueShift(owner: string, input: QueuedInput, storage: QueueStorage | null = defaultStorage(), now = Date.now()): QueuedShift {
  const entries = loadQueue(storage).filter((e) => !(e.owner === owner && e.input.date === input.date && e.input.shift === input.shift));
  if (entries.length >= MAX_ENTRIES) throw new Error('Too many unsent shifts on this device. Reconnect and send them first.');
  const entry: QueuedShift = {
    id: newId(),
    owner,
    input: { date: input.date, shift: input.shift, name: input.name, inTime: input.inTime, outTime: input.outTime },
    queuedAt: now,
    attempts: 0,
    status: 'queued',
  };
  saveQueue([...entries, entry], storage);
  return entry;
}

export function entriesFor(owner: string, storage: QueueStorage | null = defaultStorage()): QueuedShift[] {
  return loadQueue(storage).filter((e) => e.owner === owner);
}

export function otherOwnersCount(owner: string, storage: QueueStorage | null = defaultStorage()): number {
  return loadQueue(storage).filter((e) => e.owner !== owner).length;
}

export function removeEntry(id: string, storage: QueueStorage | null = defaultStorage()): void {
  saveQueue(loadQueue(storage).filter((e) => e.id !== id), storage);
}

/** Logout: drops this user's entries (the UI warns first). Other users' entries stay theirs. */
export function clearOwner(owner: string, storage: QueueStorage | null = defaultStorage()): void {
  saveQueue(loadQueue(storage).filter((e) => e.owner !== owner), storage);
}

export interface ProcessResult {
  sent: number;
  failed: number;
  remaining: number;
  /** True when sending stopped early (no connection, server busy, or session expired). */
  stopped: boolean;
}

/** Errors worth retrying later; anything else needs a person to look at it. */
const RETRYABLE = new Set(['network', 'busy']);

/**
 * Sends this owner's queued entries in order using their session. Stops at the first retryable error
 * (still offline) or when the session is refused.
 */
export async function processQueue(
  owner: string,
  save: (input: QueuedInput) => Promise<unknown>,
  storage: QueueStorage | null = defaultStorage(),
): Promise<ProcessResult> {
  let sent = 0;
  let failed = 0;
  let stopped = false;
  for (const entry of loadQueue(storage).filter((e) => e.owner === owner && e.status === 'queued')) {
    try {
      await save(entry.input);
      removeEntry(entry.id, storage);
      sent += 1;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      const current = loadQueue(storage);
      const index = current.findIndex((e) => e.id === entry.id);
      if (index === -1) continue;
      if (RETRYABLE.has(code) || code === 'unauthorized') {
        current[index] = { ...current[index], attempts: current[index].attempts + 1 };
        saveQueue(current, storage);
        stopped = true;
        break;
      }
      const reason = code === 'conflict'
        ? `Already logged with different details${err instanceof ApiError && err.details.previousData?.name ? ` (${err.details.previousData.name} ${err.details.previousData.inTime}-${err.details.previousData.outTime})` : ''}. Check the Timesheet.`
        : err instanceof ApiError ? err.message : 'Could not be saved.';
      current[index] = { ...current[index], attempts: current[index].attempts + 1, status: 'failed', error: reason };
      saveQueue(current, storage);
      failed += 1;
    }
  }
  return { sent, failed, remaining: entriesFor(owner, storage).length, stopped };
}
