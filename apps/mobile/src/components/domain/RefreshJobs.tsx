import { refresh } from 'ionicons/icons';
import { IS_DEMO } from '../../data/source';
import { describeOutcome, useRefreshJobs } from '../../data/refresh';
import { dateTime } from '../../lib/format';
import { Button } from '../ui/Primitives';

/** "Update jobs" button (live mode only): asks the server to fetch the latest postings, then the app reloads them. */
export function RefreshJobs({ variant = 'primary', block }: { variant?: 'primary' | 'secondary'; block?: boolean }) {
  const m = useRefreshJobs();
  if (IS_DEMO) return null;
  return (
    <div className="jr-stack jr-refresh">
      <Button variant={variant} block={block} icon={refresh} disabled={m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? 'Fetching latest jobs…' : 'Update jobs now'}
      </Button>
      <div aria-live="polite" className="jr-small jr-muted">
        {m.isPending && 'Reading the company job boards. This usually takes under a minute, longer if the server is waking up.'}
        {m.isError && <span className="jr-refresh__err">{m.error.message}</span>}
        {m.isSuccess && describeOutcome(m.data, dateTime)}
      </div>
    </div>
  );
}
