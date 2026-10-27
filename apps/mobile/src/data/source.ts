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
export type Evidence = DemoDataset;

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
    return ds;
  },
};

export const evidenceSource: EvidenceSource = demoSource;
