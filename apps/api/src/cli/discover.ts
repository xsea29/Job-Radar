/**
 * Test candidate companies against the real public ATS APIs and write the ones
 * that exist (and have relevant postings) to boards.json.
 *
 *   npm run discover -w @jobradar/api -- [--candidates config/boards.candidates.json] [--out config/boards.json] [--role fullstack] [--years 4] [--min-relevant 1]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { RoleId } from '@jobradar/core';
import { boardsFromDiscovery, defaultContext, defaultRequest, discoverBoards, summarizeDiscovery, type BoardCandidate } from '@jobradar/ingest';

const { values: a } = parseArgs({
  options: {
    candidates: { type: 'string', default: 'config/boards.candidates.json' },
    out: { type: 'string', default: 'config/boards.json' },
    role: { type: 'string', default: 'fullstack' },
    years: { type: 'string', default: '4' },
    'min-relevant': { type: 'string', default: '1' },
  },
});

const file = JSON.parse(readFileSync(a.candidates!, 'utf8')) as { defaults?: Partial<BoardCandidate>; candidates: BoardCandidate[] };
const cands = file.candidates.map((c) => ({ ...file.defaults, ...c }));
const role = a.role as RoleId;
const years = Number(a.years);
const adjacent: Record<RoleId, RoleId[]> = { fullstack: ['fullstack', 'software'], backend: ['backend', 'software'], frontend: ['frontend', 'software'], software: ['software', 'fullstack', 'backend', 'frontend'] };
const req = defaultRequest({ targetRoleId: role, acceptedRoleIds: adjacent[role], experience: { min: Math.max(0, years - 1), max: years + 2 }, postedWithinDays: 90 });

console.log(`Checking ${cands.length} candidates against the public ATS APIs (≈0.4 s between requests)…`);
const rows = await discoverBoards(cands, defaultContext(), req, (row, i, n) => {
  const f = row.found;
  const state = f ? `${f.board.ats}/${f.board.token}: ${f.postings} postings, ${f.relevant} relevant` : row.tried.every((t) => t.outcome === 'error') ? `INCONCLUSIVE (${row.tried[0]?.detail ?? 'error'})` : 'no public board found';
  console.log(`  [${String(i).padStart(2)}/${n}] ${row.candidate.name.padEnd(14)} ${state}`);
});

const s = summarizeDiscovery(rows);
console.log(`\n${s.found} found · ${s.notFound} not found · ${s.inconclusive} inconclusive · ${s.withRelevantJobs} with relevant jobs`);
if (s.inconclusive > 0) console.log(`! ${s.inconclusive} candidate(s) could not be checked (network blocked or errors). Nothing is concluded about them.`);

const boards = boardsFromDiscovery(rows, Number(a['min-relevant']));
if (boards.length === 0) {
  console.log(`No boards qualified, so ${a.out} was NOT written.`);
  process.exit(s.found === 0 && s.inconclusive === s.checked ? 3 : 0);
}
writeFileSync(a.out!, JSON.stringify({ _generated: `by discover on ${new Date().toISOString()}; verified against the live APIs`, boards }, null, 2) + '\n');
console.log(`Wrote ${boards.length} board(s) to ${a.out}. Run: npm run scan -w @jobradar/api -- --boards ${a.out}`);
