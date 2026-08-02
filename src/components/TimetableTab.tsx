import React, { useState, useEffect } from 'react';
import { Users, Sun, Moon, Edit3, RefreshCw, Check, X, Sparkles } from 'lucide-react';
import { fetchTimetable, updateTimetableLocal, fetchEmployees, getCachedTimetable, getCachedEmployees } from '../services/api';
import { DaySchedule } from '../types';

export const TimetableTab: React.FC = () => {
  const [timetable, setTimetable] = useState<DaySchedule[]>(() => getCachedTimetable());
  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [employees, setEmployees] = useState<string[]>(() => getCachedEmployees());

  // Edit Roster Modal
  const [editingDay, setEditingDay] = useState<DaySchedule | null>(null);
  const [editMorningEmp, setEditMorningEmp] = useState<string>('');
  const [editEveningEmp, setEditEveningEmp] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Determine current day of week (e.g. 'Sunday', 'Monday')
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = daysOfWeek[new Date().getDay()];

  useEffect(() => {
    loadRoster();
    loadStaffList();
    const handleRefreshed = () => {
      setTimetable(getCachedTimetable());
      setEmployees(getCachedEmployees());
    };
    window.addEventListener('westside_vapes_data_refreshed', handleRefreshed);
    return () => window.removeEventListener('westside_vapes_data_refreshed', handleRefreshed);
  }, []);

  const loadStaffList = async () => {
    try {
      const res = await fetchEmployees();
      setEmployees(res.employees);
    } catch (e) {
      console.error('Failed to load employee list for roster edit:', e);
    }
  };

  const loadRoster = async () => {
    const cached = getCachedTimetable();
    setTimetable(cached);

    setIsRefreshing(true);
    try {
      const res = await fetchTimetable();
      setTimetable(res.timetable);
    } catch (err) {
      console.error('Failed to fetch timetable:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const openDayEdit = (day: DaySchedule) => {
    setEditingDay(day);
    setEditMorningEmp(day.morning[0]?.employeeName || '');
    setEditEveningEmp(day.evening[0]?.employeeName || '');
  };

  const handleSaveRoster = async () => {
    if (!editingDay) return;
    setSaving(true);
    const updatedTimetable = timetable.map((d) => {
      if (d.dayName === editingDay.dayName) {
        return {
          ...d,
          morning: [{ employeeName: editMorningEmp }],
          evening: [{ employeeName: editEveningEmp }],
        };
      }
      return d;
    });

    try {
      await updateTimetableLocal(updatedTimetable);
      setTimetable(updatedTimetable);
      setEditingDay(null);
    } catch (err) {
      console.error('Failed to save roster update:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="tab-timetable-container" className="space-y-5 animate-in fade-in duration-300">
      
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-950">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-black text-base text-white">Weekly Schedule Roster</h2>
            <p className="text-xs text-slate-400">Sunday through Saturday Shift Allocations</p>
          </div>
        </div>

        <button
          onClick={loadRoster}
          disabled={loading || isRefreshing}
          className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all active:scale-95"
          title="Refresh Schedule"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing || loading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {/* Roster Cards (Rows: Sunday - Saturday; Columns: Morning & Evening) */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <p className="text-xs font-semibold">Fetching weekly roster from server...</p>
          </div>
        ) : (
          timetable.map((day) => {
            const isToday = day.dayName === todayDayName;
            const morningEmp = day.morning[0]?.employeeName || 'Unassigned';
            const eveningEmp = day.evening[0]?.employeeName || 'Unassigned';

            return (
              <div
                key={day.dayName}
                id={`roster-day-${day.dayName.toLowerCase()}`}
                className={`bg-slate-900/90 border rounded-2xl p-4 space-y-3 transition-all shadow-lg ${
                  isToday
                    ? 'border-emerald-500/60 shadow-emerald-950/40 bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white">{day.dayName}</span>
                    {isToday && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-400" /> Today
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => openDayEdit(day)}
                    className="text-xs font-extrabold text-slate-400 hover:text-emerald-400 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 transition-colors"
                  >
                    <Edit3 className="w-3 h-3" /> Edit Day
                  </button>
                </div>

                {/* Shifts Grid (2 Columns: Morning & Evening) */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Morning Shift Column */}
                  <div className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider">
                      <Sun className="w-3.5 h-3.5" />
                      Morning (09:00 - 15:30)
                    </div>
                    <p className="font-black text-white text-sm tracking-tight truncate">
                      {morningEmp}
                    </p>
                  </div>

                  {/* Evening Shift Column */}
                  <div className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-cyan-400 font-extrabold text-[10px] uppercase tracking-wider">
                      <Moon className="w-3.5 h-3.5" />
                      Evening (15:30 - 22:00)
                    </div>
                    <p className="font-black text-white text-sm tracking-tight truncate">
                      {eveningEmp}
                    </p>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Edit Day Roster Modal */}
      {editingDay && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" />
                Reassign Roster - {editingDay.dayName}
              </h3>
              <button onClick={() => setEditingDay(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Morning Employee */}
              <div>
                <label className="block text-xs font-bold uppercase text-emerald-400 mb-1.5">
                  Morning Shift Staff
                </label>
                <select
                  value={editMorningEmp}
                  onChange={(e) => setEditMorningEmp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Unassigned --</option>
                  {employees.map((emp) => (
                    <option key={emp} value={emp}>
                      {emp}
                    </option>
                  ))}
                </select>
              </div>

              {/* Evening Employee */}
              <div>
                <label className="block text-xs font-bold uppercase text-cyan-400 mb-1.5">
                  Evening Shift Staff
                </label>
                <select
                  value={editEveningEmp}
                  onChange={(e) => setEditEveningEmp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Unassigned --</option>
                  {employees.map((emp) => (
                    <option key={emp} value={emp}>
                      {emp}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingDay(null)}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoster}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Roster
              </button>
            </div>

          </div>
        </div>
      )}

    </section>
  );
};
