import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FoundationApiError, foundationApi } from '../api/client';
import type { FoundationMembership, FoundationSession } from '../api/contracts';

interface FoundationSessionValue {
  session: FoundationSession | null;
  loading: boolean;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  selectContext(context: Pick<FoundationMembership, 'membershipId' | 'scope'>): Promise<void>;
  refresh(): Promise<void>;
  startImpersonation(input: Parameters<typeof foundationApi.startImpersonation>[0]): Promise<void>;
  stopImpersonation(reason?: string): Promise<void>;
}

const SessionContext = createContext<FoundationSessionValue | null>(null);

export function FoundationSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<FoundationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSession(await foundationApi.session());
      setError(null);
    } catch (caught) {
      if (caught instanceof FoundationApiError && caught.status === 401) {
        setSession(null);
        setError(null);
      } else {
        setError(caught instanceof Error ? caught.message : 'اتصال به سرویس امکان‌پذیر نیست.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<FoundationSessionValue>(() => ({
    session,
    loading,
    error,
    async login(email, password) {
      setError(null);
      try { setSession(await foundationApi.login(email, password)); }
      catch (caught) {
        const message = caught instanceof Error ? caught.message : 'ورود انجام نشد.';
        setError(message);
        throw caught;
      }
    },
    async logout() {
      if (session) await foundationApi.logout(session.csrfToken);
      setSession(null);
      setError(null);
    },
    async selectContext(context) {
      if (!session) return;
      setSession(await foundationApi.selectContext(context, session.csrfToken));
    },
    refresh,
    async startImpersonation(input) {
      if (!session) return;
      setSession(await foundationApi.startImpersonation(input, session.csrfToken));
    },
    async stopImpersonation(reason = 'بازگشت به حساب مدیر') {
      if (!session) return;
      setSession(await foundationApi.stopImpersonation(reason, session.csrfToken));
    },
  }), [error, loading, refresh, session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useFoundationSession(): FoundationSessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useFoundationSession must be used inside FoundationSessionProvider.');
  return value;
}
