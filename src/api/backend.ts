// Typed wrappers for each backend action.
import { apiCall } from './client';
import {
  AuditPage,
  CustomerRequest,
  RequestStatus,
  StockItem,
  StockStatus,
  EmployeeInfo,
  LoginResult,
  RosterDay,
  SaveShiftInput,
  ShiftSlot,
  ShiftType,
  TimesheetResult,
} from './types';

export function login(name: string, pin: string): Promise<LoginResult> {
  return apiCall<LoginResult>('login', { name, pin });
}

export interface BackendApi {
  getEmployees(): Promise<EmployeeInfo[]>;
  getTimesheet(monthYear: string): Promise<TimesheetResult>;
  saveShift(input: SaveShiftInput): Promise<{ previousData: ShiftSlot }>;
  deleteShift(date: string, shift: ShiftType, expected?: ShiftSlot): Promise<{ previousData: ShiftSlot }>;
  getTimetable(): Promise<RosterDay[]>;
  updateTimetable(timetable: RosterDay[]): Promise<RosterDay[]>;
  setPin(name: string, pin: string): Promise<{ name: string }>;
  unlockEmployee(name: string): Promise<{ name: string }>;
  setEmployeeActive(name: string, active: boolean): Promise<{ name: string; active: boolean }>;
  getAudit(limit: number, offset: number): Promise<AuditPage>;
  getStock(): Promise<StockItem[]>;
  addStock(product: string, status: StockStatus): Promise<StockItem[]>;
  setStockResolved(id: string, resolved: boolean): Promise<StockItem[]>;
  getRequests(): Promise<CustomerRequest[]>;
  addRequest(customerName: string, phone: string, product: string): Promise<CustomerRequest[]>;
  updateRequestStatus(id: string, status: RequestStatus): Promise<CustomerRequest[]>;
  deleteRequest(id: string): Promise<CustomerRequest[]>;
  getRequestSettings(): Promise<{ purgeDays: number }>;
  setRequestSettings(purgeDays: number): Promise<{ purgeDays: number }>;
}

/** All authenticated actions, bound to one session token. */
export function createBackendApi(token: string): BackendApi {
  const call = <T,>(action: string, params: Record<string, unknown> = {}) => apiCall<T>(action, params, token);
  return {
    getEmployees: () => call('getEmployees'),
    getTimesheet: (monthYear) => call('getTimesheet', { monthYear }),
    saveShift: (input) => call('saveShift', { ...input }),
    deleteShift: (date, shift, expected) => call('deleteShift', { date, shift, expected }),
    getTimetable: () => call('getTimetable'),
    updateTimetable: (timetable) => call('updateTimetable', { timetable }),
    setPin: (name, pin) => call('setPin', { name, pin }),
    unlockEmployee: (name) => call('unlockEmployee', { name }),
    setEmployeeActive: (name, active) => call('setEmployeeActive', { name, active }),
    getAudit: (limit, offset) => call('getAudit', { limit, offset }),
    getStock: () => call('getStock'),
    addStock: (product, status) => call('addStock', { product, status }),
    setStockResolved: (id, resolved) => call('setStockResolved', { id, resolved }),
    getRequests: () => call('getRequests'),
    addRequest: (customerName, phone, product) => call('addRequest', { customerName, phone, product }),
    updateRequestStatus: (id, status) => call('updateRequestStatus', { id, status }),
    deleteRequest: (id) => call('deleteRequest', { id }),
    getRequestSettings: () => call('getRequestSettings'),
    setRequestSettings: (purgeDays) => call('setRequestSettings', { purgeDays }),
  };
}
