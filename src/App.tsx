import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { BottomNav, TabType } from './components/BottomNav';
import { ShiftLoggingTab } from './components/ShiftLoggingTab';
import { MonthlyTimesheetTab } from './components/MonthlyTimesheetTab';
import { TimetableTab } from './components/TimetableTab';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { purgeLegacyStorage } from './auth/session';
import { SHOP_INFO } from './config';

export default function App() {
  useEffect(() => {
    document.title = `${SHOP_INFO.name} Timesheet`;
    purgeLegacyStorage();
  }, []);

  return (
    <AuthProvider>
      <ConfirmProvider>
        <Gate />
      </ConfirmProvider>
    </AuthProvider>
  );
}

/** Nothing below the login screen renders, or fetches, until someone is logged in. */
const Gate: React.FC = () => {
  const { status, user } = useAuth();
  if (status === 'anonymous' || !user) return <LoginScreen />;
  return (
    <>
      {/* Keyed by user: a different person never inherits the previous user's unsaved forms. */}
      <MainApp key={user.name} />
      {status === 'expired' && <LoginScreen expiredFor={user.name} />}
    </>
  );
};

const MainApp: React.FC = () => {
  const { isManager } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('logging');
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  return (
    <div id="app-root-container" className="min-h-screen bg-[#090d16] text-slate-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-300 pb-28">
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <main className="max-w-md mx-auto px-4 pt-5 pb-8">
        {activeTab === 'logging' && <ShiftLoggingTab />}
        {activeTab === 'monthly' && <MonthlyTimesheetTab />}
        {activeTab === 'timetable' && <TimetableTab />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {isManager && <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
};
