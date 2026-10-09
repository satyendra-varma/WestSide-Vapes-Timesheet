import React from 'react';
import { Clock, Calendar, Users, Package, Banknote } from 'lucide-react';

export type TabType = 'logging' | 'monthly' | 'timetable' | 'stock' | 'cash';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'logging', label: 'Log', icon: Clock },
    { id: 'monthly', label: 'Timesheet', icon: Calendar },
    { id: 'timetable', label: 'Roster', icon: Users },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'cash', label: 'Cash', icon: Banknote },
  ];

  return (
    <nav id="bottom-navigation-bar" aria-label="Main" className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 py-2 px-4 shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-11 flex-1 flex flex-col items-center gap-1 py-1 px-1 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-emerald-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${
                isActive ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-950' : 'bg-transparent'
              }`}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              </div>
              <span className="text-[11px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
