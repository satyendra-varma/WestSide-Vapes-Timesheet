import React, { useState } from 'react';
import { PackageX, Plus, RefreshCw } from 'lucide-react';
import { ApiError } from '../api/client';
import { StockStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { STOCK_KEY, useStock } from '../data/hooks';
import { writeCache } from '../data/store';

export const StockList: React.FC = () => {
  const { api } = useAuth();
  const stock = useStock();
  const [product, setProduct] = useState('');
  const [status, setStatus] = useState<StockStatus>('low');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const items = stock.data ?? [];
  const open = items.filter((i) => !i.resolved).sort((a, b) => (a.status === b.status ? a.product.localeCompare(b.product) : a.status === 'out' ? -1 : 1));
  const resolved = items.filter((i) => i.resolved).sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
  const suggestions = Array.from(new Set(items.map((i) => i.product))).sort();

  const run = async (action: () => Promise<unknown>) => {
    if (!api) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (Array.isArray(result)) writeCache(STOCK_KEY, result);
      return true;
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'unauthorized')) setError(err instanceof ApiError ? err.message : 'Not saved. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => api!.addStock(product, status))) setProduct('');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void add(e)} className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-3">
        <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
          <PackageX className="w-4 h-4 text-amber-400" aria-hidden="true" /> Report low or out of stock
        </h3>
        <div className="space-y-1.5">
          <label htmlFor="stock-product" className="block text-xs font-black uppercase tracking-wider text-slate-400">Product</label>
          <input
            id="stock-product"
            list="stock-product-suggestions"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            maxLength={80}
            required
            className="w-full min-h-11 bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none"
          />
          <datalist id="stock-product-suggestions">
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Stock level</legend>
          {(['low', 'out'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`min-h-11 rounded-xl border-2 text-xs font-extrabold uppercase ${
                status === s
                  ? s === 'out' ? 'border-rose-500 bg-rose-500/15 text-rose-300' : 'border-amber-500 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              {s === 'low' ? 'Low' : 'Out'}
            </button>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-xs font-bold text-rose-300">{error}</p>}
        <button type="submit" disabled={busy || !api || !product.trim()} className="w-full min-h-12 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add to list
        </button>
      </form>

      {stock.error && <p role="alert" className="text-xs font-bold text-amber-300">Couldn't load the stock list. {stock.error.message}</p>}

      <ul className="space-y-2" aria-label="Low and out of stock">
        {open.length === 0 && !stock.loading && <li className="text-xs text-slate-400 px-1">Nothing reported. 🎉</li>}
        {open.map((item) => (
          <li key={item.id} className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm text-white break-words">{item.product}</p>
              <p className="text-[11px] text-slate-400">
                <span className={`font-black uppercase ${item.status === 'out' ? 'text-rose-300' : 'text-amber-300'}`}>{item.status}</span>
                {' · '}{item.notedBy}{' · '}{item.notedAt}
              </p>
            </div>
            <label className="min-h-11 shrink-0 flex items-center gap-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={false}
                disabled={busy}
                onChange={() => void run(() => api!.setStockResolved(item.id, true))}
                className="w-5 h-5 accent-emerald-500"
              />
              Resolved
            </label>
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowResolved((v) => !v)} aria-expanded={showResolved} className="min-h-11 text-xs font-bold text-slate-300 underline">
            {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
          </button>
          {showResolved && (
            <ul className="space-y-2" aria-label="Resolved stock items">
              {resolved.map((item) => (
                <li key={item.id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-3 opacity-80">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-300 line-through break-words">{item.product}</p>
                    <p className="text-[11px] text-slate-400">Resolved by {item.resolvedBy} · {item.resolvedAt}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void run(() => api!.setStockResolved(item.id, false))} className="min-h-11 px-3 rounded-xl bg-slate-800 text-xs font-bold text-slate-200">
                    Reopen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
