// hooks/useAuth.tsx
import {
  AppUser,
  signIn as firebaseSignIn,
  signOut as firebaseSignOut,
  signUp as firebaseSignUp,
  onAuthStateChange,
} from '@/services/firebase-service';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type SignUpData = Omit<AppUser, 'uid' | 'email' | 'createdAt'>;

type AuthContextType = {
  user: AppUser | null;

  /** true пока не получили первый auth-state (восстановление с диска) */
  authLoading: boolean;

  /** true когда выполняются действия signIn/signUp/signOut (для кнопок) */
  actionLoading: boolean;

  signIn: (email: string, password: string) => Promise<AppUser>;
  signUp: (email: string, password: string, userData: SignUpData) => Promise<AppUser>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mountedRef = useRef(true);
  const [user, setUser] = useState<AppUser | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = onAuthStateChange((u) => {
      if (!mountedRef.current) return;
      setUser(u);
      setAuthLoading(false);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, []);

  const withAction = useCallback(async <T,>(fn: () => Promise<T>) => {
    if (mountedRef.current) setActionLoading(true);
    try {
      return await fn();
    } finally {
      if (mountedRef.current) setActionLoading(false);
    }
  }, []);

  const signIn = useCallback(
    (email: string, password: string) =>
      withAction(async () => {
        const u = await firebaseSignIn(email, password);
        // setUser не надо — onAuthStateChange сам обновит
        return u;
      }),
    [withAction]
  );

  const signUp = useCallback(
    (email: string, password: string, userData: SignUpData) =>
      withAction(async () => {
        const u = await firebaseSignUp(email, password, userData);
        return u;
      }),
    [withAction]
  );

  const signOut = useCallback(
    () =>
      withAction(async () => {
        await firebaseSignOut();
        // можно мгновенно сбросить UI
        if (mountedRef.current) setUser(null);
      }),
    [withAction]
  );

  const value = useMemo<AuthContextType>(
    () => ({ user, authLoading, actionLoading, signIn, signUp, signOut }),
    [user, authLoading, actionLoading, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}