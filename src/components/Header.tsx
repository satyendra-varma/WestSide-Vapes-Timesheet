import React from 'react';
import { Zap, Settings, Wifi, WifiOff } from 'lucide-react';
import { SHOP_INFO } from '../config';

interface HeaderProps {
  scriptUrl: string;
  isMock: boolean;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ scriptUrl, isMock, onOpenSettings }) => {
  const isCustomUrl = scriptUrl && !scriptUrl.includes('SAMPLE_WESTSIDE_VAPES');

  return (
    <header id="app-header" className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 shadow-xl">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-[2px] shadow-lg shadow-emerald-950/50">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-lg text-white tracking-tight leading-none">
                {SHOP_INFO.name.toUpperCase()}
              </h1>
              <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Staff
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{SHOP_INFO.tagline}</p>
          </div>
        </div>

        {/* Status Pill & Settings Trigger */}
        <div className="flex items-center gap-2">
          <button
            id="status-indicator-btn"
            onClick={onOpenSettings}
            title="API Connection Settings"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${
              isCustomUrl && !isMock
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
            }`}
          >
            {isCustomUrl && !isMock ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-cyan-400" />
                <span>Demo / Local</span>
              </>
            )}
          </button>

          <button
            id="open-settings-btn"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 flex items-center justify-center transition-all active:scale-95"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>
    </header>
  );
};
