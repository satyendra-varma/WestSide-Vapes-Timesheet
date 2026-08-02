import React, { useState } from 'react';
import { Settings, Copy, Check, Download, Globe, Wifi, FileCode, X, ExternalLink, HelpCircle } from 'lucide-react';
import { getSavedScriptUrl, saveScriptUrl } from '../services/api';
import { APPS_SCRIPT_CODE_GS } from '../utils/appsScriptTemplate';
import { generateGitHubPagesIndexHtml } from '../utils/githubPagesExport';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUrlUpdated: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onUrlUpdated }) => {
  const [scriptUrl, setScriptUrl] = useState<string>(getSavedScriptUrl());
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [testingUrl, setTestingUrl] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSaveUrl = () => {
    saveScriptUrl(scriptUrl);
    onUrlUpdated();
    setTestResult({ success: true, message: 'Google Apps Script URL saved successfully!' });
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleTestConnection = async () => {
    setTestingUrl(true);
    setTestResult(null);
    try {
      if (!scriptUrl || scriptUrl.includes('SAMPLE_WESTSIDE_VAPES')) {
        setTestResult({
          success: false,
          message: 'Sample URL detected. Currently running in local offline demo mode.',
        });
        return;
      }
      const res = await fetch(`${scriptUrl}?action=getEmployees`);
      if (res.ok) {
        setTestResult({ success: true, message: 'Successfully connected to Google Apps Script Web App!' });
      } else {
        setTestResult({ success: false, message: `HTTP Error ${res.status}. Verify deployment permissions.` });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Connection failed. Ensure "Who has access" is set to "Anyone" in Web App deployment.',
      });
    } finally {
      setTestingUrl(false);
    }
  };

  const handleCopyCodeGs = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE_GS);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const handleDownloadGitHubPagesHtml = () => {
    const htmlContent = generateGitHubPagesIndexHtml(scriptUrl);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="settings-modal-overlay" className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div id="settings-modal-card" className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Settings className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">App & API Configuration</h3>
              <p className="text-xs text-slate-400">Google Apps Script & GitHub Pages setup</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Deployed Google Apps Script URL */}
        <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              Apps Script Web App URL
            </label>
            <span className="text-[10px] text-slate-500 font-semibold">GET & POST Endpoint</span>
          </div>

          <input
            type="url"
            id="apps-script-url-input"
            value={scriptUrl}
            onChange={(e) => setScriptUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white font-mono text-xs rounded-xl px-3.5 py-3 focus:outline-none"
          />

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs font-bold ${
                testResult.success
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSaveUrl}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all"
            >
              Save URL
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testingUrl}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5"
            >
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              {testingUrl ? 'Testing...' : 'Test URL'}
            </button>
          </div>
        </div>

        {/* 2. Google Apps Script Code.gs Exporter */}
        <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-amber-400" />
              Google Sheets Backend (Code.gs)
            </h4>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Need to set up your Google Sheet? Copy this Google Apps Script code and paste it into Google Sheets &gt; Extensions &gt; Apps Script.
          </p>

          <div className="space-y-2 text-[11px] text-slate-400 font-medium">
            <p className="flex items-center gap-1 text-emerald-400 font-bold">
              Deployment Instructions:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
              <li>In Google Sheets, go to <b>Extensions &gt; Apps Script</b>.</li>
              <li>Replace existing code with copied snippet and click Save.</li>
              <li>Click <b>Deploy &gt; New deployment</b>.</li>
              <li>Select <b>Web app</b>, Execute as: <b>Me</b>, Who has access: <b>Anyone</b>.</li>
              <li>Copy the Web App URL and paste above!</li>
            </ol>
          </div>

          <button
            onClick={handleCopyCodeGs}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 border border-amber-500/30 transition-all active:scale-95"
          >
            {copiedScript ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Copied Code.gs to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-amber-400" />
                <span>Copy Backend Script (Code.gs)</span>
              </>
            )}
          </button>
        </div>

        {/* 3. GitHub Pages HTML Exporter */}
        <div className="space-y-3 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-cyan-400" />
              GitHub Pages Standalone HTML
            </h4>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Download a single self-contained <code className="text-cyan-300">index.html</code> file with Vanilla JS + Tailwind CDN ready to upload to GitHub Pages!
          </p>

          <button
            onClick={handleDownloadGitHubPagesHtml}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Download index.html for GitHub Pages
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm"
        >
          Done
        </button>

      </div>
    </div>
  );
};
