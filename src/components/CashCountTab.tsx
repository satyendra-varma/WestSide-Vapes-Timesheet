import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Check, History, RefreshCw, Save } from 'lucide-react';
import { ApiError } from '../api/client';
import { CashCount, CashDay } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DENOMINATIONS, centsToInput, formatCents, parseCount, parseDollarsToCents, totalCents } from '../utils/money';

type Inputs = Record<string, string>;

const emptyInputs = (): Inputs => Object.fromEntries(DENOMINATIONS.map((d) => [String(d.cents), '']));
const inputsFrom = (count: CashCount | null): Inputs =>
  count ? Object.fromEntries(DENOMINATIONS.map((d) => [String(d.cents), count.counts[String(d.cents)] ? String(count.counts[String(d.cents)]) : ''])) : emptyInputs();

/** End-of-day cash count: integer cents only, no sales or pay logic (DECISIONS D-015, D-042). */
export const CashCountTab: React.FC = () => {
  const { api, isManager } = useAuth();
  const [day, setDay] = useState<CashDay | null>(null);
  const [inputs, setInputs] = useState<Inputs>(emptyInputs);
  const [editDate, setEditDate] = useState<string | null>(null); // manager editing a past day
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [floatInput, setFloatInput] = useState('');
  const [historyMonth, setHistoryMonth] = useState('');
  const [history, setHistory] = useState<CashCount[] | null>(null);

  const errorText = (err: unknown) =>
    err instanceof ApiError && err.code === 'unauthorized' ? null : err instanceof ApiError ? err.message : 'Something went wrong.';

  const loadToday = useCallback(async () => {
    if (!api) return;
    try {
      const today = await api.getCashToday();
      setDay(today);
      setInputs(inputsFrom(today.count));
      setFloatInput(centsToInput(today.floatCents));
      setHistoryMonth((m) => m || today.date.slice(0, 7));
      setEditDate(null);
    } catch (err) {
      const text = errorText(err);
      if (text) setMessage({ type: 'error', text });
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void loadToday();
  }, [api, loadToday]);

  const parsed = DENOMINATIONS.map((d) => ({ d, n: parseCount(inputs[String(d.cents)] ?? '') }));
  const invalid = parsed.some((p) => p.n === null);
  const counts = Object.fromEntries(parsed.map((p) => [String(p.d.cents), p.n ?? 0]));
  const total = totalCents(counts);
  const editingPast = editDate !== null && day !== null && editDate !== day.date;
  const pastCount = editingPast ? history?.find((h) => h.date === editDate) ?? null : null;
  const target = editingPast ? pastCount?.floatCents ?? day?.floatCents ?? 0 : day?.count?.floatCents ?? day?.floatCents ?? 0;
  const difference = total - target;

  const save = async () => {
    if (!api || invalid) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.saveCashCount(counts, editingPast ? editDate ?? undefined : undefined);
      if (editingPast) {
        setMessage({ type: 'ok', text: `Saved the count for ${saved.date}.` });
        if (historyMonth) setHistory(await api.getCashHistory(historyMonth));
        await loadToday();
      } else {
        setDay(saved);
        setInputs(inputsFrom(saved.count));
        setMessage({ type: 'ok', text: `Saved: ${formatCents(saved.count?.totalCents ?? 0)}.` });
      }
    } catch (err) {
      const text = errorText(err);
      if (text) setMessage({ type: 'error', text: `Not saved. ${text}` });
    } finally {
      setSaving(false);
    }
  };

  const saveFloat = async () => {
    if (!api) return;
    const cents = parseDollarsToCents(floatInput);
    if (cents === null) {
      setMessage({ type: 'error', text: 'Enter the float in dollars, e.g. 200 or 200.50.' });
      return;
    }
    try {
      const res = await api.setCashSettings(cents);
      setDay((d) => (d ? { ...d, floatCents: res.floatCents } : d));
      setFloatInput(centsToInput(res.floatCents));
      setMessage({ type: 'ok', text: `Target float set to ${formatCents(res.floatCents)}. It applies to days not yet counted.` });
    } catch (err) {
      const text = errorText(err);
      if (text) setMessage({ type: 'error', text });
    }
  };

  const loadHistory = async () => {
    if (!api || !historyMonth) return;
    try {
      setHistory(await api.getCashHistory(historyMonth));
    } catch (err) {
      const text = errorText(err);
      if (text) setMessage({ type: 'error', text });
    }
  };

  const editPast = (c: CashCount) => {
    setEditDate(c.date);
    setInputs(inputsFrom(c));
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const diffColour = difference === 0 ? 'text-emerald-400' : 'text-amber-300';
  const shownDate = editingPast ? editDate : day?.date;

  return (
    <section id="tab-cash-container" className="space-y-5 animate-in fade-in duration-300">
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-4 shadow-xl shadow-slate-950">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-white">End-of-day cash count</h2>
              <p className="text-xs text-slate-400">{shownDate ?? '…'}{editingPast ? ' (editing a past day)' : ''}</p>
            </div>
          </div>
          {day?.count && !editingPast && (
            <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1"><Check className="w-3.5 h-3.5" aria-hidden="true" /> Counted</span>
          )}
        </div>

        {day?.count && !editingPast && (
          <p className="text-[11px] text-slate-400">Last saved by {day.count.countedBy} at {day.count.updatedAt}. Saving again replaces today's count (the change is logged).</p>
        )}
        {editingPast && (
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
            <span>Editing the count for {editDate}.</span>
            <button type="button" onClick={() => void loadToday()} className="min-h-11 px-3 rounded-lg bg-slate-900 text-slate-200">Back to today</button>
          </div>
        )}

        <table className="w-full text-sm">
          <caption className="sr-only">Pieces counted per denomination</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400">
              <th scope="col" className="text-left font-extrabold pb-1">Denomination</th>
              <th scope="col" className="text-left font-extrabold pb-1">Count</th>
              <th scope="col" className="text-right font-extrabold pb-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {parsed.map(({ d, n }) => (
              <tr key={d.cents}>
                <th scope="row" className="text-left font-bold text-white py-1">
                  <label htmlFor={`cash-${d.cents}`}>{d.label} <span className="text-[10px] text-slate-400 font-medium">{d.kind}</span></label>
                </th>
                <td className="py-1">
                  <input
                    id={`cash-${d.cents}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={inputs[String(d.cents)] ?? ''}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [String(d.cents)]: e.target.value }))}
                    aria-invalid={n === null}
                    placeholder="0"
                    className={`w-24 min-h-11 bg-slate-950 border-2 rounded-xl px-3 text-white font-bold focus:outline-none ${
                      n === null ? 'border-rose-500' : 'border-slate-800 focus:border-emerald-500'
                    }`}
                  />
                </td>
                <td className="py-1 text-right font-mono text-slate-200">{n === null ? '—' : formatCents(d.cents * n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {invalid && <p role="alert" className="text-xs font-bold text-rose-300">Counts must be whole numbers from 0 to 10,000.</p>}

        <dl className="grid grid-cols-3 gap-2 text-center" aria-live="polite">
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total</dt>
            <dd className="font-black text-white text-sm mt-0.5">{formatCents(total)}</dd>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Target float</dt>
            <dd className="font-black text-slate-200 text-sm mt-0.5">{formatCents(target)}</dd>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Difference</dt>
            <dd className={`font-black text-sm mt-0.5 ${diffColour}`}>{difference > 0 ? '+' : ''}{formatCents(difference)}</dd>
          </div>
        </dl>

        {message && (
          <p role={message.type === 'error' ? 'alert' : 'status'} className={`text-xs font-bold rounded-xl px-3 py-2 border ${
            message.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
          }`}>{message.text}</p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || invalid || !api || !day}
          className="w-full min-h-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-base flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {editingPast ? `Save count for ${editDate}` : day?.count ? "Update today's count" : "Save today's count"}
        </button>
      </div>

      {isManager && (
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="cash-float" className="block text-xs font-black uppercase tracking-wider text-slate-300">Target float ($)</label>
            <div className="flex gap-2">
              <input id="cash-float" inputMode="decimal" value={floatInput} onChange={(e) => setFloatInput(e.target.value)}
                className="flex-1 min-h-11 bg-slate-950 border border-slate-700 rounded-xl px-3 text-white font-bold focus:outline-none focus:border-emerald-500" />
              <button type="button" onClick={() => void saveFloat()} className="min-h-11 px-4 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">Save float</button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <History className="w-4 h-4 text-cyan-400" aria-hidden="true" /> History
            </h3>
            <div className="flex gap-2">
              <input type="month" aria-label="History month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}
                className="flex-1 min-h-11 bg-slate-950 border border-slate-700 rounded-xl px-3 text-white text-sm font-bold focus:outline-none" />
              <button type="button" onClick={() => void loadHistory()} className="min-h-11 px-4 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">Show</button>
            </div>
            {history && history.length === 0 && <p className="text-xs text-slate-400">No counts that month.</p>}
            {history && history.length > 0 && (
              <table className="w-full text-xs">
                <caption className="sr-only">Cash counts for {historyMonth}</caption>
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th scope="col" className="text-left py-1.5">Date</th>
                    <th scope="col" className="text-right py-1.5">Total</th>
                    <th scope="col" className="text-right py-1.5">Diff</th>
                    <th scope="col" className="text-right py-1.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {history.map((c) => (
                    <tr key={c.date}>
                      <th scope="row" className="text-left font-bold text-white py-1">
                        {c.date}
                        <span className="block text-[10px] text-slate-400 font-medium">{c.countedBy}</span>
                      </th>
                      <td className="text-right font-mono text-slate-200">{formatCents(c.totalCents)}</td>
                      <td className={`text-right font-mono ${c.differenceCents === 0 ? 'text-emerald-400' : 'text-amber-300'}`}>{formatCents(c.differenceCents)}</td>
                      <td className="text-right">
                        <button type="button" onClick={() => editPast(c)} className="min-h-11 px-3 rounded-lg bg-slate-800 text-slate-200 font-bold" aria-label={`Edit the count for ${c.date}`}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
