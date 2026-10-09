import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { timesheetKey, toMonthYear } from '../data/hooks';
import { invalidateCache } from '../data/store';
import {
  clearOwner,
  entriesFor,
  otherOwnersCount,
  processQueue,
  queueVersion,
  QueuedShift,
  subscribeQueue,
} from './shiftQueue';

export const QUEUE_RETRY_MS = 30_000;

/** The logged-in user's unsent shifts (and how many other people's are waiting on this device). */
export function useShiftQueue(): { mine: QueuedShift[]; others: number } {
  const { user } = useAuth();
  useSyncExternalStore(subscribeQueue, queueVersion, queueVersion);
  const owner = user?.name ?? '';
  return { mine: owner ? entriesFor(owner) : [], others: owner ? otherOwnersCount(owner) : 0 };
}

let running = false;

/**
 * Sends queued shifts with the current session: right away, whenever the browser comes back online,
 * and every 30 s while anything is waiting. Mounted once by the main screen. Returns "send now".
 */
export function useQueueRunner(): () => Promise<void> {
  const { user, api } = useAuth();
  const owner = user?.name ?? '';

  const runNow = useCallback(async () => {
    if (!api || !owner || running) return;
    running = true;
    try {
      await processQueue(owner, async (input) => {
        await api.saveShift(input);
        invalidateCache(timesheetKey(toMonthYear(input.date.slice(0, 7))));
      });
    } finally {
      running = false;
    }
  }, [api, owner]);

  useEffect(() => {
    void runNow();
    const onOnline = () => void runNow();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      if (owner && entriesFor(owner).some((e) => e.status === 'queued')) void runNow();
    }, QUEUE_RETRY_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [runNow, owner]);

  return runNow;
}

/** Logout that warns before throwing away this user's unsent shifts. */
export function useSafeLogout(): () => Promise<void> {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  return useCallback(async () => {
    const pending = user ? entriesFor(user.name).length : 0;
    if (user && pending > 0) {
      const ok = await confirm({
        title: 'Unsent shifts on this device',
        message: `${pending} shift log${pending === 1 ? " hasn't" : "s haven't"} reached the server yet. Logging out deletes ${pending === 1 ? 'it' : 'them'} from this device. Stay logged in and reconnect to send ${pending === 1 ? 'it' : 'them'}, or log out anyway.`,
        confirmLabel: 'Delete and log out',
        cancelLabel: 'Stay logged in',
        danger: true,
      });
      if (!ok) return;
      clearOwner(user.name);
    }
    logout();
  }, [user, logout, confirm]);
}
