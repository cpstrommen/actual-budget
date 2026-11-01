#!/usr/bin/env node
// Offline recovery from a native Actual CFM ZIP. No server or credentials used.
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function exportOffline(input, outputDirectory, api) {
  const source = await readFile(path.resolve(input));
  const temporary = await mkdtemp(path.join(tmpdir(), 'actual-cfm-recovery-'));
  let initialized = false;
  try {
    await api.init({ dataDir: temporary });
    initialized = true;
    await api.importBudget(source, { filename: path.basename(input) });
    const exported = await api.exportForActualBudget();
    const destination = path.resolve(outputDirectory);
    await mkdir(destination, { mode: 0o700 });
    // Never overwrite an earlier recovery or the source backup.
    await writeFile(
      path.join(destination, 'actual-budget.zip'),
      exported.data,
      { flag: 'wx', mode: 0o600 },
    );
    await writeFile(
      path.join(destination, 'cfm-recovery.zip'),
      exported.archive,
      { flag: 'wx', mode: 0o600 },
    );
    await writeFile(
      path.join(destination, 'receipt.json'),
      JSON.stringify(exported.receipt, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
    return exported.receipt;
  } finally {
    try {
      if (initialized) await api.shutdown();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

async function main() {
  const [input, outputDirectory, ...extra] = process.argv.slice(2);
  if (!input || input === '--help' || !outputDirectory || extra.length) {
    process.stdout.write(
      'Usage: node scripts/cfm-export-upstream.mjs <native-cfm-backup.zip> <new-output-directory>\nBuild this release first with yarn build:api. Works offline; output files contain unencrypted financial data.\n',
    );
    if (input !== '--help') process.exitCode = 1;
    return;
  }
  const api = await import(
    pathToFileURL(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../packages/api/dist/index.js',
      ),
    ).href
  );
  const receipt = await exportOffline(input, outputDirectory, api);
  process.stdout.write(
    `Exported for Actual Budget ${receipt.targetVersion}. Compare the receipt and retain cfm-recovery.zip.\n`,
  );
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    process.stderr.write(`Recovery failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
