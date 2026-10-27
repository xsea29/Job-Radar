import { IonIcon } from '@ionic/react';
import { close, search } from 'ionicons/icons';

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="jr-search">
      <IonIcon icon={search} aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {value && (
        <button type="button" className="jr-icon-btn" onClick={() => onChange('')} aria-label="Clear search">
          <IonIcon icon={close} />
        </button>
      )}
    </div>
  );
}
