#!/usr/bin/env node
/**
 * Copy non-TypeScript runtime assets into dist/ after `tsc`.
 *
 * `tsc` emits only JavaScript. Anything the application reads at runtime that
 * is not a .ts file has to be copied deliberately, or it simply will not exist
 * in a built tree. Migrations are resolved relative to the compiled output:
 *
 *   MigrationService: join(__dirname, '../database/migrations')
 *                     -> dist/database/migrations
 *
 * so they must live under dist/. Assets resolved from process.cwd() — prompts/
 * and config/ — stay where they are and are copied into the image by the
 * Dockerfile instead.
 *
 * Run automatically as part of `npm run build`.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

/** @type {Array<{from: string, to: string, label: string}>} */
const ASSETS = [
  {
    from: path.join(repoRoot, 'src', 'database', 'migrations'),
    to: path.join(repoRoot, 'dist', 'database', 'migrations'),
    label: 'SQL migrations',
  },
];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
      count += 1;
    }
  }
  return count;
}

let failed = false;

for (const asset of ASSETS) {
  if (!fs.existsSync(asset.from)) {
    console.error(`✗ ${asset.label}: source directory missing (${asset.from})`);
    failed = true;
    continue;
  }
  const count = copyDir(asset.from, asset.to);
  console.log(`✓ ${asset.label}: copied ${count} file(s) -> ${path.relative(repoRoot, asset.to)}`);

  // A build that silently produces zero migrations is the failure this whole
  // script exists to prevent, so treat it as a build error rather than a note.
  if (count === 0) {
    console.error(`✗ ${asset.label}: copied nothing — refusing to produce an incomplete build`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
