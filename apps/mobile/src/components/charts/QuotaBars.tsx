import type { QuotaRow } from '@jobradar/core';
import { CATEGORY_LABELS } from '@jobradar/core';
import { CategoryMark } from '../ui/Markers';

/** Filled vs target per company category: 35 / 30 / 35. */
export function QuotaBars({ quotas }: { quotas: QuotaRow[] }) {
  return (
    <div className="jr-quota">
      {quotas.map((q) => (
        <div key={q.category} className="jr-quota__row">
          <span className="jr-catcmp__name">
            <CategoryMark category={q.category} />
            {CATEGORY_LABELS[q.category]}
          </span>
          <div className="jr-quota__track" role="img" aria-label={`${q.valid} of ${q.target}`}>
            <div style={{ width: `${Math.min(100, (q.valid / q.target) * 100)}%`, background: `var(--cat-${q.category})` }} />
          </div>
          <span className="jr-catcmp__val mono">
            {q.valid}/{q.target}
          </span>
        </div>
      ))}
    </div>
  );
}
