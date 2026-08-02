import React, { useState, useEffect } from 'react';
import { Calendar, Search, Filter, Clock, Edit2, Trash2, Check, X, RefreshCw, User, Sun, Moon } from 'lucide-react';
import { fetchTimesheet, updateShiftApi, deleteShiftApi, getCachedTimesheet } from '../services/api';
import { ShiftRecord } from '../types';
import { calculateShiftHours } from '../config';

interface MonthlyTimesheetTabProps {
  refreshTrigger: number;
}

export const MonthlyTimesheetTab: React.FC<MonthlyTimesheetTabProps> = ({ refreshTrigger }) => {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [filterEmployee, setFilterEmployee] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [records, setRecords] = useState<ShiftRecord[]>(() => {
    const [year, month] = currentMonthStr.split('-').map(Number);
    return getCachedTimesheet(month, year);
  });
  const [loading, setLoading] = useState<boolean>(false);

  // Edit Modal State
  const [editingRecord, setEditingRecord] = useState<ShiftRecord | null>(null);
  const [editInTime, setEditInTime] = useState<string>('');
  const [editOutTime, setEditOutTime] = useState<string>('');
  const [editEmployee, setEditEmployee] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadMonthlyData();
    const handleRefreshed = () => {
      const [year, month] = selectedMonth.split('-').map(Number);
      setRecords(getCachedTimesheet(month, year));
    };
    window.addEventListener('westside_vapes_data_refreshed', handleRefreshed);
    return () => window.removeEventListener('westside_vapes_data_refreshed', handleRefreshed);
  }, [selectedMonth, refreshTrigger]);

  const loadMonthlyData = async () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const cached = getCachedTimesheet(month, year);
    setRecords(cached);

    if (cached.length === 0) {
      setLoading(true);
    }

    try {
      const res = await fetchTimesheet(month, year);
      setRecords(res.records);
    } catch (err) {
      console.error('Failed to load monthly sheet:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered dataset
  const filteredRecords = records.filter((r) => {
    const matchesEmp = filterEmployee === 'ALL' || r.employeeName === filterEmployee;
    const matchesSearch =
      r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.date.includes(searchQuery) ||
      r.shift.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesEmp && matchesSearch;
  });

  // Calculate stats
  const totalHours = filteredRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);
  const morningShifts = filteredRecords.filter((r) => r.shift === 'Morning').length;
  const eveningShifts = filteredRecords.filter((r) => r.shift === 'Evening').length;
  const uniqueEmployees = new Set(records.map((r) => r.employeeName)).size;

  // Open Edit Modal
  const openEditModal = (r: ShiftRecord) => {
    setEditingRecord(r);
    setEditInTime(r.inTime);
    setEditOutTime(r.outTime);
    setEditEmployee(r.employeeName);
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsUpdating(true);
    const updated: ShiftRecord = {
      ...editingRecord,
      employeeName: editEmployee,
      inTime: editInTime,
      outTime: editOutTime,
      totalHours: calculateShiftHours(editInTime, editOutTime),
    };

    try {
      await updateShiftApi(updated);
      setEditingRecord(null);
      loadMonthlyData();
    } catch (err) {
      console.error('Failed to update shift:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Shift
  const handleDeleteShift = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shift entry?')) return;
    setDeletingId(id);
    try {
      const record = records.find(r => r.id === id);
      await deleteShiftApi(id, record);
      loadMonthlyData();
    } catch (err) {
      console.error('Failed to delete shift:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section id="tab-monthly-container" className="space-y-5 animate-in fade-in duration-300">
      
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
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-950 border-2 border-slate-800 text-cyan-400 font-extrabold text-xs rounded-xl px-3 py-2 focus:border-cyan-500 focus:outline-none"
          />
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
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3 text-center">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Total Hours</span>
            <span className="text-base font-black text-emerald-400 mt-0.5 block">{totalHours.toFixed(1)}h</span>
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

      {/* Record List */}
      <div className="space-y-3">
        {loading ? (
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
          filteredRecords.map((record) => (
            <div
              key={record.id}
              id={`timesheet-record-${record.id}`}
              className="bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg transition-all"
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
                    {record.inTime} - {record.outTime}
                  </span>
                </div>
              </div>

              {/* Right Stats & Actions */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-slate-950 text-emerald-400 border border-slate-800">
                  {record.totalHours} hrs
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(record)}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all active:scale-95"
                    title="Edit shift"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteShift(record.id)}
                    disabled={deletingId === record.id}
                    className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                    title="Delete shift"
                  >
                    {deletingId === record.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Inline Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-cyan-400" />
                Edit Past Shift Log
              </h3>
              <button
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Employee Name</label>
                <input
                  type="text"
                  value={editEmployee}
                  onChange={(e) => setEditEmployee(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">In Time</label>
                  <input
                    type="time"
                    value={editInTime}
                    onChange={(e) => setEditInTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Out Time</label>
                  <input
                    type="time"
                    value={editOutTime}
                    onChange={(e) => setEditOutTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingRecord(null)}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isUpdating}
                className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg"
              >
                {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
