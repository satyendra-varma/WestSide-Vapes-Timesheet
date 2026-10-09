import React, { useState } from 'react';
import { Users, Sun, Moon, Edit3, RefreshCw, Check, Sparkles, WifiOff } from 'lucide-react';
import { RosterDay } from '../api/types';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { TIMETABLE_KEY, useEmployees, useTimetable } from '../data/hooks';
import { writeCache } from '../data/store';
import { SHOP_INFO } from '../config';
import { Modal } from './Modal';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const TimetableTab: React.FC = () => {
  const { isManager, api } = useAuth();
  const timetable = useTimetable();
  const employees = useEmployees();
  const days: RosterDay[] = timetable.data ?? DAYS.map((dayName) => ({ dayName, morning: '', evening: '' }));

  const [editingDay, setEditingDay] = useState<RosterDay | null>(null);
  const [editMorningEmp, setEditMorningEmp] = useState<string>('');
  const [editEveningEmp, setEditEveningEmp] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const todayDayName = DAYS[new Date().getDay()];
  const activeNames = (employees.data ?? []).filter((e) => e.active).map((e) => e.name);

  const openDayEdit = (day: RosterDay) => {
    setEditingDay(day);
    setSaveError(null);
    setEditMorningEmp(day.morning);
    setEditEveningEmp(day.evening);
  };

  const handleSaveRoster = async () => {
    if (!editingDay || !api) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateTimetable([{ dayName: editingDay.dayName, morning: editMorningEmp, evening: editEveningEmp }]);
      writeCache(TIMETABLE_KEY, updated);
      setEditingDay(null);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'unauthorized')) {
        setSaveError(`Roster not saved. ${err instanceof ApiError ? err.message : 'Please try again.'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const nameOptions = (current: string) => Array.from(new Set([...activeNames, current].filter(Boolean)));

  return (
    <section id="tab-timetable-container" className="space-y-5 animate-in fade-in duration-300">

      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 flex items-center justify-between shadow-xl shadow-slate-950">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-black text-base text-white">Weekly Schedule Roster</h2>
            <p className="text-xs text-slate-400">Sunday through Saturday Shift Allocations</p>
          </div>
        </div>

        <button
          onClick={() => void timetable.reload()}
          disabled={timetable.loading || !api}
          className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all active:scale-95"
          aria-label="Refresh roster"
        >
          <RefreshCw className={`w-4 h-4 ${timetable.loading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {timetable.error && (
        <div role="alert" className="p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 bg-amber-500/15 text-amber-300 border-amber-500/40">
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Couldn't load the roster. {timetable.error.message}</span>
          <button type="button" onClick={() => void timetable.reload()} className="min-h-11 px-3 rounded-xl bg-slate-800 text-slate-200">Retry</button>
        </div>
      )}

      <div className="space-y-3">
        {days.map((day) => {
          const isToday = day.dayName === todayDayName;
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
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-white">{day.dayName}</span>
                  {isToday && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" aria-hidden="true" /> Today
                    </span>
                  )}
                </div>

                {isManager && (
                  <button
                    onClick={() => openDayEdit(day)}
                    disabled={!timetable.data}
                    className="min-h-11 text-xs font-extrabold text-slate-300 hover:text-emerald-400 flex items-center gap-1 px-3 rounded-lg bg-slate-950 border border-slate-800 transition-colors disabled:opacity-50"
                  >
                    <Edit3 className="w-3 h-3" aria-hidden="true" /> Edit {day.dayName}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider">
                    <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                    Morning ({SHOP_INFO.morningShift.defaultIn} - {SHOP_INFO.morningShift.defaultOut})
                  </div>
                  <p className="font-black text-white text-sm tracking-tight truncate">
                    {timetable.data ? day.morning || 'Unassigned' : '…'}
                  </p>
                </div>

                <div className="bg-slate-950/90 border border-cyan-500/30 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-extrabold text-[10px] uppercase tracking-wider">
                    <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                    Evening ({SHOP_INFO.eveningShift.defaultIn} - {SHOP_INFO.eveningShift.defaultOut})
                  </div>
                  <p className="font-black text-white text-sm tracking-tight truncate">
                    {timetable.data ? day.evening || 'Unassigned' : '…'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingDay && (
        <Modal title={<><Edit3 className="w-4 h-4 text-emerald-400" aria-hidden="true" />Reassign Roster - {editingDay.dayName}</>} onClose={() => setEditingDay(null)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="roster-morning" className="block text-xs font-bold uppercase text-emerald-400 mb-1.5">Morning Shift Staff</label>
              <select
                id="roster-morning"
                value={editMorningEmp}
                onChange={(e) => setEditMorningEmp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Unassigned --</option>
                {nameOptions(editMorningEmp).map((emp) => <option key={emp} value={emp}>{emp}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="roster-evening" className="block text-xs font-bold uppercase text-cyan-400 mb-1.5">Evening Shift Staff</label>
              <select
                id="roster-evening"
                value={editEveningEmp}
                onChange={(e) => setEditEveningEmp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-bold text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Unassigned --</option>
                {nameOptions(editEveningEmp).map((emp) => <option key={emp} value={emp}>{emp}</option>)}
              </select>
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-xl px-3 py-2">{saveError}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditingDay(null)} className="flex-1 min-h-12 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveRoster()}
              disabled={saving || !api}
              className="flex-1 min-h-12 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Roster
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
};
