import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KEYS, readJson, writeJson } from '../lib/storage';

interface Ctx {
  done: Set<string>;
  toggle: (milestoneId: string) => void;
  isDone: (milestoneId: string) => boolean;
}

const RoadmapContext = createContext<Ctx | null>(null);

export function RoadmapProgressProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<Set<string>>(() => new Set(readJson<string[]>(KEYS.roadmap, [])));
  useEffect(() => writeJson(KEYS.roadmap, [...done]), [done]);

  const toggle = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ done, toggle, isDone: (id: string) => done.has(id) }), [done, toggle]);
  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}

export function useRoadmapProgress(): Ctx {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error('useRoadmapProgress must be used inside RoadmapProgressProvider');
  return ctx;
}
