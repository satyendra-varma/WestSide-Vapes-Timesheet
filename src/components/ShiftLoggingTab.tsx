import React, { useState, useEffect } from 'react';
import { Clock, Sun, Moon, CheckCircle, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import { SHOP_INFO, getTodayDateString, calculateShiftHours } from '../config';
import { fetchEmployees, submitShiftApi, getCachedEmployees } from '../services/api';
import { ShiftRecord } from '../types';
import { ConflictModal } from './ConflictModal';

interface ShiftLoggingTabProps {
  onShiftSubmittedSuccess: () => void;
}

export const ShiftLoggingTab: React.FC<ShiftLoggingTabProps> = ({ onShiftSubmittedSuccess }) => {
  const todayStr = getTodayDateString();

  const cachedList = getCachedEmployees();

  // Form states
  const [employees, setEmployees] = useState<string[]>(cachedList);
  const [loadingEmp, setLoadingEmp] = useState<boolean>(cachedList.length === 0);
  const [selectedEmployee, setSelectedEmployee] = useState<string>(cachedList[0] || '');
  const [shiftDate, setShiftDate] = useState<string>(todayStr);
  const [shiftType, setShiftType] = useState<'Morning' | 'Evening'>('Morning');
  const [inTime, setInTime] = useState<string>(SHOP_INFO.morningShift.defaultIn);
  const [outTime, setOutTime] = useState<string>(SHOP_INFO.morningShift.defaultOut);

  // Status & Feedback states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Overwrite Conflict State
  const [conflictOpen, setConflictOpen] = useState<boolean>(false);
  const [previousRecord, setPreviousRecord] = useState<ShiftRecord | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<{
    employeeName: string;
    date: string;
    shift: 'Morning' | 'Evening';
    inTime: string;
    outTime: string;
    totalHours: number;
  } | null>(null);

  // Load employees on mount
  useEffect(() => {
    loadStaffList();
    const handleRefreshed = () => {
      const fresh = getCachedEmployees();
      setEmployees(fresh);
      if (fresh.length > 0 && !selectedEmployee) {
        setSelectedEmployee(fresh[0]);
      }
    };
    window.addEventListener('westside_vapes_data_refreshed', handleRefreshed);
    return () => window.removeEventListener('westside_vapes_data_refreshed', handleRefreshed);
  }, []);

  const loadStaffList = async () => {
    if (employees.length === 0) setLoadingEmp(true);
    try {
      const res = await fetchEmployees();
      setEmployees(res.employees);
      if (res.employees.length > 0 && !selectedEmployee) {
        setSelectedEmployee(res.employees[0]);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoadingEmp(false);
    }
  };

  // Toggle shift type
  const handleShiftToggle = (type: 'Morning' | 'Evening') => {
    setShiftType(type);
    if (type === 'Morning') {
      setInTime(SHOP_INFO.morningShift.defaultIn);
      setOutTime(SHOP_INFO.morningShift.defaultOut);
    } else {
      setInTime(SHOP_INFO.eveningShift.defaultIn);
      setOutTime(SHOP_INFO.eveningShift.defaultOut);
    }
  };

  // Calculate live shift hours
  const totalHours = calculateShiftHours(inTime, outTime);

  // Date change handler with strict future blocking
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val > todayStr) {
      setShiftDate(todayStr);
      setToastMessage({
        type: 'error',
        text: 'Future dates are disabled. Date reset to today.',
      });
      setTimeout(() => setToastMessage(null), 3000);
    } else {
      setShiftDate(val);
    }
  };

  // Submit Shift
  const handleSubmit = async (e: React.FormEvent, forceOverwrite = false) => {
    if (e) e.preventDefault();

    if (!selectedEmployee) {
      setToastMessage({ type: 'error', text: 'Please select an employee name.' });
      return;
    }

    setSubmitting(true);
    setToastMessage(null);

    const payload = {
      employeeName: selectedEmployee,
      date: shiftDate,
      shift: shiftType,
      inTime,
      outTime,
      forceOverwrite,
    };

    try {
      const result = await submitShiftApi(payload);

      if (result.hasConflict && result.previousRecord) {
        setPreviousRecord(result.previousRecord);
        setPendingSubmission({
          employeeName: selectedEmployee,
          date: shiftDate,
          shift: shiftType,
          inTime,
          outTime,
          totalHours,
        });
        setConflictOpen(true);
        setSubmitting(false);
        return;
      }

      if (result.success) {
        setConflictOpen(false);
        setToastMessage({
          type: 'success',
          text: result.message || 'Shift logged successfully!',
        });
        setTimeout(() => setToastMessage(null), 4000);
        onShiftSubmittedSuccess();
      } else {
        setToastMessage({
          type: 'error',
          text: result.message || 'Failed to submit shift log.',
        });
      }
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err.message || 'Error communicating with server.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Overwrite
  const handleConfirmOverwrite = () => {
    handleSubmit(null as any, true);
  };

  return (
    <section id="tab-logging-container" className="space-y-5 animate-in fade-in duration-300">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="toast-notification"
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 transition-all shadow-lg ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-rose-950/40'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-6 shadow-2xl shadow-slate-950">
        
        {/* Title */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-white">Log Work Shift</h2>
              <p className="text-xs text-slate-400">Record employee hours for WestSide Vapes</p>
            </div>
          </div>
          <span className="text-[11px] font-black px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700/80">
            {shiftDate === todayStr ? 'Today' : 'Past Update'}
          </span>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
          
          {/* 1. Employee Dropdown */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
              Employee Name <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <select
                id="employee-select-input"
                required
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                disabled={loadingEmp || submitting}
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-4 text-white font-bold text-base transition-all appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                {loadingEmp ? (
                  <option value="">Fetching staff list...</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp} value={emp} className="bg-slate-900 text-white">
                      {emp}
                    </option>
                  ))
                )}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                {loadingEmp ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                ) : (
                  <span className="text-xs">▼</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Date Picker (Strict future max) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
                Shift Date <span className="text-emerald-400">*</span>
              </label>
              <span className="text-[10px] text-slate-500 font-semibold">Max: Today</span>
            </div>
            <input
              type="date"
              id="shift-date-input"
              required
              max={todayStr}
              value={shiftDate}
              onChange={handleDateChange}
              disabled={submitting}
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-3.5 text-white font-bold text-base transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* 3. Shift Selector Buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
              Shift Type <span className="text-emerald-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="shift-btn-morning"
                onClick={() => handleShiftToggle('Morning')}
                className={`py-4 px-4 rounded-2xl border-2 font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all active:scale-95 ${
                  shiftType === 'Morning'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-lg shadow-emerald-950/50'
                    : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sun className={`w-4 h-4 ${shiftType === 'Morning' ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>Morning Shift</span>
              </button>

              <button
                type="button"
                id="shift-btn-evening"
                onClick={() => handleShiftToggle('Evening')}
                className={`py-4 px-4 rounded-2xl border-2 font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all active:scale-95 ${
                  shiftType === 'Evening'
                    ? 'border-cyan-500 bg-cyan-500/15 text-cyan-400 shadow-lg shadow-cyan-950/50'
                    : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Moon className={`w-4 h-4 ${shiftType === 'Evening' ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>Evening Shift</span>
              </button>
            </div>
          </div>

          {/* 4. Time Pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
                In Time
              </label>
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
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
                Out Time
              </label>
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

          {/* Shift Duration Pill */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Calculated Duration:</span>
            <span className="font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl">
              {totalHours} Hours
            </span>
          </div>

          {/* 5. Submit Button */}
          <button
            type="submit"
            id="submit-shift-btn"
            disabled={submitting || loadingEmp}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-base tracking-wide flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/60 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Checking & Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Submit Shift Log</span>
              </>
            )}
          </button>

        </form>
      </div>

      {/* Conflict Modal */}
      <ConflictModal
        isOpen={conflictOpen}
        previousRecord={previousRecord}
        newSubmission={pendingSubmission}
        onCancel={() => setConflictOpen(false)}
        onConfirmOverwrite={handleConfirmOverwrite}
        isSubmitting={submitting}
      />

    </section>
  );
};
