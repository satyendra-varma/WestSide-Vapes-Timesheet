import React, { useCallback, useEffect, useState } from 'react';
import { Download, Phone, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { ApiError } from '../api/client';
import { CustomerRequest, RequestStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useStock } from '../data/hooks';
import { normalizePhone, telHref } from '../utils/phone';
import { downloadCsv, requestsCsv } from '../utils/csv';
import { getTodayDateString } from '../config';
import { useConfirm } from './ConfirmDialog';

const STATUSES: RequestStatus[] = ['open', 'contacted', 'fulfilled'];

/**
 * Customer requests (name, phone, product). The data lives ONLY in this component's state: never in
 * the shared cache, localStorage, sessionStorage, the service worker or logs (DECISIONS D-016, D-041).
 * It's dropped as soon as the session isn't active (logout or expiry) and when the component unmounts.
 */
export const CustomerRequests: React.FC = () => {
  const { api, isManager } = useAuth();
  const confirm = useConfirm();
  const stock = useStock();
  const [requests, setRequests] = useState<CustomerRequest[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showFulfilled, setShowFulfilled] = useState(false);
  const [purgeDays, setPurgeDays] = useState<string>('');

  const fail = (err: unknown, fallback: string) =>
    err instanceof ApiError && err.code === 'unauthorized' ? null : err instanceof ApiError ? err.message : fallback;

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      setRequests(await api.getRequests());
      if (isManager) setPurgeDays(String((await api.getRequestSettings()).purgeDays));
    } catch (err) {
      setError(fail(err, "Couldn't load requests."));
    } finally {
      setLoading(false);
    }
  }, [api, isManager]);

  useEffect(() => {
    if (!api) {
      setRequests(null); // session expired or logged out: drop customer data immediately
      return;
    }
    void load();
  }, [api, load]);

  const mutate = async (action: () => Promise<CustomerRequest[]>) => {
    if (!api) return false;
    setBusy(true);
    setError(null);
    try {
      setRequests(await action());
      return true;
    } catch (err) {
      setError(fail(err, 'Not saved. Please try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) return setFormError("Enter the customer's name.");
    if (!normalizePhone(phone)) return setFormError('Enter a 10-digit phone number, e.g. 604-555-0123.');
    if (!product.trim()) return setFormError('Enter the product.');
    if (await mutate(() => api!.addRequest(name, phone, product))) {
      setName('');
      setPhone('');
      setProduct('');
    }
  };

  const remove = async (r: CustomerRequest) => {
    const ok = await confirm({ title: 'Delete request?', message: `Delete this request for ${r.product}? This can't be undone.`, confirmLabel: 'Delete', danger: true });
    if (ok) await mutate(() => api!.deleteRequest(r.id));
  };

  const savePurge = async () => {
    if (!api) return;
    setError(null);
    try {
      setPurgeDays(String((await api.setRequestSettings(Number(purgeDays))).purgeDays));
    } catch (err) {
      setError(fail(err, 'Not saved.'));
    }
  };

  const list = requests ?? [];
  const visible = list.filter((r) => showFulfilled || r.status !== 'fulfilled');
  const groups = new Map<string, { product: string; items: CustomerRequest[] }>();
  for (const r of visible) {
    const key = r.product.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { product: r.product, items: [] });
    groups.get(key)!.items.push(r);
  }
  const grouped = Array.from(groups.values()).sort((a, b) => a.product.localeCompare(b.product));
  grouped.forEach((g) => g.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const suggestions = Array.from(new Set([...list.map((r) => r.product), ...(stock.data ?? []).map((s) => s.product)])).sort();
  const fulfilledCount = list.filter((r) => r.status === 'fulfilled').length;

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void add(e)} className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-3" noValidate>
        <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
          <UserRound className="w-4 h-4 text-cyan-400" aria-hidden="true" /> New customer request
        </h3>
        <div className="space-y-1.5">
          <label htmlFor="req-name" className="block text-xs font-black uppercase tracking-wider text-slate-400">Customer name</label>
          <input id="req-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off"
            className="w-full min-h-11 bg-slate-950 border-2 border-slate-800 focus:border-cyan-500 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-phone" className="block text-xs font-black uppercase tracking-wider text-slate-400">Phone</label>
          <input id="req-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="off" placeholder="604-555-0123"
            className="w-full min-h-11 bg-slate-950 border-2 border-slate-800 focus:border-cyan-500 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none placeholder-slate-400" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-product" className="block text-xs font-black uppercase tracking-wider text-slate-400">Product</label>
          <input id="req-product" list="req-product-suggestions" value={product} onChange={(e) => setProduct(e.target.value)} maxLength={80} autoComplete="off"
            className="w-full min-h-11 bg-slate-950 border-2 border-slate-800 focus:border-cyan-500 rounded-2xl px-4 py-3 text-white font-bold text-sm focus:outline-none" />
          <datalist id="req-product-suggestions">
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <p className="text-[11px] text-slate-300">Used only to contact you about this request.</p>
        {formError && <p role="alert" className="text-xs font-bold text-rose-300">{formError}</p>}
        <button type="submit" disabled={busy || !api} className="w-full min-h-12 rounded-2xl bg-cyan-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save request
        </button>
      </form>

      {error && <p role="alert" className="text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-xl px-3 py-2">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Requests by product</h3>
        <button type="button" onClick={() => void load()} disabled={loading || !api} className="w-11 h-11 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center" aria-label="Refresh requests">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {requests !== null && grouped.length === 0 && <p className="text-xs text-slate-400">No open requests.</p>}

      {grouped.map((g) => (
        <section key={g.product.toLowerCase()} aria-label={`Requests for ${g.product}`} className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 space-y-2">
          <h4 className="font-extrabold text-sm text-white">{g.product} <span className="text-slate-400 font-bold">({g.items.length})</span></h4>
          <ul className="space-y-2">
            {g.items.map((r) => (
              <li key={r.id} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-white break-words">{r.customerName}</p>
                    <p className="text-[11px] text-slate-400">{r.createdAt} · by {r.createdBy}</p>
                  </div>
                  {isManager && (
                    <button type="button" onClick={() => void remove(r)} disabled={busy} className="w-11 h-11 shrink-0 rounded-lg bg-rose-500/10 text-rose-300 flex items-center justify-center" aria-label={`Delete request ${r.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {telHref(r.phone) ? (
                    <a href={telHref(r.phone)} className="min-h-11 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-bold flex items-center gap-1.5">
                      <Phone className="w-4 h-4" aria-hidden="true" /> {r.phone}
                    </a>
                  ) : (
                    <span className="text-sm text-slate-300">{r.phone}</span>
                  )}
                  <label className="sr-only" htmlFor={`status-${r.id}`}>Status of request {r.id}</label>
                  <select
                    id={`status-${r.id}`}
                    value={r.status}
                    disabled={busy}
                    onChange={(e) => void mutate(() => api!.updateRequestStatus(r.id, e.target.value as RequestStatus))}
                    className="min-h-11 flex-1 bg-slate-900 border border-slate-700 rounded-xl px-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {fulfilledCount > 0 && (
        <button type="button" onClick={() => setShowFulfilled((v) => !v)} aria-expanded={showFulfilled} className="min-h-11 text-xs font-bold text-slate-300 underline">
          {showFulfilled ? 'Hide' : 'Show'} fulfilled ({fulfilledCount})
        </button>
      )}

      {isManager && requests !== null && (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Manager</h4>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="purge-days" className="block text-[11px] font-bold text-slate-400 mb-1">Delete fulfilled requests after (days)</label>
              <input id="purge-days" type="number" min={1} max={365} value={purgeDays} onChange={(e) => setPurgeDays(e.target.value)}
                className="w-full min-h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-white font-bold text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <button type="button" onClick={() => void savePurge()} className="min-h-11 px-4 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold">Save</button>
          </div>
          <button type="button" disabled={list.length === 0} onClick={() => downloadCsv(`customer-requests-${getTodayDateString()}.csv`, requestsCsv(list))}
            className="w-full min-h-11 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export requests CSV
          </button>
        </div>
      )}
    </div>
  );
};
