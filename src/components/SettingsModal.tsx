import React, { useState } from 'react';
import { Settings, Copy, Check, Globe, Wifi, FileCode } from 'lucide-react';
import { checkBackend, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { getApiUrlOverride, getDefaultApiUrl, setApiUrlOverride } from '../config';
import { APPS_SCRIPT_CODE_GS } from '../utils/appsScriptTemplate';
import { Modal } from './Modal';
import { useConfirm } from './ConfirmDialog';
import { useShiftQueue } from '../offline/useShiftQueue';
import { StaffManager } from './StaffManager';
import { AuditLog } from './AuditLog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Manager-only (App.tsx doesn't render it for staff; the server enforces roles regardless). */
export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { logout } = useAuth();
  const confirm = useConfirm();
  const { mine: unsent } = useShiftQueue();
  const [scriptUrl, setScriptUrl] = useState<string>(getApiUrlOverride());
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [testingUrl, setTestingUrl] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const defaultUrl = getDefaultApiUrl();

  const handleTestConnection = async () => {
    setTestingUrl(true);
    setTestResult(null);
    try {
      await checkBackend(scriptUrl.trim() || defaultUrl);
      setTestResult({ success: true, message: 'Connected: this is the v2 WestSide backend.' });
    } catch (err) {
      setTestResult({ success: false, message: err instanceof ApiError ? err.message : 'Connection failed.' });
    } finally {
      setTestingUrl(false);
    }
  };

  const handleSaveUrl = async () => {
    const next = scriptUrl.trim();
    if (next === getApiUrlOverride()) return;
    if (unsent.length > 0) {
      setTestResult({ success: false, message: 'Send or discard the unsent shifts on the Log Shift tab before switching servers.' });
      return;
    }
    const ok = await confirm({ title: 'Switch server?', message: 'Switching servers logs you out on this device.', confirmLabel: 'Switch & log out' });
    if (!ok) return;
    setApiUrlOverride(next || null);
    logout();
  };

  const handleCopyCodeGs = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE_GS);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 3000);
    } catch {
      setTestResult({ success: false, message: "Couldn't copy to the clipboard." });
    }
  };

  return (
    <Modal
      title={<><Settings className="w-5 h-5 text-cyan-400" aria-hidden="true" />Manager Settings</>}
      onClose={onClose}
      className="max-w-lg"
    >
      <div id="settings-modal-card" className="space-y-5">
        <StaffManager />

        <AuditLog />

        {/* Server address (this device only) */}
        <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
          <label htmlFor="apps-script-url-input" className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Server address (this device)
          </label>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Leave empty to use the app's built-in server{defaultUrl ? '' : ' (none is configured in this build)'}. Only set this to test a staging copy of the sheet.
          </p>
          <input
            type="url"
            id="apps-script-url-input"
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            placeholder={defaultUrl || 'https://script.google.com/macros/s/.../exec'}
            className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white font-mono text-xs rounded-xl px-3.5 py-3 focus:outline-none"
          />
          {testResult && (
            <p role={testResult.success ? 'status' : 'alert'} className={`p-3 rounded-xl text-xs font-bold ${
              testResult.success ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}>
              {testResult.message}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleSaveUrl()} className="flex-1 min-h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs">
              Save & log out
            </button>
            <button type="button" onClick={() => void handleTestConnection()} disabled={testingUrl} className="min-h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              {testingUrl ? 'Testing…' : 'Test'}
            </button>
          </div>
        </div>

        {/* Backend code */}
        <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <FileCode className="w-4 h-4 text-amber-400" aria-hidden="true" />
            Backend code (Code.gs)
          </h4>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            The exact Apps Script this app expects. Deployment steps are in docs/MORNING_CHECKLIST.md in the repository.
          </p>
          <button
            type="button"
            onClick={() => void handleCopyCodeGs()}
            className="w-full min-h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 border border-amber-500/30"
          >
            {copiedScript ? <><Check className="w-4 h-4 text-emerald-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy backend script</>}
          </button>
        </div>

        <button type="button" onClick={onClose} className="w-full min-h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm">
          Done
        </button>
      </div>
    </Modal>
  );
};
