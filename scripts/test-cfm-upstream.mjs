#!/usr/bin/env node
// A real import/export through the untouched pinned upstream core and API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { unzipSync } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
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
  ])
    symlinkSync(
      path.join(upstream, 'packages', folder),
      path.join(modules, '@actual-app', name),
    );
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
    await api.init({dataDir:path.join(destination,'cfm')});
    try {
      let checking,card,category;
      await api.runImport('CFM portability acceptance',async()=>{
        checking=await api.createAccount({name:'Checking',offbudget:false});
        card=await api.createAccount({name:'Card',offbudget:false});
        const group=await api.createCategoryGroup({name:'Expenses',is_income:false});
        category=await api.createCategory({name:'Entertainment',group_id:group,is_income:false});
        await api.addTransactions(checking,[{id:'opening-checking',date:'2026-01-01',amount:100000,notes:'Original note',cleared:true,reconciled:true},{id:'refund',date:'2026-02-01',amount:1000,category}]);
        await api.addTransactions(card,[{id:'tickets',date:'2026-01-10',amount:-40000,category,notes:'Four tickets'}]);
      });
      const ar=await api.createCfmAccount({name:'Receivables',kind:'receivable',initialBalance:0,date:'2026-01-01',currency:'USD',requestId:'ar'});
      for(const friend of ['Alice','Bob','Carol'])await api.saveCfmRecord({id:friend,kind:'obligation',updatedAt:new Date().toISOString(),data:{accountId:ar.accountId,direction:'receivable',counterparty:friend,amount:10000,currency:'USD',date:'2026-01-10',sourceTransactionId:'tickets',categoryId:category}});
      await api.settleCfmObligation({obligationId:'Alice',amount:10000,date:'2026-02-01',accountId:checking,kind:'payment',requestId:'payment'});
      const asset=await api.createCfmAccount({name:'Property',kind:'asset',initialBalance:30000000,date:'2026-01-01',currency:'USD',requestId:'property'});
      await api.setCfmBalance({accountId:asset.accountId,targetBalance:31000000,date:'2026-06-01',reason:'Appraisal',requestId:'appraisal'});
      await api.saveCfmRecord({id:'annual-plan',kind:'annual-plan',updatedAt:new Date().toISOString(),data:{year:2026,categoryId:category,amount:120000,currency:'USD',revision:1}});
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
      )
        continue;
      const quote = `"${table.replaceAll('"', '""')}"`;
      const derivedFilter=table==='__meta__'?" WHERE key!='view-hash'":'';
      const original = before.prepare(`SELECT * FROM ${quote}${derivedFilter}`).all();
      const imported = after.prepare(`SELECT * FROM ${quote}${derivedFilter}`).all();
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
  execute(process.execPath, [
    path.join(root, 'scripts/cfm-export-upstream.mjs'),
    path.join(temporary, 'native.zip'),
    path.join(temporary, 'offline'),
  ]);
  process.stdout.write(
    `PASS: ${count} records, every dated ledger movement, native backup, and offline recovery survived the upstream round trip.\n`,
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  if (process.env.CFM_KEEP_TEST_FILES)
    process.stdout.write(`Fixtures retained at ${temporary}\n`);
  else rmSync(temporary, { recursive: true, force: true });
}
