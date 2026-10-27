import type { CompanyCategory, CompanyClassification } from './types';

/**
 * Company-size classification — documented, configurable, and honest about
 * missing data.
 *
 * Default rules (employee headcount is the primary signal):
 *   startup : fewer than 200 employees
 *   mid     : 200 – 2,999 employees
 *   large   : 3,000+ employees, OR a listed multinational (≥ 3 countries)
 *             with 1,000+ employees
 *
 * Fallback when headcount is unknown: funding stage (Pre-seed → Series B ⇒
 * startup-like, low confidence). With no usable signal the company is
 * `unclassified` and is excluded from the 35/30/35 quota rather than guessed.
 *
 * A headcount within ±15% of a threshold is flagged as ambiguous (low
 * confidence) because headcount sources disagree and change quickly.
 */
export interface ClassificationConfig {
  startupMax: number;
  midMax: number;
  multinationalMinEmployees: number;
  multinationalMinCountries: number;
  ambiguityBand: number;
}

export const DEFAULT_CLASSIFICATION: ClassificationConfig = {
  startupMax: 199,
  midMax: 2999,
  multinationalMinEmployees: 1000,
  multinationalMinCountries: 3,
  ambiguityBand: 0.15,
};

export interface CompanyFirmographics {
  employees?: number;
  /** e.g. 'seed', 'series-a', 'series-c', 'public' */
  fundingStage?: string;
  listed?: boolean;
  countries?: number;
  manualCategory?: CompanyCategory;
  /** Where the figures came from, shown to the user (e.g. "assistant estimate, unverified"). */
  source?: string;
  /** Rough or unverified headcount: confidence is capped below "high". */
  estimated?: boolean;
}

const EARLY_STAGES = new Set(['pre-seed', 'seed', 'series-a', 'series-b']);

export function classifyCompany(
  f: CompanyFirmographics,
  cfg: ClassificationConfig = DEFAULT_CLASSIFICATION,
): CompanyClassification {
  if (f.manualCategory) {
    return { category: f.manualCategory, basis: 'manual', confidence: 'high', explanation: 'Category set manually by a reviewer.' };
  }
  if (f.employees != null && f.employees > 0) {
    const n = f.employees;
    let category: CompanyCategory;
    let basis: CompanyClassification['basis'] = 'employee_count';
    let explanation: string;
    if (f.listed && (f.countries ?? 0) >= cfg.multinationalMinCountries && n >= cfg.multinationalMinEmployees && n > cfg.midMax) {
      category = 'large';
      basis = 'multinational_listed';
      explanation = `Listed multinational (${f.countries} countries, ~${n.toLocaleString('en-IN')} employees).`;
    } else if (n <= cfg.startupMax) {
      category = 'startup';
      explanation = `~${n.toLocaleString('en-IN')} employees (< ${cfg.startupMax + 1}).`;
    } else if (n <= cfg.midMax) {
      category = 'mid';
      explanation = `~${n.toLocaleString('en-IN')} employees (${cfg.startupMax + 1}–${cfg.midMax.toLocaleString('en-IN')}).`;
    } else {
      category = 'large';
      explanation = `~${n.toLocaleString('en-IN')} employees (≥ ${(cfg.midMax + 1).toLocaleString('en-IN')}).`;
    }
    const nearEdge = [cfg.startupMax + 1, cfg.midMax + 1].some((t) => Math.abs(n - t) / t <= cfg.ambiguityBand);
    const note = [nearEdge ? 'Near a size boundary, so the category is approximate.' : '', f.estimated ? `Headcount is a rough estimate${f.source ? ` (${f.source})` : ''}.` : f.source ? `Source: ${f.source}.` : ''].filter(Boolean).join(' ');
    return {
      category,
      basis,
      confidence: nearEdge ? 'low' : f.estimated ? 'medium' : 'high',
      explanation: note ? `${explanation} ${note}` : explanation,
    };
  }
  if (f.fundingStage) {
    const stage = f.fundingStage.toLowerCase();
    if (EARLY_STAGES.has(stage)) {
      return {
        category: 'startup',
        basis: 'funding_stage',
        confidence: 'low',
        explanation: `Headcount unknown; inferred from early funding stage (${stage}).`,
      };
    }
  }
  return {
    category: 'unclassified',
    basis: 'unknown',
    confidence: 'low',
    explanation: 'No reliable headcount or funding data. Excluded from category quotas rather than guessed.',
  };
}
