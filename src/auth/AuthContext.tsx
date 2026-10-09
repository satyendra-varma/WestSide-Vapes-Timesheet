import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;

  // Keep the screen (and any unsaved form) but drop the token and every cached record. Only acts
  // when the refused token is still the current one: a late reply to a request made with an older
  // token must not end a newer session.
  const expire = useCallback((refusedToken: string | undefined) => {
    const current = sessionRef.current;
    if (!current || refusedToken === undefined || current.token !== refusedToken) return;
    sessionRef.current = null;
    setExpiredUser(current.user);
    setSession(null);
    clearSession();
    clearCache();
  }, []);

  const logout = useCallback(() => {
    sessionRef.current = null;
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
    sessionRef.current = next;
    setSession(next);
    setExpiredUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedListener((token) => expire(token));
    return () => setUnauthorizedListener(null);
  }, [expire]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => expire(session.token), Math.max(0, session.expiresAt - Date.now()));
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
