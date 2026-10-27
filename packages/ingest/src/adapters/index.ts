import type { AtsKind, SourceAdapter } from '../types';
import { ashbyAdapter } from './ashby';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';

export const ADAPTERS: Record<AtsKind, SourceAdapter> = { greenhouse: greenhouseAdapter, lever: leverAdapter, ashby: ashbyAdapter };
