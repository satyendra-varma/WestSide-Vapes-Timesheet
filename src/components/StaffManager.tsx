import React, { useState } from 'react';
import { KeyRound, Lock, RefreshCw, ShieldCheck, Unlock, UserCheck, UserX } from 'lucide-react';
import { ApiError } from '../api/client';
import { EmployeeInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useEmployees } from '../data/hooks';

/** Manager-only: PINs, lockouts and the active flag for everyone in the Employees tab. */
export const StaffManager: React.FC = () => {
  const { api, user } = useAuth();
  const employees = useEmployees();
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (!api) return;
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'ok', text: success });
      await employees.reload();
      return true;
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'unauthorized')) {
        setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' });
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  const savePin = async (name: string) => {
    if (!/^\d{6}$/.test(newPin)) {
      setMessage({ type: 'error', text: 'PIN must be exactly 6 digits.' });
      return;
    }
    const ok = await run(`pin:${name}`, () => api!.setPin(name, newPin), `PIN set for ${name}. Tell them in person; any open sessions were logged out.`);
    if (ok) {
      setPinFor(null);
      setNewPin('');
    }
  };

  const now = Date.now();
  const rows: EmployeeInfo[] = employees.data ?? [];

  return (
    <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          Staff & PINs
        </h4>
        <button type="button" onClick={() => void employees.reload()} className="w-11 h-11 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center" aria-label="Refresh staff list">
          <RefreshCw className={`w-4 h-4 ${employees.loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Add or rename people in the Employees tab of the sheet. PINs are stored only as hashes on the server. Nobody, including you, can see a PIN after it's set.
      </p>

      {message && (
        <p role={message.type === 'error' ? 'alert' : 'status'} className={`text-xs font-bold rounded-xl px-3 py-2 border ${
          message.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
        }`}>
          {message.text}
        </p>
      )}
      {employees.error && <p role="alert" className="text-xs font-bold text-rose-300">{employees.error.message}</p>}

      <ul className="divide-y divide-slate-800/80">
        {rows.map((e) => {
          const locked = (e.lockedUntil ?? 0) > now;
          const isSelf = e.name === user?.name;
          return (
            <li key={e.name} className="py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`font-bold text-sm truncate ${e.active ? 'text-white' : 'text-slate-500 line-through'}`}>{e.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {e.role === 'manager' ? 'Manager' : 'Staff'}
                    {' · '}{e.active ? 'Active' : 'Inactive'}
                    {' · '}{e.hasPin ? 'PIN set' : <span className="text-amber-300 font-bold">No PIN yet</span>}
                    {locked && <span className="text-rose-300 font-bold"> · Locked</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {locked && (
                    <button type="button" disabled={!!busy} onClick={() => void run(`unlock:${e.name}`, () => api!.unlockEmployee(e.name), `${e.name} is unlocked.`)}
                      className="w-11 h-11 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center" aria-label={`Unlock ${e.name}`}>
                      <Unlock className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" disabled={!!busy} onClick={() => { setPinFor(pinFor === e.name ? null : e.name); setNewPin(''); setMessage(null); }}
                    className="w-11 h-11 rounded-lg bg-slate-800 text-cyan-300 flex items-center justify-center" aria-label={`${e.hasPin ? 'Reset' : 'Set'} PIN for ${e.name}`}>
                    <KeyRound className="w-4 h-4" />
                  </button>
                  {!isSelf && (
                    <button type="button" disabled={!!busy}
                      onClick={() => {
                        if (e.active && !confirm(`Deactivate ${e.name}? They will be logged out immediately and can't log in or be rostered.`)) return;
                        void run(`active:${e.name}`, () => api!.setEmployeeActive(e.name, !e.active), `${e.name} is now ${e.active ? 'inactive' : 'active'}.`);
                      }}
                      className={`w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center ${e.active ? 'text-rose-300' : 'text-emerald-300'}`}
                      aria-label={e.active ? `Deactivate ${e.name}` : `Reactivate ${e.name}`}>
                      {e.active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {pinFor === e.name && (
                <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); void savePin(e.name); }}>
                  <label htmlFor={`pin-${e.name}`} className="sr-only">New 6-digit PIN for {e.name}</label>
                  <div className="relative flex-1">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    <input
                      id={`pin-${e.name}`}
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      value={newPin}
                      onChange={(ev) => setNewPin(ev.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="New 6-digit PIN"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white font-bold tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <button type="submit" disabled={busy === `pin:${e.name}`} className="min-h-11 px-4 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs disabled:opacity-50">
                    {busy === `pin:${e.name}` ? 'Saving…' : 'Save PIN'}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
