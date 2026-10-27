import type { CompanyCategory } from '@jobradar/core';
import { CATEGORY_LABELS } from '@jobradar/core';
import type { SkillDemand } from '@jobradar/core';
import { CategoryMark } from '../ui/Markers';
import { SkillBar } from './SkillBar';

const CATS: CompanyCategory[] = ['startup', 'mid', 'large'];

/** Same skill across company types. The denominator (jobs in that category) is always printed. */
export function CategoryCompare({ demand }: { demand: SkillDemand }) {
  return (
    <div className="jr-catcmp">
      {CATS.map((c) => {
        const b = demand.byCategory[c];
        const low = b.n < 8;
        return (
          <div key={c} className="jr-catcmp__row">
            <span className="jr-catcmp__name">
              <CategoryMark category={c} />
              {CATEGORY_LABELS[c]}
            </span>
            <SkillBar n={b.n} required={b.required} preferred={b.preferred} mentioned={b.jobs - b.required - b.preferred} />
            <span className="jr-catcmp__val mono">
              {b.jobs}/{b.n}
              <small>{b.n ? Math.round(b.pct * 100) : 0}%</small>
            </span>
            {low && <span className="jr-small jr-warn-text">Small sample ({b.n})</span>}
          </div>
        );
      })}
    </div>
  );
}
