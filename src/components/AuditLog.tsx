import React, { useState } from 'react';
import { History, RefreshCw, Search } from 'lucide-react';
import { ApiError } from '../api/client';
import { AuditEntry } from '../api/types';
import { useAuth } from '../auth/AuthContext';

const PAGE = 50;

/** Manager-only view of the Audit tab (newest first). Kept in component state only. */
export const AuditLog: React.FC = () => {
  const { api } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = async (more: boolean) => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api.getAudit(PAGE, more && entries ? entries.length : 0);
      setEntries(more && entries ? [...entries, ...page.entries] : page.entries);
      setTotal(page.total);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'unauthorized')) setError(err instanceof ApiError ? err.message : "Couldn't load the audit log.");
    } finally {
      setLoading(false);
    }
  };

  const needle = filter.trim().toLowerCase();
  const shown = (entries ?? []).filter((e) =>
    !needle || [e.actor, e.action, e.target, e.details, e.timestamp].some((v) => v.toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <History className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Audit log
        </h4>
        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loading || !api}
          className="min-h-11 px-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {entries ? 'Refresh' : 'Show latest'}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Every login, PIN change, shift change and roster change, newest first. The full log is the Audit tab in the sheet.
      </p>
      {error && <p role="alert" className="text-xs font-bold text-rose-300">{error}</p>}

      {entries && (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, action, date…"
              aria-label="Filter audit log"
              className="w-full min-h-11 bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <ol className="space-y-2 max-h-80 overflow-y-auto pr-1" aria-label="Audit entries">
            {shown.map((e, i) => (
              <li key={`${e.timestamp}-${i}`} className="text-[11px] bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-0.5">
                <p className="flex flex-wrap items-center gap-x-2 text-slate-400">
                  <time className="font-mono">{e.timestamp}</time>
                  <span className="font-black text-cyan-300">{e.action}</span>
                </p>
                <p className="text-white font-bold break-words">
                  {e.actor}
                  {e.target && <span className="text-slate-300 font-medium"> → {e.target}</span>}
                </p>
                {e.details && <p className="text-slate-300 break-words">{e.details}</p>}
              </li>
            ))}
            {shown.length === 0 && <li className="text-xs text-slate-400">No entries{needle ? ' match the filter' : ''}.</li>}
          </ol>
          {entries.length < total && (
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="w-full min-h-11 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold disabled:opacity-50"
            >
              Load older ({entries.length} of {total})
            </button>
          )}
        </>
      )}
    </div>
  );
};
