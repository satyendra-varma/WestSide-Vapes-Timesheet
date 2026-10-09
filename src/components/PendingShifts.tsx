import React from 'react';
import { CloudOff, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { useShiftQueue } from '../offline/useShiftQueue';
import { removeEntry } from '../offline/shiftQueue';
import { useConfirm } from './ConfirmDialog';
import { useOnline } from '../hooks/useOnline';

interface PendingShiftsProps {
  onSendNow: () => Promise<void>;
}

/** Unsent shift logs kept on this device (offline queue), with clear status and no silent loss. */
export const PendingShifts: React.FC<PendingShiftsProps> = ({ onSendNow }) => {
  const { mine, others } = useShiftQueue();
  const online = useOnline();
  const confirm = useConfirm();
  const [sending, setSending] = React.useState(false);

  if (mine.length === 0 && others === 0) return null;

  const send = async () => {
    setSending(true);
    try {
      await onSendNow();
    } finally {
      setSending(false);
    }
  };

  const discard = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Discard unsent shift?',
      message: `${label} has not reached the server. Discarding deletes it from this device for good.`,
      confirmLabel: 'Discard',
      danger: true,
    });
    if (ok) removeEntry(id);
  };

  return (
    <section aria-labelledby="pending-title" className="bg-amber-500/10 border border-amber-500/40 rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="pending-title" className="text-sm font-extrabold text-amber-200 flex items-center gap-2">
          <CloudOff className="w-4 h-4" aria-hidden="true" />
          Not sent yet ({mine.length})
        </h3>
        {mine.some((e) => e.status === 'queued') && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="min-h-11 px-3 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-200 text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sending ? 'animate-spin' : ''}`} aria-hidden="true" />
            Send now
          </button>
        )}
      </div>
      <p className="text-[11px] text-amber-100/80 leading-relaxed">
        {online
          ? 'These are saved on this device and are sent automatically. Keep this app logged in until the list is empty.'
          : "You're offline. These are saved on this device and are sent automatically when you're back online. Don't log out."}
      </p>

      <ul className="space-y-2">
        {mine.map((e) => {
          const label = `${e.input.name}, ${e.input.shift} ${e.input.date} (${e.input.inTime}-${e.input.outTime})`;
          return (
            <li key={e.id} className={`rounded-xl p-3 border text-xs flex items-start justify-between gap-2 ${
              e.status === 'failed' ? 'bg-rose-500/10 border-rose-500/40' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="min-w-0 space-y-0.5">
                <p className="font-bold text-white break-words">{label}</p>
                {e.status === 'failed' ? (
                  <p className="text-rose-300 font-bold flex items-start gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                    Not saved: {e.error}
                  </p>
                ) : (
                  <p className="text-slate-400">Waiting to send{e.attempts > 0 ? ` · tried ${e.attempts}×` : ''}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void discard(e.id, label)}
                className="w-11 h-11 shrink-0 rounded-lg bg-slate-800 text-rose-300 flex items-center justify-center"
                aria-label={`Discard unsent shift: ${label}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {others > 0 && (
        <p className="text-[11px] text-slate-300">
          {others} unsent shift{others === 1 ? '' : 's'} from someone else {others === 1 ? 'is' : 'are'} waiting on this device. {others === 1 ? 'It' : 'They'} will be sent when that person logs in here.
        </p>
      )}
    </section>
  );
};
