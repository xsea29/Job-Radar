import { IonIcon } from '@ionic/react';
import { checkmark, chevronForward } from 'ionicons/icons';
import type { CSSProperties, ElementType, ReactNode } from 'react';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export function Card({ children, className = '', flush, tone, as: Tag = 'section', style }: { children: ReactNode; className?: string; flush?: boolean; tone?: 'warn' | 'accent' | 'primary'; as?: ElementType; style?: CSSProperties }) {
  return (
    <Tag className={`jr-card ${flush ? 'jr-card--flush' : ''} ${tone ? `jr-card--${tone}` : ''} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

export function SectionHeader({ title, action, subtitle }: { title: string; action?: ReactNode; subtitle?: string }) {
  return (
    <div className="jr-section-header">
      <div>
        <h2 className="jr-h3">{title}</h2>
        {subtitle && <p className="jr-small jr-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Overline({ children }: { children: ReactNode }) {
  return <span className="jr-overline">{children}</span>;
}

export function Badge({ tone = 'neutral', children, icon, title }: { tone?: Tone; children: ReactNode; icon?: string; title?: string }) {
  return (
    <span className={`jr-badge jr-badge--${tone}`} title={title}>
      {icon && <IonIcon icon={icon} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Chip({ selected, onClick, children, icon, disabled, ariaLabel }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: string; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button type="button" className={`jr-chip ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {selected ? <IonIcon icon={checkmark} aria-hidden="true" /> : icon ? <IonIcon icon={icon} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  icon,
  block,
  disabled,
  type = 'button',
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  block?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  size?: 'sm';
}) {
  return (
    <button type={type} className={`jr-btn jr-btn--${variant} ${block ? 'jr-btn--block' : ''} ${size === 'sm' ? 'jr-btn--sm' : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <IonIcon icon={icon} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`jr-card jr-card--flush jr-list ${className}`}>{children}</div>;
}

export function Row({
  leading,
  title,
  subtitle,
  meta,
  onClick,
  chevron = true,
  children,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  children?: ReactNode;
}) {
  const inner = (
    <>
      {leading && <div className="jr-row__lead">{leading}</div>}
      <div className="jr-row__main">
        <div className="jr-row__title">{title}</div>
        {subtitle && <div className="jr-row__sub">{subtitle}</div>}
        {children}
      </div>
      {meta && <div className="jr-row__meta">{meta}</div>}
      {onClick && chevron && <IonIcon className="jr-row__chev" icon={chevronForward} aria-hidden="true" />}
    </>
  );
  return onClick ? (
    <button type="button" className="jr-row jr-row--tap" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="jr-row">{inner}</div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="jr-stat">
      <span className="jr-overline">{label}</span>
      <span className="jr-stat__value mono">{value}</span>
      {note && <span className="jr-small jr-muted">{note}</span>}
    </div>
  );
}

export function ProgressBar({ value, max, label, tone = 'primary' }: { value: number; max: number; label: string; tone?: 'primary' | 'warning' }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="jr-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={`jr-progress__fill jr-progress__fill--${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="jr-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-selected' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false, meta }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; meta?: ReactNode }) {
  return (
    <details className="jr-collapse" open={defaultOpen}>
      <summary>
        <span className="jr-collapse__title">{title}</span>
        {meta}
        <IonIcon icon={chevronForward} className="jr-collapse__chev" aria-hidden="true" />
      </summary>
      <div className="jr-collapse__body">{children}</div>
    </details>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="jr-field">
      <label className="jr-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="jr-small jr-muted">{hint}</span>}
    </div>
  );
}
