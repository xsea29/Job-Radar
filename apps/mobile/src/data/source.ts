import { buildDemoDataset, type DemoDataset } from '@jobradar/demo';
import type { RoleId } from '@jobradar/core';
import type { DemoScenario } from '../state/settings';

/**
 * The seam between the UI and wherever evidence comes from.
 *
 * Stage 1 : `demoSource` generates clearly-labelled synthetic records.
 * Stage 2 : an `apiSource` will fetch the same shape from the backend
 *           (`GET /v1/evidence?role=…`). Nothing above this file changes.
 */
export type Evidence = Omit<DemoDataset, 'provenance'> & { provenance: 'demo' | 'live' };

/** Set VITE_API_URL (e.g. http://localhost:8787) to use real data instead of the labelled demo. */
export const API_URL: string | undefined = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || undefined;
export const IS_DEMO = !API_URL;

export interface EvidenceSource {
  readonly provenance: 'demo' | 'live';
  load(params: { roleId: RoleId; scenario: DemoScenario }): Promise<Evidence | null>;
}

const cache = new Map<string, Evidence>();
const NOW = new Date();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoSource: EvidenceSource = {
  provenance: 'demo',
  async load({ roleId, scenario }) {
    if (scenario === 'slow') await sleep(3500);
    else await sleep(350);
    if (scenario === 'error') throw new Error('Could not reach the job-data service (simulated error).');
    if (scenario === 'empty') return null;
    const sc = scenario === 'partial' ? 'partial' : 'complete';
    const key = `${roleId}:${sc}`;
    let ds = cache.get(key);
    if (!ds) {
      ds = buildDemoDataset({ now: NOW, roleId, scenario: sc });
      cache.set(key, ds);
    }
    return ds as Evidence;
  },
};

/** Real evidence from the JobRadar API. A 404 means "no scan yet"; anything else is an error, never silently empty. */
export const apiSource: EvidenceSource = {
  provenance: 'live',
  async load({ roleId }) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/v1/evidence?role=${roleId}`, { headers: { Accept: 'application/json' } });
    } catch {
      throw new Error('Could not reach the JobRadar service. Check your connection and try again.');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`The JobRadar service returned an error (${res.status}).`);
    return (await res.json()) as Evidence;
  },
};

export const evidenceSource: EvidenceSource = API_URL ? apiSource : demoSource;
