// In-memory stand-ins for the Apps Script services the backend uses. They mimic the behaviour that
// matters to our code (Sheets turning "09:00" into a time value unless the cell is plain text,
// a leading apostrophe forcing text, signed byte arrays from Utilities, ...). Not a full emulator.
import { createHash, createHmac, randomUUID } from 'node:crypto';

export type CellValue = string | number | boolean | Date;

/** Fixed, test-controlled time by default; `live` follows the real clock (mock server). */
export class FakeClock {
  private fixedMs: number;
  constructor(initialMs: number = Date.UTC(2026, 9, 9, 20, 0, 0), private live = false) {
    this.fixedMs = initialMs;
  }
  get nowMs(): number {
    return this.live ? Date.now() : this.fixedMs;
  }
  advanceMinutes(minutes: number): void {
    this.fixedMs += minutes * 60_000;
  }
}

// ---------- time zone helpers ----------

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: string }

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second), weekday: map.weekday,
  };
}

/** The instant whose wall-clock time in `timeZone` is the given local date/time. */
export function zonedTimeToDate(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += target - asUtc;
  }
  return new Date(guess);
}

export function formatDate(date: Date, timeZone: string, pattern: string): string {
  const p = zonedParts(date, timeZone);
  const two = (n: number) => String(n).padStart(2, '0');
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss|EEEE/g, (token) => {
    switch (token) {
      case 'yyyy': return String(p.year);
      case 'MM': return two(p.month);
      case 'dd': return two(p.day);
      case 'HH': return two(p.hour);
      case 'mm': return two(p.minute);
      case 'ss': return two(p.second);
      default: return p.weekday;
    }
  });
}

