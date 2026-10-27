import { IonIcon } from '@ionic/react';
import { checkmarkCircle, helpCircle, remove, school, sparkles, trendingDown, trendingUp, cube, flask } from 'ionicons/icons';
import type { CompanyCategoryOrUnclassified, SkillLabel } from '@jobradar/core';
import type { EvidenceQuality } from '@jobradar/core';

const CATEGORY_NAME: Record<string, string> = { startup: 'Startup', mid: 'Mid-sized', large: 'Large / MNC', unclassified: 'Unclassified' };

/** Circle = startup, diamond = mid-sized, square = large. Shape is the second channel. */
export function CategoryMark({ category, size = 10 }: { category: CompanyCategoryOrUnclassified; size?: number }) {
  const color = category === 'startup' ? 'var(--cat-startup)' : category === 'mid' ? 'var(--cat-mid)' : category === 'large' ? 'var(--cat-large)' : 'var(--text-3)';
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" className="jr-mark">
      {category === 'startup' && <circle cx="5" cy="5" r="4.5" fill={color} />}
      {category === 'mid' && <rect x="1.5" y="1.5" width="7" height="7" transform="rotate(45 5 5)" fill={color} />}
      {category === 'large' && <rect x="0.8" y="0.8" width="8.4" height="8.4" rx="1.4" fill={color} />}
      {category === 'unclassified' && <circle cx="5" cy="5" r="3.6" fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="2 1.5" />}
    </svg>
  );
}

export function CategoryTag({ category, withName = true }: { category: CompanyCategoryOrUnclassified; withName?: boolean }) {
  return (
    <span className="jr-cat">
      <CategoryMark category={category} />
      {withName && <span>{CATEGORY_NAME[category]}</span>}
    </span>
  );
}

const LABEL_META: Record<SkillLabel, { text: string; icon: string }> = {
  foundational: { text: 'Foundational', icon: school },
  established: { text: 'Established', icon: checkmarkCircle },
  growing: { text: 'Growing', icon: trendingUp },
  emerging: { text: 'Emerging', icon: sparkles },
  specialized: { text: 'Specialized', icon: cube },
  declining: { text: 'Declining', icon: trendingDown },
  uncertain: { text: 'Uncertain', icon: helpCircle },
};

export function LabelBadge({ label }: { label: SkillLabel }) {
  const m = LABEL_META[label];
  return (
    <span className="jr-label" style={{ ['--lbl' as string]: `var(--lbl-${label})` }}>
      <IonIcon icon={m.icon} aria-hidden="true" />
      {m.text}
    </span>
  );
}

export function EvidenceDots({ quality }: { quality: EvidenceQuality }) {
  const n = quality === 'high' ? 3 : quality === 'medium' ? 2 : 1;
  return (
    <span className="jr-evq" title={`Evidence quality: ${quality}`}>
      <span className="jr-evq__dots" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= n ? 'on' : ''} />
        ))}
      </span>
      <span className="jr-small jr-muted">{quality === 'high' ? 'Strong evidence' : quality === 'medium' ? 'Some evidence' : 'Low evidence'}</span>
    </span>
  );
}

export function ScoreRing({ value, size = 44, label }: { value: number | null; size?: number; label?: string }) {
  const stroke = size >= 60 ? 7 : 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  const color = value == null ? 'var(--border-strong)' : v >= 75 ? 'var(--success)' : v >= 60 ? 'var(--primary)' : v >= 45 ? 'var(--warning)' : 'var(--text-3)';
  return (
    <div className="jr-ring" style={{ width: size, height: size }} role="img" aria-label={label ?? (value == null ? 'Match not scored' : `Match ${v} out of 100`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {value != null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      <span className="jr-ring__num mono" style={{ fontSize: size >= 60 ? 22 : 14 }}>
        {value == null ? <IonIcon icon={remove} /> : v}
      </span>
    </div>
  );
}

export function RequirementKey({ showMentioned = true }: { showMentioned?: boolean }) {
  return (
    <div className="jr-key" aria-label="Legend">
      <span>
        <i className="jr-key__sw" style={{ background: 'var(--req)' }} />
        Required
      </span>
      <span>
        <i className="jr-key__sw" style={{ background: 'var(--pref)' }} />
        Preferred
      </span>
      {showMentioned && (
        <span>
          <i className="jr-key__sw" style={{ background: 'var(--ment)' }} />
          Mentioned
        </span>
      )}
    </div>
  );
}

export const IconFlask = flask;
