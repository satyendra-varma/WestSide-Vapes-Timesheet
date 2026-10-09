import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { StockList } from './StockList';
import { CustomerRequests } from './CustomerRequests';

type View = 'stock' | 'requests';

export const StockTab: React.FC = () => {
  const [view, setView] = useState<View>('stock');

  return (
    <section id="tab-stock-container" className="space-y-5 animate-in fade-in duration-300">
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-4 shadow-xl shadow-slate-950">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Package className="w-4 h-4 text-amber-400" aria-hidden="true" />
          </div>
          <h2 className="font-extrabold text-base text-white">Stock & Requests</h2>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-slate-950 border border-slate-800/90 rounded-xl p-1">
          {([['stock', 'Low / out'], ['requests', 'Customer requests']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`min-h-11 rounded-lg text-xs font-extrabold border transition-all ${
                view === id ? 'bg-amber-500/15 text-amber-200 border-amber-500/40' : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'stock' ? <StockList /> : <CustomerRequests />}
    </section>
  );
};
