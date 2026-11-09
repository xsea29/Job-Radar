import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_URL } from './source';

/** What POST /v1/refresh answers. The server decides; the app only reports it. */
export interface RefreshReply {
  status: 'done' | 'started' | 'already-ran' | 'busy';
  lastRunAt?: string | null;
  result?: { newPostings?: number; validPostings?: number; failedBoards?: string[] };
}

export type RefreshOutcome =
  | { kind: 'updated'; newPostings: number; failedBoards: number; lastRunAt?: string | null }
  | { kind: 'recent'; lastRunAt?: string | null }
  | { kind: 'busy' }
  | { kind: 'running' };

// A sleeping free server needs up to a minute to wake, then the scan itself can take a while.
const TIMEOUT_MS = 150_000;

export class RefreshError extends Error {}

/** Ask the server to fetch the latest jobs. Throws RefreshError with a message fit for the screen. */
export async function requestRefresh(baseUrl: string | undefined = API_URL, fetchImpl: typeof fetch = fetch): Promise<RefreshOutcome> {
  if (!baseUrl) throw new RefreshError('This build is not connected to a server, so there is nothing to update.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/v1/refresh`, { method: 'POST', headers: { Accept: 'application/json' }, signal: ctl.signal });
  } catch (e) {
    throw new RefreshError(
      (e as Error).name === 'AbortError'
        ? 'The server took too long to answer. It may be waking up; try again in a minute.'
        : 'Could not reach the server. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new RefreshError('Too many attempts. Wait a minute and try again.');
  if (res.status === 501) throw new RefreshError('Updating from the app is turned off on this server.');
  if (!res.ok) throw new RefreshError(`The server could not run the update (error ${res.status}).`);
  const body = (await res.json().catch(() => null)) as RefreshReply | null;
  if (!body || typeof body.status !== 'string') throw new RefreshError('The server sent an answer the app does not understand.');
  switch (body.status) {
    case 'done':
      return { kind: 'updated', newPostings: body.result?.newPostings ?? 0, failedBoards: body.result?.failedBoards?.length ?? 0, lastRunAt: body.lastRunAt };
    case 'already-ran':
      return { kind: 'recent', lastRunAt: body.lastRunAt };
    case 'busy':
      return { kind: 'busy' };
    default:
      return { kind: 'running' };
  }
}

/** Plain-language result line. Never claims more than the server reported. */
export function describeOutcome(o: RefreshOutcome, fmt: (iso: string) => string): string {
  switch (o.kind) {
    case 'updated': {
      const n = o.newPostings === 0 ? 'No new jobs since the last update.' : `${o.newPostings} new ${o.newPostings === 1 ? 'job' : 'jobs'} found.`;
      return o.failedBoards ? `${n} ${o.failedBoards} ${o.failedBoards === 1 ? 'company board' : 'company boards'} could not be read this time.` : n;
    }
    case 'recent':
      return `Jobs were updated moments ago${o.lastRunAt ? ` (${fmt(o.lastRunAt)})` : ''}, so you already have the latest.`;
    case 'busy':
      return 'An update is already in progress. The app will refresh when it finishes.';
    case 'running':
      return 'The update is still running on the server. The app will refresh when it finishes.';
  }
}

export function useRefreshJobs() {
  const qc = useQueryClient();
  return useMutation<RefreshOutcome, RefreshError>({
    mutationFn: () => requestRefresh(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['analysis'] }),
  });
}
