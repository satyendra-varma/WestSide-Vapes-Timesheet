import React, { useEffect, useState } from 'react';
import { BellRing, RefreshCw } from 'lucide-react';
import { ApiError } from '../api/client';
import { ReminderSettings as Settings } from '../api/types';
import { useAuth } from '../auth/AuthContext';

/** Manager-only: email reminders for unlogged rostered shifts (DECISIONS D-017, D-044). */
export const ReminderSettings: React.FC = () => {
  const { api } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [grace, setGrace] = useState('60');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const apply = (s: Settings) => {
    setSettings(s);
    setEnabled(s.enabled);
    setGrace(String(s.graceMinutes));
  };

  useEffect(() => {
    if (!api) return;
    api.getReminderSettings().then(apply).catch((err: unknown) => {
      if (!(err instanceof ApiError && err.code === 'unauthorized')) setMessage({ type: 'error', text: err instanceof ApiError ? err.message : "Couldn't load reminder settings." });
    });
  }, [api]);

  const save = async () => {
    if (!api) return;
    const minutes = Number(grace);
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 720) {
      setMessage({ type: 'error', text: 'Grace period must be 15 to 720 minutes.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      apply(await api.setReminderSettings(enabled, minutes));
      setMessage({ type: 'ok', text: enabled ? 'Reminders are on.' : 'Reminders are off.' });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'unauthorized')) setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Not saved.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
        <BellRing className="w-4 h-4 text-amber-400" aria-hidden="true" />
        Shift reminders (email)
      </h4>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        When a rostered shift has ended and nobody has logged it after the grace period, the rostered person gets one email.
        Email addresses come from the Email column of the Employees tab.
      </p>

      {settings && !settings.triggerInstalled && (
        <p className="text-[11px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          The hourly job isn't installed yet. In the Apps Script editor, run <code>installTriggers</code> once.
        </p>
      )}

      <label className="min-h-11 flex items-center gap-3 text-sm font-bold text-white cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-5 h-5 accent-emerald-500" />
        Send reminder emails
      </label>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="reminder-grace" className="block text-[11px] font-bold text-slate-400 mb-1">Grace period after the shift ends (minutes)</label>
          <input id="reminder-grace" type="number" min={15} max={720} value={grace} onChange={(e) => setGrace(e.target.value)}
            className="w-full min-h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-white font-bold text-sm focus:outline-none focus:border-emerald-500" />
        </div>
        <button type="button" onClick={() => void save()} disabled={busy || !api} className="min-h-11 px-4 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black disabled:opacity-50 flex items-center gap-1.5">
          {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Save
        </button>
      </div>

      {settings && settings.missingEmail.length > 0 && (
        <p className="text-[11px] text-amber-200">
          No email address for: {settings.missingEmail.join(', ')}. They won't get reminders until one is added in the Employees tab.
        </p>
      )}
      {message && (
        <p role={message.type === 'error' ? 'alert' : 'status'} className={`text-xs font-bold ${message.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{message.text}</p>
      )}
    </div>
  );
};
