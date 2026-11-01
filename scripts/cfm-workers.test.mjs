import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquireWorkerLock,
  parseWorkerArguments,
  runHeadlessWorker,
} from './cfm-automation-worker.mjs';

void test('CFM commands execute when launched through a symbolic link', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cfm-cli-test-'));
  try {
    for (const { filename, args, status, output } of [
      {
        filename: 'cfm-automation-worker.mjs',
        args: ['--help'],
        status: 0,
        output: /Actual CFM headless automation/,
      },
      {
        filename: 'cfm-export-upstream.mjs',
        args: ['--help'],
        status: 0,
        output: /Usage: node scripts\/cfm-export-upstream/,
      },
      {
        filename: 'create-cfm-example.mjs',
        args: [],
        status: 1,
        output: /Usage: node scripts\/create-cfm-example/,
      },
      {
        filename: 'package-cfm-recovery.mjs',
        args: [],
        status: 1,
        output: /Usage: node scripts\/package-cfm-recovery/,
      },
    ]) {
      const entry = path.join(folder, filename);
      await symlink(path.join(import.meta.dirname, filename), entry);
      const result = spawnSync(process.execPath, [entry, ...args], {
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(result.status, status, `${filename}: ${result.stderr}`);
      assert.match(result.stdout + result.stderr, output);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('headless arguments validate polling and do not accept command-line passwords', () => {
  const environment = {
    ACTUAL_SERVER_URL: 'https://example.invalid',
    ACTUAL_SYNC_ID: 'budget',
    CFM_SCHEDULER_ID: 'worker',
  };
  assert.equal(parseWorkerArguments(['--once'], environment).once, true);
  assert.throws(
    () => parseWorkerArguments(['--interval-seconds', '1'], environment),
    /15/,
  );
  assert.throws(
    () => parseWorkerArguments(['--password', 'secret'], environment),
    /Invalid option/,
  );
});
void test('exclusive worker lease prevents an overlapping process and releases cleanly', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cfm-worker-test-'));
  try {
    const release = await acquireWorkerLock(
      folder,
      'https://example.invalid',
      'budget',
    );
    await assert.rejects(
      acquireWorkerLock(folder, 'https://example.invalid', 'budget'),
      /already owns/,
    );
    await release();
    await release();
    await (
      await acquireWorkerLock(folder, 'https://example.invalid', 'budget')
    )();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
void test('encrypted headless access uses local secrets, syncs around jobs, and closes on failures', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cfm-worker-test-'));
  const passwordFile = path.join(folder, 'password'),
    encryptionPasswordFile = path.join(folder, 'encryption');
  await writeFile(passwordFile, 'test-server-secret\n');
  await writeFile(encryptionPasswordFile, 'test-budget-secret\n');
  const calls = [];
  const options = {
    serverUrl: 'https://example.invalid',
    syncId: 'budget',
    deviceId: 'worker',
    dataDir: folder,
    once: true,
    passwordFile,
    encryptionPasswordFile,
  };
  const api = {
    init: async config => {
      assert.equal(config.password, 'test-server-secret');
      calls.push('init');
    },
    downloadBudget: async (id, config) => {
      assert.equal(id, 'budget');
      assert.equal(config.password, 'test-budget-secret');
      calls.push('unlock');
    },
    getCfmState: async () => ({
      records: [
        {
          kind: 'automation',
          data: { enabled: true, mode: 'headless', schedulerId: 'worker' },
        },
      ],
    }),
    sync: async () => {
      calls.push('sync');
    },
    runCfmAutomation: async () => {
      calls.push('jobs');
      return { status: 'ran' };
    },
    shutdown: async () => {
      calls.push('shutdown');
    },
  };
  try {
    await runHeadlessWorker(options, api, {});
    assert.deepEqual(calls, [
      'init',
      'unlock',
      'sync',
      'jobs',
      'sync',
      'shutdown',
    ]);
    api.runCfmAutomation = async () => {
      throw new Error('Test failure');
    };
    await assert.rejects(runHeadlessWorker(options, api, {}), /Test failure/);
    assert.equal(calls.at(-1), 'shutdown');
    await (
      await acquireWorkerLock(folder, options.serverUrl, options.syncId)
    )();
    assert.equal(await readFile(passwordFile, 'utf8'), 'test-server-secret\n');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
