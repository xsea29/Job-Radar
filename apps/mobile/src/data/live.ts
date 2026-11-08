import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_URL } from './source';

/**
 * Live mode only: the server pushes a small "evidence-updated" signal after each
 * scheduled run; we respond by re-fetching. EventSource reconnects by itself, and
 * `useAnalysis` also polls every few minutes as a fallback (e.g. if a proxy
 * buffers the stream), so the app converges either way.
 */
export function useLiveUpdates(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!API_URL || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${API_URL}/v1/events`);
    const refresh = () => void qc.invalidateQueries({ queryKey: ['analysis'] });
    es.addEventListener('evidence-updated', refresh);
    return () => {
      es.removeEventListener('evidence-updated', refresh);
      es.close();
    };
  }, [qc]);
}
