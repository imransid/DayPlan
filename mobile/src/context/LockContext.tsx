import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setPasscode as setPasscodeAction,
  clearPasscode as clearPasscodeAction,
} from '../store/slices/securitySlice';
import { hashPasscode, randomSalt } from '../utils/hash';

interface LockContextValue {
  /** Whether an app-wide passcode has been created. */
  hasPasscode: boolean;
  /** Is this note unlocked in the current foreground session? */
  isUnlocked: (id: string) => boolean;
  /** Mark a note unlocked for this session (caller verifies the passcode first). */
  unlock: (id: string) => void;
  /** Re-lock everything now (also happens automatically on background). */
  lockAll: () => void;
  /** Create/replace the app passcode from a plaintext value. */
  setPasscode: (passcode: string) => void;
  /** Remove the app passcode entirely. */
  clearPasscode: () => void;
  /** True iff the plaintext matches the stored salted hash. */
  verifyPasscode: (passcode: string) => boolean;
}

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const passcodeHash = useAppSelector((s) => s.security.passcodeHash);
  const salt = useAppSelector((s) => s.security.salt);

  // Ephemeral, in-memory only: which notes the user has unlocked this session.
  // Never persisted; cleared whenever the app is backgrounded so locked notes
  // re-lock the moment the app leaves the foreground.
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'background') setUnlockedIds(new Set());
    });
    return () => sub.remove();
  }, []);

  const isUnlocked = useCallback(
    (id: string) => unlockedIds.has(id),
    [unlockedIds],
  );

  const unlock = useCallback((id: string) => {
    setUnlockedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const lockAll = useCallback(() => setUnlockedIds(new Set()), []);

  const verifyPasscode = useCallback(
    (passcode: string) => {
      if (!passcodeHash || !salt) return false;
      return hashPasscode(passcode, salt) === passcodeHash;
    },
    [passcodeHash, salt],
  );

  const setPasscode = useCallback(
    (passcode: string) => {
      const s = randomSalt();
      dispatch(
        setPasscodeAction({ passcodeHash: hashPasscode(passcode, s), salt: s }),
      );
    },
    [dispatch],
  );

  const clearPasscode = useCallback(() => {
    dispatch(clearPasscodeAction());
    setUnlockedIds(new Set());
  }, [dispatch]);

  const value = useMemo<LockContextValue>(
    () => ({
      hasPasscode: !!passcodeHash,
      isUnlocked,
      unlock,
      lockAll,
      setPasscode,
      clearPasscode,
      verifyPasscode,
    }),
    [
      passcodeHash,
      isUnlocked,
      unlock,
      lockAll,
      setPasscode,
      clearPasscode,
      verifyPasscode,
    ],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockContextValue {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error('useLock must be used within a LockProvider');
  return ctx;
}
