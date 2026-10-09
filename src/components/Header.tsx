import React from 'react';
import { LogOut, Settings, Zap } from 'lucide-react';
import { SHOP_INFO } from '../config';
import { useAuth } from '../auth/AuthContext';

interface HeaderProps {
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
  const { user, isManager, logout } = useAuth();

  return (
    <header id="app-header" className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 shadow-xl">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-[2px] shadow-lg shadow-emerald-950/50">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="font-black text-base text-white tracking-tight leading-none truncate">
              {SHOP_INFO.name.toUpperCase()}
            </h1>
            <p className="text-xs text-slate-300 font-medium mt-1 truncate">
              {user?.name}
              <span className={`ml-1.5 text-[10px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded-full border ${
                isManager ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}>
                {isManager ? 'Manager' : 'Staff'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isManager && (
            <button
              id="open-settings-btn"
              onClick={onOpenSettings}
              className="w-11 h-11 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 flex items-center justify-center transition-all active:scale-95"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          <button
            id="logout-btn"
            onClick={logout}
            className="w-11 h-11 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 flex items-center justify-center transition-all active:scale-95"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
