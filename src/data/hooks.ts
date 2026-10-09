import { EmployeeInfo, RosterDay, TimesheetResult } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ShiftRecord } from '../types';
import { Resource, useResource } from './store';

export const EMPLOYEES_KEY = 'employees';
export const TIMETABLE_KEY = 'timetable';
export const timesheetKey = (monthYear: string): string => `timesheet:${monthYear}`;

/** "2026-10" (month input value) -> "10-2026" (backend month tab name). */
export function toMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `${month}-${year}`;
}

export function toShiftRecords(result: TimesheetResult): ShiftRecord[] {
  return result.records.map((r) => ({
    id: `shift_${r.date}_${r.shift}`,
    employeeName: r.name,
    date: r.date,
    shift: r.shift,
    inTime: r.inTime,
    outTime: r.outTime,
  }));
}

export function useEmployees(): Resource<EmployeeInfo[]> {
  const { api } = useAuth();
  return useResource(api ? EMPLOYEES_KEY : null, () => api!.getEmployees());
}

export function useTimetable(): Resource<RosterDay[]> {
  const { api } = useAuth();
  return useResource(api ? TIMETABLE_KEY : null, () => api!.getTimetable());
}

export function useTimesheet(monthYear: string): Resource<ShiftRecord[]> {
  const { api } = useAuth();
  return useResource(api ? timesheetKey(monthYear) : null, async () => toShiftRecords(await api!.getTimesheet(monthYear)));
}
