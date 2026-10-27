import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyProfile, type UserProfile } from '@jobradar/core';
import { KEYS, readJson, removeKey, writeJson } from '../lib/storage';

interface Ctx {
  profile: UserProfile;
  update: (patch: Partial<UserProfile>) => void;
  replace: (p: UserProfile) => void;
  /** Delete the profile and every locally stored trace of it. */
  deleteAll: () => void;
}

const ProfileContext = createContext<Ctx | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => ({ ...emptyProfile(), ...readJson<Partial<UserProfile>>(KEYS.profile, {}) }));

  useEffect(() => {
    writeJson(KEYS.profile, profile);
  }, [profile]);

  const update = useCallback((patch: Partial<UserProfile>) => setProfile((p) => ({ ...p, ...patch })), []);
  const replace = useCallback((p: UserProfile) => setProfile(p), []);
  const deleteAll = useCallback(() => {
    for (const k of Object.values(KEYS)) removeKey(k);
    setProfile(emptyProfile());
  }, []);

  const value = useMemo(() => ({ profile, update, replace, deleteAll }), [profile, update, replace, deleteAll]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): Ctx {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
