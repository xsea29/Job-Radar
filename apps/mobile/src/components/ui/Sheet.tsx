import { IonContent, IonIcon, IonModal } from '@ionic/react';
import { close } from 'ionicons/icons';
import type { ReactNode } from 'react';

export function Sheet({ open, onClose, title, children, size = 'half', footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'half' | 'tall' | 'full'; footer?: ReactNode }) {
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} className={`jr-modal jr-modal--${size}`}>
      <div className="jr-sheet">
        <span className="jr-sheet__grab" aria-hidden="true" />
        <div className="jr-sheet__head">
          <h2 className="jr-h2">{title}</h2>
          <button type="button" className="jr-icon-btn" onClick={onClose} aria-label="Close">
            <IonIcon icon={close} />
          </button>
        </div>
        <IonContent className="jr-sheet__content">
          <div className="jr-sheet__body">{children}</div>
        </IonContent>
        {footer && <div className="jr-sheet__foot">{footer}</div>}
      </div>
    </IonModal>
  );
}
