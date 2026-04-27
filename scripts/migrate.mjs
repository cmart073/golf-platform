#!/usr/bin/env node
// Runs every migrations/*.sql against the configured D1 database in
// lexicographic order so a new migration only needs to be dropped into
// the directory — no package.json edit required.
//
// Usage:
//   node scripts/migrate.mjs --local
//   node scripts/migrate.mjs --remote
//   node scripts/migrate.mjs --remote --from 0009   # only 0009 onward
//
// D1 has no built-in migration tracking; this runner relies on every
// migration being idempotent (CREATE IF NOT EXISTS / ALTER ADD COLUMN
// guarded by manual checks) which matches the existing convention.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : '--local';
const fromIdx = args.indexOf('--from');
const fromPrefix = fromIdx >= 0 ? args[fromIdx + 1] : null;

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => (fromPrefix ? f >= fromPrefix : true));

if (files.length === 0) {
  console.error('No migrations to run.');
  process.exit(1);
}

console.log(`Applying ${files.length} migration(s) ${target}:`);
for (const f of files) console.log('  •', f);

for (const f of files) {
  const filePath = join('migrations', f);
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', 'golf-db', target, `--file=${filePath}`],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error(`\n✗ Migration failed: ${f}`);
    process.exit(result.status || 1);
  }
}
console.log('\n✓ All migrations applied.');
