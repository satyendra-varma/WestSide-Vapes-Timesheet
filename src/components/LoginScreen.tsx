import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Lock, LogIn, RefreshCw, ServerCrash, User, Zap } from 'lucide-react';
import { ApiError, checkBackend } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { SHOP_INFO, getApiUrlOverride, setApiUrlOverride } from '../config';

interface LoginScreenProps {
  /** Re-login after the session expired: the name is fixed and the screen behind stays intact. */
  expiredFor?: string;
}

type BackendState = 'checking' | 'ok' | 'error';

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'locked') {
      const minutes = err.details.retryAfterMinutes;
      return `Too many wrong PINs. Try again in ${minutes ?? 15} minute${minutes === 1 ? '' : 's'} or ask the manager to unlock you.`;
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ expiredFor }) => {
  const { login, logout } = useAuth();
  const [name, setName] = useState(expiredFor ?? '');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendState>('checking');
  const [backendError, setBackendError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const hasOverride = !!getApiUrlOverride();

  const verifyBackend = async () => {
    setBackend('checking');
    setBackendError(null);
    try {
      await checkBackend();
      setBackend('ok');
    } catch (err) {
      setBackend('error');
      setBackendError(messageFor(err));
    }
  };

  useEffect(() => {
    void verifyBackend();
    if (expiredFor) pinRef.current?.focus();
  }, [expiredFor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backend !== 'ok' || submitting) return;
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter your 6-digit PIN.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(name, pin);
    } catch (err) {
      setError(messageFor(err));
      setPin('');
      pinRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const resetServer = () => {
    setApiUrlOverride(null);
    void verifyBackend();
  };

  const card = (
    <div
      role={expiredFor ? 'dialog' : undefined}
      aria-modal={expiredFor ? true : undefined}
      aria-labelledby="login-title"
      className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl shadow-slate-950"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-[2px]">
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            {expiredFor ? <Lock className="w-5 h-5 text-amber-400" /> : <Zap className="w-5 h-5 text-emerald-400" />}
          </div>
        </div>
        <div>
          <h1 id="login-title" className="font-black text-lg text-white leading-tight">
            {expiredFor ? 'Session expired' : SHOP_INFO.name}
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            {expiredFor ? 'Enter your PIN to continue where you left off.' : 'Staff login'}
          </p>
        </div>
      </div>

      {backend === 'error' && (
        <div role="alert" className="p-3 rounded-2xl border text-xs font-bold bg-rose-500/15 text-rose-200 border-rose-500/40 space-y-2">
          <p className="flex items-start gap-2">
            <ServerCrash className="w-4 h-4 shrink-0 mt-px" />
            <span>{backendError}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void verifyBackend()} className="min-h-11 px-3 rounded-xl bg-slate-800 text-slate-200">
              Try again
            </button>
            {hasOverride && (
              <button type="button" onClick={resetServer} className="min-h-11 px-3 rounded-xl bg-slate-800 text-slate-200">
                Use default server
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="login-name" className="block text-xs font-black uppercase tracking-wider text-slate-300">
            Your name
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="login-name"
              type="text"
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              required
              readOnly={!!expiredFor}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-3.5 text-white font-bold text-base focus:outline-none read-only:text-slate-300"
              placeholder="As written on the staff list"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="login-pin" className="block text-xs font-black uppercase tracking-wider text-slate-300">
            6-digit PIN
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="login-pin"
              ref={pinRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{6}"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-3.5 text-white font-black text-lg tracking-[0.4em] focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || backend !== 'ok' || !name.trim()}
          className="w-full min-h-12 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-base flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting || backend === 'checking' ? <RefreshCw className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
          {backend === 'checking' ? 'Connecting…' : 'Log in'}
        </button>

        {expiredFor && (
          <button type="button" onClick={logout} className="w-full min-h-11 text-xs font-bold text-slate-400 hover:text-white">
            Not {expiredFor}? Log out
          </button>
        )}
      </form>
    </div>
  );

  if (expiredFor) {
    return <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">{card}</div>;
  }
  return <main className="min-h-screen bg-[#090d16] flex items-center justify-center p-4">{card}</main>;
};
