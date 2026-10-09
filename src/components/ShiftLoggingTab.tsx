import React, { useState } from 'react';
import { Clock, Sun, Moon, CheckCircle, RefreshCw, AlertCircle, User } from 'lucide-react';
import { SHOP_INFO, getTodayDateString } from '../config';
import { ApiError } from '../api/client';
import { ShiftSlot, ShiftType } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useEmployees, timesheetKey } from '../data/hooks';
import { invalidateCache } from '../data/store';
import { ConflictModal } from './ConflictModal';
import { PendingShifts } from './PendingShifts';
import { enqueueShift } from '../offline/shiftQueue';
import { LONG_SHIFT_MINUTES, formatDecimalHours, formatDuration, isOvernight, shiftMinutes } from '../utils/hours';

type Toast = { type: 'success' | 'error' | 'queued'; text: string };

interface ShiftLoggingTabProps {
  /** Sends shifts saved on this device while offline. */
  onSendQueued: () => Promise<void>;
}

export const ShiftLoggingTab: React.FC<ShiftLoggingTabProps> = ({ onSendQueued }) => {
  const { user, isManager, api } = useAuth();
  const todayStr = getTodayDateString();
  const employees = useEmployees();

  // Staff always log for themselves; a manager picks the employee (blank until chosen).
  const [chosenEmployee, setChosenEmployee] = useState<string>('');
  const employeeName = isManager ? chosenEmployee : user?.name ?? '';
  const [shiftDate, setShiftDate] = useState<string>(todayStr);
  const [shiftType, setShiftType] = useState<ShiftType>('Morning');
  const [inTime, setInTime] = useState<string>(SHOP_INFO.morningShift.defaultIn);
  const [outTime, setOutTime] = useState<string>(SHOP_INFO.morningShift.defaultOut);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<Toast | null>(null);
  const [previousSlot, setPreviousSlot] = useState<ShiftSlot | null>(null);

  const activeNames = (employees.data ?? []).filter((e) => e.active).map((e) => e.name);

  const handleShiftToggle = (type: ShiftType) => {
    setShiftType(type);
    const defaults = type === 'Morning' ? SHOP_INFO.morningShift : SHOP_INFO.eveningShift;
    setInTime(defaults.defaultIn);
    setOutTime(defaults.defaultOut);
  };

  const minutes = shiftMinutes(inTime, outTime);
  const durationWarning = isOvernight(inTime, outTime)
    ? 'Out time is before in time, so this counts as a shift past midnight. Double-check the times.'
    : minutes > LONG_SHIFT_MINUTES
      ? 'This shift is over 12 hours. Double-check the times.'
      : null;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val > todayStr) {
      setShiftDate(todayStr);
      setToastMessage({ type: 'error', text: 'Future dates are disabled. Date reset to today.' });
    } else {
      setShiftDate(val);
    }
  };

  const submit = async (forceOverwrite: boolean) => {
    if (!api) return; // session expired: the re-login prompt is showing and the form is kept
    if (!employeeName) {
      setToastMessage({ type: 'error', text: 'Please select an employee name.' });
      return;
    }
    if (minutes === 0) {
      setToastMessage({ type: 'error', text: 'Shift length is 0. Check the in and out times.' });
      return;
    }
    setSubmitting(true);
    setToastMessage(null);
    try {
      await api.saveShift({ date: shiftDate, shift: shiftType, name: employeeName, inTime, outTime, forceOverwrite });
      setPreviousSlot(null);
      invalidateCache(timesheetKey(`${shiftDate.slice(5, 7)}-${shiftDate.slice(0, 4)}`));
      setToastMessage({ type: 'success', text: `Saved: ${employeeName}, ${shiftType} ${shiftDate}, ${formatDuration(minutes)}.` });
      if (isManager) setChosenEmployee('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conflict' && err.details.previousData) {
        setPreviousSlot(err.details.previousData);
      } else if (!forceOverwrite && user && err instanceof ApiError && (err.code === 'network' || err.code === 'busy')) {
        // No connection (or server busy): keep the shift on this device and send it later.
        setPreviousSlot(null);
        try {
          enqueueShift(user.name, { date: shiftDate, shift: shiftType, name: employeeName, inTime, outTime });
          setToastMessage({
            type: 'queued',
            text: `${err.code === 'network' ? 'No connection.' : 'The server is busy.'} This shift is saved on this device and will be sent automatically. Don't log out until it's sent.`,
          });
          if (isManager) setChosenEmployee('');
        } catch (queueErr) {
          setToastMessage({ type: 'error', text: `Not saved. ${queueErr instanceof Error ? queueErr.message : 'Please try again.'}` });
        }
      } else {
        setPreviousSlot(null);
        if (!(err instanceof ApiError && err.code === 'unauthorized')) {
          setToastMessage({ type: 'error', text: `Not saved. ${err instanceof ApiError ? err.message : 'Please try again.'}` });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="tab-logging-container" className="space-y-5 animate-in fade-in duration-300">

      {toastMessage && (
        <div
          id="toast-notification"
          role={toastMessage.type === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 shadow-lg ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              : toastMessage.type === 'queued'
                ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
          }`}
        >
          {toastMessage.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{toastMessage.text}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="min-w-11 min-h-11 -my-3 -mr-2 text-current opacity-70" aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      <PendingShifts onSendNow={onSendQueued} />

      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-6 shadow-2xl shadow-slate-950">

        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-white">Log Work Shift</h2>
              <p className="text-xs text-slate-400">Record hours for {SHOP_INFO.name}</p>
            </div>
          </div>
          <span className="text-[11px] font-black px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/80">
            {shiftDate === todayStr ? 'Today' : 'Past Update'}
          </span>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-5">

          {/* 1. Employee */}
          <div className="space-y-2">
            <label htmlFor="employee-select-input" className="block text-xs font-black uppercase tracking-wider text-slate-400">
              Employee Name <span className="text-emerald-400">*</span>
            </label>
            {isManager ? (
              <div className="relative">
                <select
                  id="employee-select-input"
                  required
                  value={chosenEmployee}
                  onChange={(e) => setChosenEmployee(e.target.value)}
                  disabled={submitting || employees.loading}
                  className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-4 text-white font-bold text-base appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">
                    {employees.loading ? 'Fetching staff list…' : 'Select employee'}
                  </option>
                  {activeNames.map((emp) => (
                    <option key={emp} value={emp} className="bg-slate-900 text-white">{emp}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" aria-hidden="true">
                  {employees.loading ? <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" /> : <span className="text-xs">▼</span>}
                </div>
              </div>
            ) : (
              <p id="employee-select-input" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl px-4 py-4 text-white font-bold text-base flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                {employeeName}
              </p>
            )}
            {employees.error && isManager && (
              <p role="alert" className="text-[11px] font-bold text-rose-300">
                Couldn't load the staff list. {employees.error.message}{' '}
                <button type="button" onClick={() => void employees.reload()} className="underline min-h-11">Retry</button>
              </p>
            )}
          </div>

          {/* 2. Date */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="shift-date-input" className="block text-xs font-black uppercase tracking-wider text-slate-400">
                Shift Date <span className="text-emerald-400">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">Max: Today</span>
            </div>
            <input
              type="date"
              id="shift-date-input"
              required
              max={todayStr}
              value={shiftDate}
              onChange={handleDateChange}
              disabled={submitting}
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-3.5 text-white font-bold text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* 3. Shift type */}
          <fieldset className="space-y-2">
            <legend className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
              Shift Type <span className="text-emerald-400">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {(['Morning', 'Evening'] as const).map((type) => {
                const selected = shiftType === type;
                const Icon = type === 'Morning' ? Sun : Moon;
                const color = type === 'Morning' ? 'emerald' : 'cyan';
                return (
                  <button
                    key={type}
                    type="button"
                    id={`shift-btn-${type.toLowerCase()}`}
                    aria-pressed={selected}
                    onClick={() => handleShiftToggle(type)}
                    className={`py-4 px-4 rounded-2xl border-2 font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all active:scale-95 ${
                      selected
                        ? color === 'emerald'
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                          : 'border-cyan-500 bg-cyan-500/15 text-cyan-400'
                        : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    <span>{type} Shift</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* 4. Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="in-time-input" className="block text-xs font-black uppercase tracking-wider text-slate-400">In Time</label>
              <input
                type="time"
                id="in-time-input"
                required
                value={inTime}
                onChange={(e) => setInTime(e.target.value)}
                disabled={submitting}
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-3.5 text-white font-bold text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="out-time-input" className="block text-xs font-black uppercase tracking-wider text-slate-400">Out Time</label>
              <input
                type="time"
                id="out-time-input"
                required
                value={outTime}
                onChange={(e) => setOutTime(e.target.value)}
                disabled={submitting}
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-3.5 text-white font-bold text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs" aria-live="polite">
              <span className="text-slate-400 font-medium">Calculated Duration:</span>
              <span className="font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl">
                {formatDuration(minutes)}
                <span className="text-emerald-400/70 font-bold"> · {formatDecimalHours(minutes)} h</span>
              </span>
            </div>
            {durationWarning && (
              <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {durationWarning}
              </p>
            )}
          </div>

          <button
            type="submit"
            id="submit-shift-btn"
            disabled={submitting || !api}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-base tracking-wide flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/60 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /><span>Saving…</span></>
            ) : (
              <><CheckCircle className="w-5 h-5" /><span>Submit Shift Log</span></>
            )}
          </button>
        </form>
      </div>

      <ConflictModal
        isOpen={!!previousSlot}
        previousRecord={previousSlot}
        newSubmission={{ employeeName, date: shiftDate, shift: shiftType, inTime, outTime }}
        canOverwrite={isManager || (!!previousSlot && previousSlot.name.toLowerCase() === (user?.name ?? '').toLowerCase())}
        onCancel={() => setPreviousSlot(null)}
        onConfirmOverwrite={() => void submit(true)}
        isSubmitting={submitting}
      />
    </section>
  );
};
