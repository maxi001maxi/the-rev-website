// Builds the one-paste Apps Script bundle from the versioned Editorial GAS sources.
//   node scripts/build-gas-bundle.mjs          -> writes the bundle
//   node scripts/build-gas-bundle.mjs --check  -> exits 1 when the bundle is stale
//
// The bundle is what gets pasted into the bound Apps Script project, so it must
// never drift from the source files that the tests execute.

import fs from 'node:fs';

const DIR = new URL('../editorial/gas/', import.meta.url);
const SOURCES = ['DailyEditorialGate_v0.6.9.gs', 'DailyEditorialCreator_v0.6.9.gs', 'DailyEditorialTopicApproval_v0.7.0.gs', 'DailyEditorialSupervisorRecovery_v0.7.1.gs'];
export const BUNDLE = 'DailyEditorialAutonomy_v0.6.9_ONE_PASTE.gs';

const HEADER = `/**
 * THE REV. Daily Editorial Autonomy v0.6.9
 * ONE-PASTE INSTALL BUNDLE
 *
 * Generated from:
 * - DailyEditorialGate_v0.6.9.gs
 * - DailyEditorialCreator_v0.6.9.gs
 * - DailyEditorialTopicApproval_v0.7.0.gs
 * - DailyEditorialSupervisorRecovery_v0.7.1.gs
 *
 * Paste this entire file into ONE file in the bound Apps Script project,
 * then run installDailyEditorialAutonomyV069() once.
 * Keep the existing v0.6.5.2 Supervisor in the same project.
 * v0.7.1 wraps its generation step with bounded QC crash self-recovery.
 */

`;

const read = (name) => fs.readFileSync(new URL(name, DIR), 'utf8').replace(/\r\n/g, '\n');

export function buildGasBundle() {
  return `${HEADER}${SOURCES.map(read).join('\n\n')}\n`;
}

export function gasBundleIsCurrent() {
  return read(BUNDLE) === buildGasBundle();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-gas-bundle.mjs')) {
  if (process.argv.includes('--check')) {
    if (!gasBundleIsCurrent()) {
      console.error(`${BUNDLE} is stale. Run: npm run build:gas-bundle`);
      process.exit(1);
    }
    console.log(`${BUNDLE}: up to date`);
  } else {
    fs.writeFileSync(new URL(BUNDLE, DIR), buildGasBundle(), 'utf8');
    console.log(`Wrote editorial/gas/${BUNDLE}`);
  }
}
