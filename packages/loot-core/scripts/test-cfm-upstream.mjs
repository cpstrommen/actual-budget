#!/usr/bin/env node
// A real import/export through the untouched pinned upstream core and API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(
  readFileSync(
    path.join(root, 'packages/loot-core/src/server/cfm/upstream-schema.json'),
    'utf8',
  ),
);
const temporary = mkdtempSync(path.join(tmpdir(), 'cfm-upstream-import-'));
const execute = (command, args, cwd = root, env = {}) =>
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    timeout: 120000,
    maxBuffer: 128 * 1024 * 1024,
  });
try {
  const upstream = path.join(temporary, 'upstream');
  mkdirSync(upstream);
  const archive = execute('git', [
    'archive',
    manifest.commit,
    'packages/loot-core',
    'packages/api',
    'packages/crdt',
    'packages/vite-plugin-peggy',
    'tsconfig.json',
    'package.json',
  ]);
  execFileSync('tar', ['-x', '-C', upstream], { input: archive });
  const modules = path.join(upstream, 'node_modules');
  mkdirSync(modules);
  for (const entry of readdirSync(path.join(root, 'node_modules'))) {
    if (entry === '@actual-app') continue;
    symlinkSync(
      path.join(root, 'node_modules', entry),
      path.join(modules, entry),
    );
  }
  mkdirSync(path.join(modules, '@actual-app'));
  for (const [name, folder] of [
    ['core', 'loot-core'],
    ['api', 'api'],
    ['crdt', 'crdt'],
    ['vite-plugin-peggy', 'vite-plugin-peggy'],
  ]) {
    symlinkSync(
      path.join(upstream, 'packages', folder),
      path.join(modules, '@actual-app', name),
    );
  }
  execute(
    process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'],
    path.join(upstream, 'packages/api'),
  );
  process.stdout.write(
    `Built unmodified upstream ${manifest.upstreamVersion} (${manifest.commit}).\n`,
  );
  const fixtureCode = `
    import * as api from ${JSON.stringify(pathToFileURL(path.join(root, 'packages/api/dist/index.js')).href)};
    import {writeFile,mkdir} from 'node:fs/promises';
    import path from 'node:path';
    const destination=process.env.CFM_TEST_DIR;
    await mkdir(path.join(destination,'cfm'));
    const engine=await api.init({dataDir:path.join(destination,'cfm')});
    try {
      const {createCfmExample}=await import(${JSON.stringify(pathToFileURL(path.join(root, 'scripts/create-cfm-example.mjs')).href)});
      const {checking,category}=await createCfmExample(api);
      await api.addTransactions(checking,Array.from({length:2000},(_,index)=>({id:'history-'+index,date:'2025-12-'+String(index%28+1).padStart(2,'0'),amount:index%3===0?0:index%3===1?123:-123,notes:'Historical imported entry '+index,cleared:index%2===0,reconciled:index%4===0,category})));
      const closed=await api.createAccount({name:'Closed account',offbudget:true});
      await api.addTransactions(closed,[{id:'closed-zero',date:'2025-12-31',amount:0,notes:'Retain zero entry'}]);await api.closeAccount(closed);
      await api.addTransactions(checking,[{id:'deleted-entry',date:'2026-01-01',amount:-123,notes:'Deletion audit'}]);await api.deleteTransaction('deleted-entry');
      // Local databases of unlocked encrypted budgets are plaintext; retain the source key identifier in the backup, never the upstream target.
      await engine.send('save-prefs',{encryptKeyId:'synthetic-encrypted-source-key'});
      const native=await api.exportBudget();await writeFile(path.join(destination,'native.zip'),native);
      const result=await api.exportForActualBudget();
      await writeFile(path.join(destination,'compatible.zip'),result.data);
      await writeFile(path.join(destination,'archive.zip'),result.archive);
      await writeFile(path.join(destination,'receipt.json'),JSON.stringify(result.receipt));
    }finally{await api.shutdown();}
  `;
  execute(process.execPath, ['--input-type=module', '-e', fixtureCode], root, {
    CFM_TEST_DIR: temporary,
  });
  const importCode = `
    import * as api from ${JSON.stringify(pathToFileURL(path.join(upstream, 'packages/api/dist/index.js')).href)};
    import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
    const destination=process.env.CFM_TEST_DIR;await mkdir(path.join(destination,'actual'));
    await api.init({dataDir:path.join(destination,'actual')});
    try{await api.importBudget(await readFile(path.join(destination,'compatible.zip')));await writeFile(path.join(destination,'upstream-roundtrip.zip'),await api.exportBudget());}finally{await api.shutdown();}
  `;
  execute(
    process.execPath,
    ['--input-type=module', '-e', importCode],
    upstream,
    { CFM_TEST_DIR: temporary },
  );
  function openZip(filename) {
    const files = unzipSync(readFileSync(path.join(temporary, filename)));
    const databasePath = path.join(temporary, `${filename}.sqlite`);
    writeFileSync(databasePath, files['db.sqlite']);
    return new DatabaseSync(databasePath);
  }
  const compatibleFiles = unzipSync(
    readFileSync(path.join(temporary, 'compatible.zip')),
  );
  assert.equal(
    JSON.parse(new TextDecoder().decode(compatibleFiles['metadata.json']))
      .encryptKeyId,
    null,
  );
  const recoveryFiles = unzipSync(
    readFileSync(path.join(temporary, 'archive.zip')),
  );
  const originalFiles = unzipSync(recoveryFiles['full-cfm-backup.zip']);
  assert.equal(
    JSON.parse(new TextDecoder().decode(originalFiles['metadata.json']))
      .encryptKeyId,
    'synthetic-encrypted-source-key',
  );
  const before = openZip('compatible.zip'),
    after = openZip('upstream-roundtrip.zip');
  const canonical = rows =>
    JSON.stringify(
      rows
        .map(row =>
          Object.fromEntries(
            Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
          ),
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  let count = 0;
  try {
    for (const table of Object.keys(manifest.tables)) {
      if (
        [
          'kvcache',
          'kvcache_key',
          'messages_crdt',
          'messages_clock',
          'messages_pending',
        ].includes(table)
      ) {
        continue;
      }
      const quote = `"${table.replaceAll('"', '""')}"`;
      const derivedFilter =
        table === '__meta__' ? " WHERE key!='view-hash'" : '';
      const original = before
        .prepare(`SELECT * FROM ${quote}${derivedFilter}`)
        .all();
      const imported = after
        .prepare(`SELECT * FROM ${quote}${derivedFilter}`)
        .all();
      assert.equal(
        canonical(imported),
        canonical(original),
        `${table} changed during unmodified upstream import/export`,
      );
      count += original.length;
    }
    const checkpoints = db =>
      db
        .prepare(
          'SELECT acct,date,SUM(amount) AS movement FROM transactions WHERE tombstone=0 AND isParent=0 GROUP BY acct,date ORDER BY acct,date',
        )
        .all();
    assert.deepEqual(checkpoints(after), checkpoints(before));
  } finally {
    before.close();
    after.close();
  }
  const originalNativeBackup = readFileSync(path.join(temporary, 'native.zip'));
  execute(process.execPath, [
    path.join(root, 'scripts/cfm-export-upstream.mjs'),
    path.join(temporary, 'native.zip'),
    path.join(temporary, 'offline'),
  ]);
  execute(process.execPath, [
    path.join(root, 'scripts/package-cfm-recovery.mjs'),
    path.join(temporary, 'recovery-runtime'),
  ]);
  const runtimeManifest = JSON.parse(
    readFileSync(
      path.join(temporary, 'recovery-runtime/runtime-manifest.json'),
      'utf8',
    ),
  );
  assert.ok(runtimeManifest.files['examples/cfm-2026.zip']);
  assert.ok(
    unzipSync(
      readFileSync(
        path.join(temporary, 'recovery-runtime/examples/cfm-2026.zip'),
      ),
    )['db.sqlite']?.length,
    'The packaged runtime must include a usable example budget',
  );
  execute(
    process.execPath,
    [
      path.join(temporary, 'recovery-runtime/scripts/cfm-export-upstream.mjs'),
      path.join(temporary, 'native.zip'),
      path.join(temporary, 'packaged-offline'),
    ],
    path.join(temporary, 'recovery-runtime'),
  );
  const expected = openZip('compatible.zip');
  try {
    for (const folder of ['offline', 'packaged-offline']) {
      const recovered = openZip(`${folder}/actual-budget.zip`);
      try {
        for (const table of Object.keys(manifest.tables)) {
          const quote = `"${table.replaceAll('"', '""')}"`;
          assert.equal(
            canonical(recovered.prepare(`SELECT * FROM ${quote}`).all()),
            canonical(expected.prepare(`SELECT * FROM ${quote}`).all()),
            `${folder}: ${table} changed during offline recovery`,
          );
        }
      } finally {
        recovered.close();
      }
      const receipt = JSON.parse(
        readFileSync(path.join(temporary, folder, 'receipt.json'), 'utf8'),
      );
      assert.equal(receipt.targetVersion, manifest.upstreamVersion);
      const archive = unzipSync(
        readFileSync(path.join(temporary, folder, 'cfm-recovery.zip')),
      );
      assert.ok(archive['receipt.json']?.length);
      assert.ok(archive['full-cfm-backup.zip']?.length);
    }
  } finally {
    expected.close();
  }
  assert.deepEqual(
    readFileSync(path.join(temporary, 'native.zip')),
    originalNativeBackup,
    'Offline recovery modified its source backup',
  );
  process.stdout.write(
    `PASS: ${count} records, every dated ledger movement, native backup, offline recovery, and packaged-runtime recovery survived the upstream round trip.\n`,
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  if (process.env.CFM_KEEP_TEST_FILES) {
    process.stdout.write(`Fixtures retained at ${temporary}\n`);
  } else {
    rmSync(temporary, { recursive: true, force: true });
  }
}
