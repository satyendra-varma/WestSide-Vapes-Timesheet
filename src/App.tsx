import React, { useState } from 'react';
import { Header } from './components/Header';
import { BottomNav, TabType } from './components/BottomNav';
import { ShiftLoggingTab } from './components/ShiftLoggingTab';
import { MonthlyTimesheetTab } from './components/MonthlyTimesheetTab';
import { TimetableTab } from './components/TimetableTab';
import { SettingsModal } from './components/SettingsModal';
import { getSavedScriptUrl } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('logging');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [scriptUrl, setScriptUrl] = useState<string>(getSavedScriptUrl());
  const [monthlyRefreshTrigger, setMonthlyRefreshTrigger] = useState<number>(0);

  const handleUrlUpdated = () => {
    setScriptUrl(getSavedScriptUrl());
  };

  const handleShiftSubmitted = () => {
    // Trigger auto refresh for monthly timesheet tab
    setMonthlyRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div id="app-root-container" className="min-h-screen bg-[#090d16] text-slate-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-300 pb-28">
      
      {/* App Header */}
      <Header
        scriptUrl={scriptUrl}
        isMock={!scriptUrl || scriptUrl.includes('SAMPLE_WESTSIDE_VAPES')}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main View Area */}
      <main className="max-w-md mx-auto px-4 pt-5 pb-8">
        
        {/* Tab 1: Shift Logging (Default View) */}
        {activeTab === 'logging' && (
          <ShiftLoggingTab onShiftSubmittedSuccess={handleShiftSubmitted} />
        )}

        {/* Tab 2: Monthly Timesheet Viewer & Editor */}
        {activeTab === 'monthly' && (
          <MonthlyTimesheetTab refreshTrigger={monthlyRefreshTrigger} />
        )}

        {/* Tab 3: Timetable / Schedule Board */}
        {activeTab === 'timetable' && <TimetableTab />}

      </main>

      {/* Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Settings & Configuration Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUrlUpdated={handleUrlUpdated}
      />

    </div>
  );
}
