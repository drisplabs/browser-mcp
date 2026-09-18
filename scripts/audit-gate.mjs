#!/usr/bin/env node
/**
 * Security Audit gate.
 *
 * `npm audit` alone is a poor CI gate for this repo: it fails on any high
 * advisory, including ones with no patched release, so the check sits
 * permanently red and stops carrying signal. This gate keeps the check
 * meaningful instead:
 *
 *   - fail on any high/critical advisory that is NOT explicitly allowlisted
 *   - fail on an allowlist entry that has expired (suppressions must be renewed)
 *   - fail on an allowlist entry that no longer matches any advisory (stale)
 *
 * The allowlist lives in .github/audit-allowlist.json and every entry carries a
 * reason and an expiry date, so a suppression cannot quietly become permanent.
 *
 * Usage: node scripts/audit-gate.mjs [--audit-level=high]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ALLOWLIST_PATH = resolve(REPO_ROOT, '.github/audit-allowlist.json');

const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];
const levelArg = process.argv.find((a) => a.startsWith('--audit-level='));
const MIN_SEVERITY = levelArg ? levelArg.split('=')[1] : 'high';
const MIN_RANK = SEVERITY_ORDER.indexOf(MIN_SEVERITY);

if (MIN_RANK === -1) {
  console.error(`Unknown --audit-level: ${MIN_SEVERITY}`);
  process.exit(2);
}

/** `npm audit --json` exits non-zero when it finds anything; capture output regardless. */
function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
   });
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.trim()) return err.stdout;
    throw err;
  }
}

/** Flatten npm's nested advisory graph into one row per (package, GHSA). */
function collectAdvisories(report) {
  const rows = [];
  for (const [name, node] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of node.via ?? []) {
      // String entries are "vulnerable because a dependency is" links, not advisories.
      if (typeof via === 'string') continue;
      const ghsa = (via.url ?? '').split('/').pop() || via.source?.toString() || 'UNKNOWN';
      rows.push({
        package: name,
        ghsa,
        severity: via.severity ?? node.severity,
        title: via.title ?? '(no title)',
        url: via.url ?? '',
        isDirect: node.isDirect === true,
      });
    }
  }
  return rows;
}

const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
const entries = allowlist.allow ?? [];
const today = new Date().toISOString().slice(0, 10);

const report = JSON.parse(runAudit());
const advisories = collectAdvisories(report);
const gating = advisories.filter((a) => SEVERITY_ORDER.indexOf(a.severity) >= MIN_RANK);

const allowedByGhsa = new Map(entries.map((e) => [e.ghsa, e]));
const matchedGhsas = new Set();
const blocking = [];

for (const adv of gating) {
  const entry = allowedByGhsa.get(adv.ghsa);
  if (!entry) {
    blocking.push({ ...adv, why: 'not allowlisted' });
    continue;
  }
  matchedGhsas.add(adv.ghsa);
  if (entry.expires < today) {
    blocking.push({ ...adv, why: `allowlist entry expired on ${entry.expires}` });
  }
}

const stale = entries.filter((e) => !matchedGhsas.has(e.ghsa));
const counts = report.metadata?.vulnerabilities ?? {};

console.log('Security Audit gate');
console.log(`  gating at: ${MIN_SEVERITY} and above`);
console.log(
  `  npm audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ` +
    `${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low`
);
console.log(`  allowlisted: ${matchedGhsas.size} of ${entries.length} entries matched`);
console.log('');

for (const ghsa of matchedGhsas) {
  const e = allowedByGhsa.get(ghsa);
  console.log(`  ALLOWED  ${e.severity.padEnd(8)} ${e.package} ${ghsa} (expires ${e.expires})`);
}

if (stale.length > 0) {
  console.log('');
  console.log('Stale allowlist entries — these no longer match any advisory and must be removed:');
  for (const e of stale) {
    console.log(`  STALE    ${e.package} ${e.ghsa}`);
  }
}

if (blocking.length > 0) {
  console.log('');
  console.log('Blocking advisories:');
  for (const b of blocking) {
    console.log(`  BLOCK    ${b.severity.padEnd(8)} ${b.package} ${b.ghsa} — ${b.why}`);
    console.log(`           ${b.title}`);
    if (b.url) console.log(`           ${b.url}`);
  }
  console.log('');
  console.log('Fix the advisory, or add a justified, expiring entry to .github/audit-allowlist.json.');
}

if (blocking.length > 0 || stale.length > 0) {
  process.exit(1);
}

console.log('');
console.log('No unmanaged high or critical advisories.');
