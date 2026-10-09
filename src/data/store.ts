// In-memory cache of server data for the current session. Never written to localStorage or
// sessionStorage; clearCache() runs on logout and when a session expires, so nothing lingers.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/client';

const cache = new Map<string, unknown>();
const fetchedAt = new Map<string, number>();
const listeners = new Set<() => void>();

/** Cached data older than this is re-fetched when the app comes back into view. */
export const REFRESH_AFTER_MS = 60_000;
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function readCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function writeCache<T>(key: string, value: T): void {
  cache.set(key, value);
  fetchedAt.set(key, Date.now());
  notify();
}

/** True when `key` was loaded more than `maxAgeMs` ago (other devices may have changed it). */
export function isStale(key: string, now = Date.now(), maxAgeMs = REFRESH_AFTER_MS): boolean {
  const at = fetchedAt.get(key);
  return at !== undefined && now - at > maxAgeMs;
}

export function invalidateCache(key: string): void {
  fetchedAt.delete(key);
  if (cache.delete(key)) notify();
}

export function clearCache(): void {
  cache.clear();
  fetchedAt.clear();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCacheVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export interface Resource<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
}

function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError('server_error', 'Something went wrong.');
}

/**
 * Cached server data for `key`, loaded on first use. A null key disables loading (e.g. while the
 * session is being re-authenticated); the cached value is then hidden as well.
 */
export function useResource<T>(key: string | null, loader: () => Promise<T>): Resource<T> {
  useCacheVersion();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const latestKey = useRef(key);
  latestKey.current = key;

  const load = useCallback(async () => {
    const requested = latestKey.current;
    if (requested === null) return;
    setLoading(true);
    setError(null);
    try {
      const value = await loaderRef.current();
      if (latestKey.current === requested) writeCache(requested, value);
    } catch (err) {
      if (latestKey.current === requested) setError(toApiError(err));
    } finally {
      if (latestKey.current === requested) setLoading(false);
    }
  }, []);

  const data = key === null ? undefined : readCache<T>(key);
  const missing = key !== null && data === undefined;

  useEffect(() => {
    if (missing && !error) void load();
    // Load once per key; errors stay visible until the user retries.
  }, [key, missing, error, load]);

  useEffect(() => {
    setError(null);
  }, [key]);

  // When the app comes back into view (tab switch, phone unlocked), refresh data that may have been
  // changed on another device, so everyone converges on what the sheet says.
  useEffect(() => {
    if (key === null) return;
    const refreshIfStale = () => {
      if (document.visibilityState === 'visible' && isStale(key)) void load();
    };
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [key, load]);

  return { data, loading: loading || (missing && !error), error, reload: load };
}