// ---------- Sheets ----------

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export class FakeSheet {
  cells: Array<Array<CellValue | null>> = [];
  formulas = new Map<string, string>();
  formats = new Map<string, string>();
  protections: Array<{ description: string; warningOnly: boolean }> = [];

  constructor(public name: string, readonly book: FakeSpreadsheet) {}

  getName(): string { return this.name; }
  setName(name: string): FakeSheet {
    if (this.book.sheets.some((s) => s !== this && s.name === name)) throw new Error(`A sheet with the name "${name}" already exists.`);
    this.name = name;
    return this;
  }

  private key(row: number, col: number): string { return `${row},${col}`; }

  raw(row: number, col: number): CellValue | null {
    return this.cells[row - 1]?.[col - 1] ?? null;
  }

  formatAt(row: number, col: number): string { return this.formats.get(this.key(row, col)) ?? ''; }

  write(row: number, col: number, value: unknown): void {
    if (row < 1 || col < 1) throw new Error('Range coordinates must be >= 1');
    while (this.cells.length < row) this.cells.push([]);
    const r = this.cells[row - 1];
    while (r.length < col) r.push(null);
    const k = this.key(row, col);
    this.formulas.delete(k);
    if (value === null || value === undefined || value === '') { r[col - 1] = null; return; }
    if (typeof value === 'string') {
      if (value.startsWith("'")) { r[col - 1] = value.slice(1); return; }
      if (value.startsWith('=')) { this.formulas.set(k, value); r[col - 1] = null; return; }
      if (this.formatAt(row, col) === '@') { r[col - 1] = value; return; }
      const t = TIME_RE.exec(value);
      if (t && Number(t[1]) < 24 && Number(t[2]) < 60) {
        r[col - 1] = zonedTimeToDate(1899, 12, 30, Number(t[1]), Number(t[2]), this.book.timeZone);
        return;
      }
      const d = US_DATE_RE.exec(value);
      if (d) { r[col - 1] = zonedTimeToDate(Number(d[3]), Number(d[1]), Number(d[2]), 0, 0, this.book.timeZone); return; }
      if (/^-?\d+(\.\d+)?$/.test(value)) { r[col - 1] = Number(value); return; }
      if (/^(true|false)$/i.test(value)) { r[col - 1] = value.toLowerCase() === 'true'; return; }
      r[col - 1] = value;
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) { r[col - 1] = value; return; }
    r[col - 1] = String(value);
  }

  setFormulaAt(row: number, col: number, formula: string): void {
    this.write(row, col, '');
    if (formula) this.formulas.set(this.key(row, col), formula);
  }

  formulaAt(row: number, col: number): string { return this.formulas.get(this.key(row, col)) ?? ''; }

  setFormat(row: number, col: number, format: string): void { this.formats.set(this.key(row, col), format); }

  getLastRow(): number {
    let last = 0;
    this.cells.forEach((r, i) => { if (r.some((v) => v !== null)) last = i + 1; });
    for (const k of this.formulas.keys()) last = Math.max(last, Number(k.split(',')[0]));
    return last;
  }

  getLastColumn(): number {
    let last = 0;
    this.cells.forEach((r) => r.forEach((v, j) => { if (v !== null) last = Math.max(last, j + 1); }));
    for (const k of this.formulas.keys()) last = Math.max(last, Number(k.split(',')[1]));
    return last;
  }

  getMaxRows(): number { return Math.max(1000, this.cells.length); }

  getRange(row: number, col: number, numRows = 1, numCols = 1): FakeRange {
    return new FakeRange(this, row, col, numRows, numCols);
  }

  getDataRange(): FakeRange {
    return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  appendRow(values: unknown[]): FakeSheet {
    const row = this.getLastRow() + 1;
    values.forEach((v, j) => this.write(row, j + 1, v));
    return this;
  }

  deleteRow(row: number): void {
    this.cells.splice(row - 1, 1);
    const shift = (m: Map<string, string>) => {
      const next = new Map<string, string>();
      for (const [k, v] of m) {
        const [r, c] = k.split(',').map(Number);
        if (r === row) continue;
        next.set(`${r > row ? r - 1 : r},${c}`, v);
      }
      return next;
    };
    this.formulas = shift(this.formulas);
    this.formats = shift(this.formats);
  }

  copyTo(book: FakeSpreadsheet): FakeSheet {
    let name = `Copy of ${this.name}`;
    for (let i = 1; book.sheets.some((s) => s.name === name); i++) name = `Copy of ${this.name} ${i}`;
    const copy = new FakeSheet(name, book);
    copy.cells = this.cells.map((r) => r.map((v) => (v instanceof Date ? new Date(v.getTime()) : v)));
    copy.formulas = new Map(this.formulas);
    copy.formats = new Map(this.formats);
    book.sheets.push(copy);
    return copy;
  }

  protect(): { setDescription: (d: string) => { setWarningOnly: (w: boolean) => void } } {
    const p = { description: '', warningOnly: false };
    this.protections.push(p);
    const api = {
      setDescription: (d: string) => { p.description = d; return api; },
      setWarningOnly: (w: boolean) => { p.warningOnly = w; return api; },
    };
    return api;
  }

  /** Test helper: rows of raw values (null -> ''). */
  dump(): CellValue[][] {
    return this.cells.map((r) => r.map((v) => (v === null ? '' : v)));
  }
}

function displayOf(value: CellValue | null, format: string, timeZone: string): string {
  if (value === null) return '';
  if (value instanceof Date) {
    if (format === 'HH:mm') return formatDate(value, timeZone, 'HH:mm');
    return formatDate(value, timeZone, value.getUTCFullYear() < 1900 ? 'HH:mm:ss' : 'MM/dd/yyyy');
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export class FakeRange {
  constructor(private sheet: FakeSheet, private row: number, private col: number, private numRows: number, private numCols: number) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) throw new Error('The coordinates or dimensions of the range are invalid.');
  }
  private each<T>(fn: (r: number, c: number) => T): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < this.numRows; i++) {
      const line: T[] = [];
      for (let j = 0; j < this.numCols; j++) line.push(fn(this.row + i, this.col + j));
      out.push(line);
    }
    return out;
  }
  getValues(): CellValue[][] { return this.each((r, c) => this.sheet.raw(r, c) ?? ''); }
  getDisplayValues(): string[][] { return this.each((r, c) => displayOf(this.sheet.raw(r, c), this.sheet.formatAt(r, c), this.sheetZone())); }
  getValue(): CellValue { return this.getValues()[0][0]; }
  getDisplayValue(): string { return this.getDisplayValues()[0][0]; }
  getFormula(): string { return this.sheet.formulaAt(this.row, this.col); }
  getFormulas(): string[][] { return this.each((r, c) => this.sheet.formulaAt(r, c)); }
  getNumberFormat(): string { return this.sheet.formatAt(this.row, this.col); }
  setValue(value: unknown): FakeRange { this.each((r, c) => this.sheet.write(r, c, value)); return this; }
  setValues(values: unknown[][]): FakeRange {
    if (values.length !== this.numRows || values.some((line) => line.length !== this.numCols)) {
      throw new Error(`The number of rows/columns in the data does not match the range (${this.numRows}x${this.numCols}).`);
    }
    values.forEach((line, i) => line.forEach((v, j) => this.sheet.write(this.row + i, this.col + j, v)));
    return this;
  }
  setFormula(formula: string): FakeRange { this.each((r, c) => this.sheet.setFormulaAt(r, c, formula)); return this; }
  setFormulas(formulas: string[][]): FakeRange {
    formulas.forEach((line, i) => line.forEach((f, j) => this.sheet.setFormulaAt(this.row + i, this.col + j, f)));
    return this;
  }
  setNumberFormat(format: string): FakeRange { this.each((r, c) => this.sheet.setFormat(r, c, format)); return this; }
  setFontWeight(): FakeRange { return this; }
  clearContent(): FakeRange { this.each((r, c) => this.sheet.write(r, c, '')); return this; }
  getRow(): number { return this.row; }
  getNumRows(): number { return this.numRows; }
  private sheetZone(): string { return this.sheet.book.timeZone; }
}

