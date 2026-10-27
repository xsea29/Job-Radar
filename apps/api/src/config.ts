import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { BoardConfig } from '@jobradar/ingest';

const Board = z.object({
  ats: z.enum(['greenhouse', 'lever', 'ashby']),
  token: z.string().min(1),
  companyName: z.string().min(1),
  industry: z.string().optional(),
  hqCity: z.string().optional(),
  /** Headcount you can source and stand behind. Omit it and the company stays "unclassified". */
  employees: z.number().int().positive().optional(),
  fundingStage: z.string().optional(),
  listed: z.boolean().optional(),
  countries: z.number().int().positive().optional(),
  manualCategory: z.enum(['startup', 'mid', 'large']).optional(),
  source: z.string().optional(),
  estimated: z.boolean().optional(),
  region: z.enum(['eu']).optional(),
});

export const BoardsFile = z.object({ boards: z.array(Board) }).passthrough();

export function loadBoards(path: string): BoardConfig[] {
  const parsed = BoardsFile.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`Invalid boards file ${path}:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  const seen = new Set<string>();
  for (const b of parsed.data.boards) {
    const k = `${b.ats}:${b.token}`;
    if (seen.has(k)) throw new Error(`Duplicate board ${k} in ${path}`);
    seen.add(k);
  }
  return parsed.data.boards;
}
