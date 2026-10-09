import React, { useState } from 'react';
import { Calendar, Search, Filter, Clock, Edit2, Trash2, Check, RefreshCw, Users, Copy, AlertTriangle, WifiOff, Download } from 'lucide-react';
import { ShiftRecord } from '../types';
import { SHOP_INFO } from '../config';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { toMonthYear, useEmployees, useTimesheet } from '../data/hooks';
import { formatDecimalHours, formatDuration, needsReview, shiftMinutes, totalMinutes, totalsByEmployee } from '../utils/hours';
import { PayPeriod, daysInMonth as getDaysInMonth, periodDayRange, recordsInPeriod } from '../utils/periods';
import { Modal } from './Modal';
import { downloadCsv, shiftsCsv, summaryCsv } from '../utils/csv';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const MonthlyTimesheetTab: React.FC = () => {
  const { user, isManager, api } = useAuth();
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [period, setPeriod] = useState<PayPeriod>('full');
  const [filterEmployee, setFilterEmployee] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const timesheet = useTimesheet(toMonthYear(selectedMonth));
  const employees = useEmployees();
  const records: ShiftRecord[] = timesheet.data ?? [];

  // Edit Modal State
  const [editingRecord, setEditingRecord] = useState<ShiftRecord | null>(null);
  const [editInTime, setEditInTime] = useState<string>('');
  const [editOutTime, setEditOutTime] = useState<string>('');
  const [editEmployee, setEditEmployee] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEdit = (r: ShiftRecord) => isManager || (!!user && sameName(r.employeeName, user.name));

  // Pay period (semi-monthly: 1-15 and 16-end of month)
  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = getDaysInMonth(year, month);
  const [periodStart, periodEnd] = periodDayRange(year, month, period);
  const monthShort = new Date(year, month - 1, 1).toLocaleString('en-CA', { month: 'short' });
  const periodLabel = `${monthShort} ${periodStart}–${periodEnd}, ${year}`;
  const periodOptions: { id: PayPeriod; label: string }[] = [
    { id: 'full', label: 'Full month' },
    { id: 'first', label: '1–15' },
    { id: 'second', label: `16–${daysInMonth}` },
  ];

  const periodRecords = recordsInPeriod<ShiftRecord>(records, year, month, period);

  // Filtered dataset
  const filteredRecords = periodRecords
    .filter((r) => {
      const matchesEmp = filterEmployee === 'ALL' || r.employeeName === filterEmployee;
      const matchesSearch =
        r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.date.includes(searchQuery) ||
        r.shift.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesEmp && matchesSearch;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.shift === b.shift ? 0 : a.shift === 'Morning' ? -1 : 1));

  // Calculate stats. Everything is summed in whole minutes and only converted to
  // hours for display, so per-shift rounding can't add up into a wrong total.
  const filteredMinutes = totalMinutes(filteredRecords);
  const morningShifts = filteredRecords.filter((r) => r.shift === 'Morning').length;
  const eveningShifts = filteredRecords.filter((r) => r.shift === 'Evening').length;
  const uniqueEmployees = new Set(records.map((r) => r.employeeName)).size;

  const employeeTotals = totalsByEmployee(periodRecords);
  const periodMinutes = totalMinutes(periodRecords);
  const periodNeedsReview = employeeTotals.reduce((sum, t) => sum + t.needsReview, 0);

  const handleCopySummary = async () => {
    const lines = [
      `${SHOP_INFO.name} hours, ${periodLabel}`,
      ...employeeTotals.map(
        (t) =>
          `${t.employeeName}: ${formatDuration(t.minutes)} (${formatDecimalHours(t.minutes)} h), ` +
          `${t.shifts} shift${t.shifts === 1 ? '' : 's'}${t.needsReview ? `, ${t.needsReview} need review` : ''}`
      ),
      `Total: ${formatDuration(periodMinutes)} (${formatDecimalHours(periodMinutes)} h)`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy summary:', err);
    }
  };

  // Manager-only CSV export of the selected period (and employee filter, if any).
  const exportRecords = filterEmployee === 'ALL' ? periodRecords : periodRecords.filter((r) => r.employeeName === filterEmployee);
  const exportBase = `westside-hours-${toMonthYear(selectedMonth)}-${period === 'full' ? 'month' : period === 'first' ? '01-15' : `16-${daysInMonth}`}${
    filterEmployee === 'ALL' ? '' : `-${filterEmployee.replace(/[^A-Za-z0-9]+/g, '-')}`
  }`;
  const handleExportSummary = () => downloadCsv(`${exportBase}-summary.csv`, summaryCsv(totalsByEmployee(exportRecords), periodLabel));
  const handleExportShifts = () => downloadCsv(`${exportBase}-shifts.csv`, shiftsCsv(exportRecords));

  // Open Edit Modal
  const openEditModal = (r: ShiftRecord) => {
    setEditingRecord(r);
    setEditInTime(r.inTime);
    setEditOutTime(r.outTime);
    setEditEmployee(r.employeeName);
    setEditError(null);
  };

  const editMinutes = shiftMinutes(editInTime, editOutTime);
  const editEmployeeOptions = Array.from(new Set([
    ...(employees.data ?? []).filter((e) => e.active).map((e) => e.name),
    editEmployee,
  ].filter(Boolean)));

  const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
  const slotOf = (r: ShiftRecord) => ({ name: r.employeeName, inTime: r.inTime, outTime: r.outTime });
  const changedElsewhere = (err: ApiError) => {
    const now = err.details.previousData;
    const current = now && now.name ? `${now.name} ${now.inTime || '--:--'}-${now.outTime || '--:--'}` : 'empty';
    return `This shift was changed on another device (now: ${current}). The list has been refreshed; please check it and try again.`;
  };

  // Save Edit: the user is editing this exact slot, so the save replaces it (forceOverwrite).
  const handleSaveEdit = async () => {
    if (!editingRecord || !api) return;
    setIsUpdating(true);
    setEditError(null);
    try {
      await api.saveShift({
        date: editingRecord.date,
        shift: editingRecord.shift,
        name: editEmployee,
        inTime: editInTime,
        outTime: editOutTime,
        forceOverwrite: true,
        expectedPrevious: slotOf(editingRecord),
      });
      setEditingRecord(null);
      await timesheet.reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conflict') {
        setEditError(`Not saved. ${changedElsewhere(err)}`);
        await timesheet.reload();
      } else if (!(err instanceof ApiError && err.code === 'unauthorized')) {
        setEditError(`Not saved. ${errorText(err, 'Please try again.')}`);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Shift (manager only; the server enforces this too)
  const handleDeleteShift = async (record: ShiftRecord) => {
    if (!api) return;
    if (!confirm(`Delete ${record.employeeName}'s ${record.shift} shift on ${record.date}?`)) return;
    setDeletingId(record.id);
    setActionError(null);
    try {
      await api.deleteShift(record.date, record.shift, slotOf(record));
      await timesheet.reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conflict') {
        setActionError(`Not deleted. ${changedElsewhere(err)}`);
        await timesheet.reload();
      } else if (!(err instanceof ApiError && err.code === 'unauthorized')) {
        setActionError(`Not deleted. ${errorText(err, 'Please try again.')}`);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section id="tab-monthly-container" className="space-y-5 animate-in fade-in duration-300">

      {timesheet.error && (
        <div role="alert" className="p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 bg-amber-500/15 text-amber-300 border-amber-500/40">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn't load this month. {timesheet.error.message}</span>
          <button type="button" onClick={() => void timesheet.reload()} className="min-h-11 px-3 rounded-xl bg-slate-800 text-slate-200">Retry</button>
        </div>
      )}
      {actionError && (
        <p role="alert" className="p-3.5 rounded-2xl border text-xs font-bold bg-rose-500/15 text-rose-300 border-rose-500/40">{actionError}</p>
      )}

      {/* Month & Filter Controls */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-4 shadow-xl shadow-slate-950">

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-cyan-400" />
            </div>
            <h2 className="font-extrabold text-base text-white">Monthly Sheet</h2>
          </div>

          <input
            type="month"
            id="month-select-picker"
            value={selectedMonth}
            onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
            className="bg-slate-950 border-2 border-slate-800 text-cyan-400 font-extrabold text-xs rounded-xl px-3 py-2 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {/* Pay Period Selector */}
        <div id="pay-period-selector" className="grid grid-cols-3 gap-1 bg-slate-950 border border-slate-800/90 rounded-xl p-1">
          {periodOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              className={`py-2 rounded-lg text-xs font-extrabold border transition-all ${
                period === option.id
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Search & Filter bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search staff, date, shift..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800/90 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="relative">
            <Filter className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800/90 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white appearance-none focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Staff Members ({uniqueEmployees})</option>
              {Array.from(new Set(records.map((r) => r.employeeName))).map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Monthly Summary Cards */}
        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2.5 pt-1">
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Total Hours</span>
            <span className="text-base font-black text-emerald-400 mt-0.5 block whitespace-nowrap">{formatDuration(filteredMinutes)}</span>
            <span className="text-[10px] font-bold text-slate-500 block">{formatDecimalHours(filteredMinutes)} h</span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Morning</span>
            <span className="text-base font-black text-emerald-400 mt-0.5 block">{morningShifts}</span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Evening</span>
            <span className="text-base font-black text-cyan-400 mt-0.5 block">{eveningShifts}</span>
          </div>
        </div>

      </div>

      {/* Hours by Employee (pay period summary) */}
      <div id="employee-hours-summary" className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-3 shadow-xl shadow-slate-950">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Hours by Employee</h3>
              <p className="text-[11px] text-slate-400 font-medium">{periodLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopySummary}
            disabled={employeeTotals.length === 0}
            className="min-h-11 text-xs font-extrabold text-slate-300 hover:text-emerald-400 flex items-center gap-1.5 px-3 rounded-lg bg-slate-950 border border-slate-800 transition-colors disabled:opacity-40"
            aria-label="Copy this summary as text"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {employeeTotals.length === 0 ? (
          <p className="text-xs text-slate-400">No shifts in this period.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <caption className="sr-only">Hours by employee, {periodLabel}. Select a name to filter the shift list.</caption>
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <th scope="col" className="text-left font-extrabold py-2 px-1">Employee</th>
                  <th scope="col" className="text-right font-extrabold py-2 px-1">Shifts</th>
                  <th scope="col" className="text-right font-extrabold py-2 px-1">Hours</th>
                  <th scope="col" className="text-right font-extrabold py-2 px-1">Decimal</th>
                  <th scope="col" className="text-right font-extrabold py-2 px-1"><span aria-hidden="true">Review</span><span className="sr-only">Shifts needing review</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {employeeTotals.map((t) => {
                  const isActive = filterEmployee === t.employeeName;
                  return (
                    <tr key={t.employeeName} className={isActive ? 'bg-cyan-500/10' : ''}>
                      <th scope="row" className="text-left font-bold py-1 px-1 max-w-[9rem]">
                        <button
                          type="button"
                          onClick={() => setFilterEmployee(isActive ? 'ALL' : t.employeeName)}
                          aria-pressed={isActive}
                          className={`min-h-11 w-full text-left truncate ${isActive ? 'text-cyan-300' : 'text-white hover:text-cyan-300'}`}
                        >
                          {t.employeeName}
                        </button>
                      </th>
                      <td className="text-right text-slate-300 font-bold px-1">{t.shifts}</td>
                      <td className="text-right font-black text-emerald-400 px-1 whitespace-nowrap">{formatDuration(t.minutes)}</td>
                      <td className="text-right text-slate-400 font-bold px-1">{formatDecimalHours(t.minutes)}</td>
                      <td className={`text-right font-bold px-1 ${t.needsReview > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{t.needsReview}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700">
                  <th scope="row" className="text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-400 py-2 px-1">Total</th>
                  <td className="text-right text-slate-300 font-bold px-1">{employeeTotals.reduce((sum, t) => sum + t.shifts, 0)}</td>
                  <td className="text-right font-black text-white px-1 whitespace-nowrap">{formatDuration(periodMinutes)}</td>
                  <td className="text-right text-slate-300 font-bold px-1">{formatDecimalHours(periodMinutes)}</td>
                  <td className={`text-right font-bold px-1 ${periodNeedsReview > 0 ? 'text-amber-300' : 'text-slate-500'}`}>{periodNeedsReview}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {isManager && employeeTotals.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={handleExportSummary} className="min-h-11 rounded-xl bg-slate-950 border border-slate-800 text-xs font-extrabold text-slate-200 hover:text-emerald-400 flex items-center justify-center gap-1.5">
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Summary CSV
            </button>
            <button type="button" onClick={handleExportShifts} className="min-h-11 rounded-xl bg-slate-950 border border-slate-800 text-xs font-extrabold text-slate-200 hover:text-emerald-400 flex items-center justify-center gap-1.5">
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Shifts CSV
            </button>
          </div>
        )}

        {periodNeedsReview > 0 && (
          <p className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            {periodNeedsReview} shift{periodNeedsReview === 1 ? ' has' : 's have'} missing or zero-length times and {periodNeedsReview === 1 ? 'is' : 'are'} counted as 0 hours. Fix {periodNeedsReview === 1 ? 'it' : 'them'} before running payroll.
          </p>
        )}
      </div>

      {/* Record List */}
      <div className="space-y-3">
        {timesheet.loading && records.length === 0 ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <p className="text-xs font-semibold">Loading monthly timesheets...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-8 text-center text-slate-400 space-y-2">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-extrabold text-white">No Shift Records Found</p>
            <p className="text-xs text-slate-500">No entries match the selected month and filter criteria.</p>
          </div>
        ) : (
          filteredRecords.map((record) => {
            const minutes = shiftMinutes(record.inTime, record.outTime);
            const flagged = needsReview(record.inTime, record.outTime);
            return (
            <div
              key={record.id}
              id={`timesheet-record-${record.id}`}
              className={`bg-slate-900/90 border hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg transition-all ${
                flagged ? 'border-amber-500/40' : 'border-slate-800/90'
              }`}
            >
              {/* Left Info */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-white truncate">
                    {record.employeeName}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      record.shift === 'Morning'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    }`}
                  >
                    {record.shift}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {record.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {record.inTime || '--:--'} - {record.outTime || '--:--'}
                  </span>
                </div>
              </div>

              {/* Right Stats & Actions */}
              <div className="flex items-center gap-3 shrink-0">
                {flagged ? (
                  <span
                    className="text-xs font-black px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/40 flex items-center gap-1"
                    title="Missing or zero-length times, counted as 0 hours. Edit to fix."
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    0h
                  </span>
                ) : (
                  <span className="text-xs font-black px-3 py-1 rounded-xl bg-slate-950 text-emerald-400 border border-slate-800 text-right leading-tight">
                    {formatDuration(minutes)}
                    <span className="block text-[10px] font-bold text-slate-400">{formatDecimalHours(minutes)} h</span>
                  </span>
                )}

                <div className="flex items-center gap-1">
                  {canEdit(record) && (
                  <button
                    onClick={() => openEditModal(record)}
                    className="w-11 h-11 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all active:scale-95"
                    aria-label={`Edit ${record.employeeName}'s ${record.shift} shift on ${record.date}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  )}
                  {isManager && (
                  <button
                    onClick={() => void handleDeleteShift(record)}
                    disabled={deletingId === record.id}
                    className="w-11 h-11 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                    aria-label={`Delete ${record.employeeName}'s ${record.shift} shift on ${record.date}`}
                  >
                    {deletingId === record.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  )}
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Inline Edit Modal */}
      {editingRecord && (
        <Modal
          title={<><Edit2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />Edit Shift</>}
          onClose={() => setEditingRecord(null)}
          initialFocusId="edit-in-time"
        >
          <p className="text-xs text-slate-400 -mt-3">{editingRecord.date} · {editingRecord.shift} Shift</p>
          <div className="space-y-4">
            <div>
              <label htmlFor="edit-employee" className="block text-xs font-bold uppercase text-slate-400 mb-1">Employee Name</label>
              {isManager ? (
                <select
                  id="edit-employee"
                  value={editEmployee}
                  onChange={(e) => setEditEmployee(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500"
                >
                  {editEmployeeOptions.map((emp) => (
                    <option key={emp} value={emp}>{emp}</option>
                  ))}
                </select>
              ) : (
                <p id="edit-employee" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold">{editEmployee}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-in-time" className="block text-xs font-bold uppercase text-slate-400 mb-1">In Time</label>
                <input
                  id="edit-in-time"
                  type="time"
                  value={editInTime}
                  onChange={(e) => setEditInTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label htmlFor="edit-out-time" className="block text-xs font-bold uppercase text-slate-400 mb-1">Out Time</label>
                <input
                  id="edit-out-time"
                  type="time"
                  value={editOutTime}
                  onChange={(e) => setEditOutTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between text-xs" aria-live="polite">
              <span className="text-slate-400 font-medium">Duration:</span>
              <span className={`font-black ${editMinutes === 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                {editMinutes === 0 ? 'Check times' : `${formatDuration(editMinutes)} · ${formatDecimalHours(editMinutes)} h`}
              </span>
            </div>

            {editError && (
              <p role="alert" className="text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-xl px-3 py-2">
                {editError}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingRecord(null)}
              className="flex-1 min-h-12 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveEdit()}
              disabled={isUpdating || editMinutes === 0 || !editEmployee || !api}
              className="flex-1 min-h-12 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50"
            >
              {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </Modal>
      )}

    </section>
  );
};