export class FakeSpreadsheet {
  sheets: FakeSheet[] = [];
  constructor(public timeZone: string) {}
  getSheetByName(name: string): FakeSheet | null { return this.sheets.find((s) => s.name === name) ?? null; }
  insertSheet(name: string): FakeSheet {
    if (this.getSheetByName(name)) throw new Error(`A sheet with the name "${name}" already exists.`);
    const sheet = new FakeSheet(name, this);
    this.sheets.push(sheet);
    return sheet;
  }
  getSheets(): FakeSheet[] { return [...this.sheets]; }
  deleteSheet(sheet: FakeSheet): void { this.sheets = this.sheets.filter((s) => s !== sheet); }
  getSpreadsheetTimeZone(): string { return this.timeZone; }
}

// ---------- other services ----------

export class FakeProperties {
  store = new Map<string, string>();
  getProperty(key: string): string | null { return this.store.has(key) ? (this.store.get(key) as string) : null; }
  setProperty(key: string, value: string): FakeProperties { this.store.set(key, String(value)); return this; }
  deleteProperty(key: string): FakeProperties { this.store.delete(key); return this; }
  getProperties(): Record<string, string> { return Object.fromEntries(this.store); }
  getKeys(): string[] { return [...this.store.keys()]; }
}

const toSignedBytes = (buf: Buffer): number[] => Array.from(buf, (b) => (b > 127 ? b - 256 : b));

export interface SentMail { to: string; subject: string; body: string }
export interface FakeTrigger { handler: string; kind: string; every: number }

export interface FakeGoogle {
  clock: FakeClock;
  spreadsheet: FakeSpreadsheet;
  properties: FakeProperties;
  mail: SentMail[];
  triggers: FakeTrigger[];
  logs: string[];
  globals: Record<string, unknown>;
}

export function createFakeGoogle(options: { timeZone?: string; nowMs?: number; liveClock?: boolean } = {}): FakeGoogle {
  const timeZone = options.timeZone ?? 'America/Vancouver';
  const clock = new FakeClock(options.nowMs, options.liveClock ?? false);
  const spreadsheet = new FakeSpreadsheet(timeZone);
  const properties = new FakeProperties();
  const mail: SentMail[] = [];
  const triggers: FakeTrigger[] = [];
  const logs: string[] = [];

  const RealDate = Date;
  class ClockDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(clock.nowMs);
      else super(...(args as [string | number]));
    }
    static now(): number { return clock.nowMs; }
  }

  const triggerBuilder = (handler: string) => {
    const t: FakeTrigger = { handler, kind: '', every: 0 };
    const time = {
      everyHours: (n: number) => { t.kind = 'hours'; t.every = n; return time; },
      everyDays: (n: number) => { t.kind = 'days'; t.every = n; return time; },
      atHour: () => time,
      create: () => { triggers.push(t); return { getHandlerFunction: () => handler }; },
    };
    return { timeBased: () => time };
  };

  const globals: Record<string, unknown> = {
    Date: ClockDate,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => properties },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, tryLock: () => true, releaseLock: () => undefined, hasLock: () => true }) },
    Utilities: {
      computeHmacSha256Signature: (value: string, key: string) => toSignedBytes(createHmac('sha256', key).update(value, 'utf8').digest()),
      computeDigest: (_alg: unknown, value: string) => toSignedBytes(createHash('sha256').update(value, 'utf8').digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      getUuid: () => randomUUID(),
      formatDate: (date: Date, tz: string, pattern: string) => formatDate(date, tz, pattern),
      sleep: () => undefined,
    },
    ContentService: {
      createTextOutput: (text: string) => {
        const out = { setMimeType: () => out, getContent: () => text };
        return out;
      },
      MimeType: { JSON: 'application/json' },
    },
    Session: { getScriptTimeZone: () => timeZone },
    MailApp: {
      sendEmail: (to: string, subject: string, body: string) => { mail.push({ to, subject, body }); },
      getRemainingDailyQuota: () => 100,
    },
    ScriptApp: {
      newTrigger: triggerBuilder,
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler, t })),
      deleteTrigger: (trigger: { t: FakeTrigger }) => { const i = triggers.indexOf(trigger.t); if (i >= 0) triggers.splice(i, 1); },
    },
    Logger: { log: (msg: unknown) => { logs.push(String(msg)); } },
    console: {
      log: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
      info: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
      warn: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
      error: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
    },
  };

  return { clock, spreadsheet, properties, mail, triggers, logs, globals };
}
