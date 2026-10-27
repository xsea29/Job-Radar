/**
 * Run one scan against the configured public ATS boards and store the result.
 *
 *   npm run scan -w @jobradar/api -- --boards config/boards.json [--role fullstack] [--years 4] [--dry-run]
 *
 * Reads only public, unauthenticated job-board APIs. Never invents data: boards
 * that cannot be read are reported as failures and the scan stays honest (n/100).
 */
import { parseArgs } from 'node:util';
import { REJECTION_LABELS, type RoleId } from '@jobradar/core';
import { collectBoards, buildScan, defaultContext, defaultRequest, type FetchResult } from '@jobradar/ingest';
import { loadBoards } from '../config';
import { connect } from '../db/connect';
import { migrate } from '../db/migrate';
import { saveScan, seedReference } from '../db/repo';

const { values: a } = parseArgs({
  options: {
    boards: { type: 'string', default: 'config/boards.json' },
    role: { type: 'string', default: 'fullstack' },
    years: { type: 'string', default: '4' },
    cities: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const roleId = a.role as RoleId;
const years = Number(a.years);
const boards = loadBoards(a.boards!);
if (boards.length === 0) {
  console.error(`No boards configured in ${a.boards}. Add companies' public ATS board tokens (see config/boards.example.json).`);
  process.exit(2);
}

const ADJACENT: Record<RoleId, RoleId[]> = { fullstack: ['fullstack', 'software'], backend: ['backend', 'software'], frontend: ['frontend', 'software'], software: ['software', 'fullstack', 'backend', 'frontend'] };
const request = defaultRequest({ targetRoleId: roleId, acceptedRoleIds: ADJACENT[roleId], experience: { min: Math.max(0, years - 1), max: years + 2 }, cities: a.cities ? a.cities.split(',').map((s) => s.trim()) : [], now: new Date() });

const startedAt = new Date();
console.log(`Fetching ${boards.length} public board(s)…`);
const results: FetchResult[] = await collectBoards(boards, defaultContext(), (done, total, r) => {
  const rep = r.report;
  console.log(`  [${done}/${total}] ${rep.boardKey.padEnd(36)} ${rep.status === 'ok' ? `ok, ${rep.fetched} postings` : `FAILED (${rep.error})`}`);
});

const outcome = buildScan(results, { ...request, now: new Date() });
const s = outcome.summary;
console.log(`\nValid job descriptions: ${s.label}  (${s.state === 'complete' ? 'complete' : 'PARTIAL: not a completed scan'})`);
console.log(`Retrieved ${s.retrieved} · duplicates ${s.duplicates} · inaccessible ${s.inaccessible} · rejected ${s.rejected} · remaining ${s.remaining}`);
for (const [k, v] of Object.entries(s.rejectedByReason)) console.log(`  rejected — ${REJECTION_LABELS[k as keyof typeof REJECTION_LABELS]}: ${v}`);
console.log(`By company type: ${s.quotas.map((q) => `${q.category} ${q.valid}/${q.target}`).join(' · ')}${s.unclassified ? ` · ${s.unclassified} unclassified` : ''}`);
for (const b of outcome.broadening) console.log(`  widened: ${b}`);
for (const w of s.warnings) console.log(`  ! ${w}`);

if (a['dry-run']) {
  console.log('\n--dry-run: nothing stored.');
} else {
  const db = await connect();
  await migrate(db);
  await seedReference(db);
  const finishedAt = new Date();
  const label = finishedAt.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
  const saved = await saveScan(db, { outcome, request, boards, startedAt, finishedAt, snapshotLabel: label });
  console.log(`\nStored scan ${saved.scanId} (${saved.changedJobs} changed postings).`);
  await db.close();
}
