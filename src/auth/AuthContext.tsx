import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackendApi, createBackendApi, login as loginRequest } from '../api/backend';
import { setUnauthorizedListener } from '../api/client';
import { SessionUser } from '../api/types';
import { clearCache } from '../data/store';
import { clearSession, loadSession, saveSession, Session, sessionFromLogin } from './session';

export type AuthStatus = 'anonymous' | 'active' | 'expired';

interface AuthContextValue {
  status: AuthStatus;
  /** The logged-in user, also kept while 'expired' so the re-login prompt can show the name. */
  user: SessionUser | null;
  isManager: boolean;
  /** Bound to the current token; null unless status is 'active'. */
  api: BackendApi | null;
  login(name: string, pin: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [expiredUser, setExpiredUser] = useState<SessionUser | null>(null);

  const expire = useCallback(() => {
    // Keep the screen (and any unsaved form) but drop the token and every cached record.
    setSession((current) => {
      if (current) setExpiredUser(current.user);
      return null;
    });
    clearSession();
    clearCache();
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setExpiredUser(null);
    clearSession();
    clearCache();
  }, []);

  const login = useCallback(async (name: string, pin: string) => {
    const next = sessionFromLogin(await loginRequest(name, pin));
    // The main screen is keyed by user name (App.tsx), so a different person never inherits the
    // previous user's unsaved forms; the same person picks up where they were.
    saveSession(next);
    setSession(next);
    setExpiredUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedListener(expire);
    return () => setUnauthorizedListener(null);
  }, [expire]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(expire, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session, expire]);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? expiredUser;
    return {
      status: session ? 'active' : expiredUser ? 'expired' : 'anonymous',
      user,
      isManager: user?.role === 'manager',
      api: session ? createBackendApi(session.token) : null,
      login,
      logout,
    };
  }, [session, expiredUser, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
