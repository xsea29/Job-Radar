import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_MATCH_WEIGHTS, DEFAULT_SCAN_CONFIG, type MatchWeights } from '@jobradar/core';
import { KEYS, readJson, writeJson } from '../lib/storage';

export type ThemePref = 'system' | 'light' | 'dark';
export type DemoScenario = 'complete' | 'partial' | 'empty' | 'error' | 'slow';

export interface Settings {
  theme: ThemePref;
  scenario: DemoScenario;
  notifications: { inApp: boolean; push: boolean; email: boolean; onlyWhenSignificant: boolean; matchThreshold: number };
  scan: { target: number; startup: number; mid: number; large: number; postedWithinDays: number };
  matchWeights: MatchWeights;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  scenario: 'complete',
  notifications: { inApp: true, push: true, email: false, onlyWhenSignificant: true, matchThreshold: 70 },
  scan: { target: DEFAULT_SCAN_CONFIG.target, ...DEFAULT_SCAN_CONFIG.quotas, postedWithinDays: 30 },
  matchWeights: { ...DEFAULT_MATCH_WEIGHTS },
};

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx | null>(null);

function load(): Settings {
  const stored = readJson<Partial<Settings>>(KEYS.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: { ...DEFAULT_SETTINGS.notifications, ...stored.notifications },
    scan: { ...DEFAULT_SETTINGS.scan, ...stored.scan },
    matchWeights: { ...DEFAULT_SETTINGS.matchWeights, ...stored.matchWeights },
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    writeJson(KEYS.settings, settings);
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
