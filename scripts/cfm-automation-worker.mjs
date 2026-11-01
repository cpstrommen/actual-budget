#!/usr/bin/env node
// Authorized headless CFM runner. Build this checkout's API before starting:
// yarn build:api
// node scripts/cfm-automation-worker.mjs --sync-id <id> --device-id <selected-writer>
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function parseWorkerArguments(args, environment = process.env) {
  const values = {
    serverUrl: environment.ACTUAL_SERVER_URL || '',
    syncId: environment.ACTUAL_SYNC_ID || '',
    deviceId: environment.CFM_SCHEDULER_ID || '',
    dataDir: environment.ACTUAL_DATA_DIR || path.resolve('.cfm-worker-data'),
    intervalSeconds: 60,
    once: false,
  };
  const options = new Map([
    ['--server-url', 'serverUrl'],
    ['--sync-id', 'syncId'],
    ['--device-id', 'deviceId'],
    ['--data-dir', 'dataDir'],
    ['--interval-seconds', 'intervalSeconds'],
    ['--password-file', 'passwordFile'],
    ['--encryption-password-file', 'encryptionPasswordFile'],
  ]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--once') {
      values.once = true;
      continue;
    }
    if (flag === '--help' || flag === '-h') {
      values.help = true;
      continue;
    }
    const key = options.get(flag);
    const value = args[++index];
    if (!key || !value || value.startsWith('--')) {
      throw new Error(`Invalid option or missing value: ${flag}`);
    }
    values[key] = key === 'intervalSeconds' ? Number(value) : value;
  }
  if (!values.help) {
    if (!values.serverUrl || !values.syncId || !values.deviceId) {
      throw new Error(
        'Provide --server-url, --sync-id and --device-id (or their environment variables).',
      );
    }
    const url = new URL(values.serverUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('The sync server must use HTTP or HTTPS.');
    }
    if (
      !Number.isSafeInteger(values.intervalSeconds) ||
      values.intervalSeconds < 15 ||
      values.intervalSeconds > 3600
    ) {
      throw new Error(
        'Worker polling must be between 15 and 3600 seconds. Bank-provider refresh intervals are enforced separately.',
      );
    }
  }
  values.dataDir = path.resolve(values.dataDir);
  return values;
}

async function secret(file, fallback) {
  if (file) return (await readFile(file, 'utf8')).replace(/\r?\n$/, '');
  return fallback;
}

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

/**
 * Local exclusive budget lease. A separate short-lived guard serializes both
 * stale-owner recovery and normal acquisition so two recovering workers cannot
 * delete each other's fresh lock. A crash during guard ownership fails closed.
 */
export async function acquireWorkerLock(dataDir, serverUrl, syncId) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const key = createHash('sha256')
    .update(`${serverUrl}\0${syncId}`)
    .digest('hex')
    .slice(0, 24);
  const lockPath = path.join(dataDir, `.cfm-worker-${key}.lock`);
  const guardPath = `${lockPath}.guard`;
  const owner = {
    pid: process.pid,
    host: hostname(),
    token: randomUUID(),
    startedAt: new Date().toISOString(),
  };
  try {
    await mkdir(guardPath, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        `Another worker is acquiring its lease, or a recovery was interrupted. Retry, or inspect ${guardPath} before removing an abandoned guard.`,
      );
    }
    throw error;
  }
  try {
    let previous;
    try {
      previous = JSON.parse(
        await readFile(path.join(lockPath, 'owner.json'), 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(
          `Cannot verify the existing worker lease at ${lockPath}; retain it and inspect its owner file.`,
        );
      }
    }
    if (previous) {
      if (previous.host !== hostname() || isAlive(previous.pid)) {
        throw new Error(
          `A worker already owns this budget lease (${previous.host}, process ${previous.pid}).`,
        );
      }
      await rm(lockPath, { recursive: true });
    }
    try {
      await mkdir(lockPath, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(
          `The worker lease has no readable owner file: ${lockPath}. Inspect it before removing it.`,
        );
      }
      throw error;
    }
    await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify(owner), {
      mode: 0o600,
    });
  } finally {
    await rm(guardPath, { recursive: true });
  }
  let released = false;
  return async function release() {
    if (released) return;
    await mkdir(guardPath, { mode: 0o700 });
    try {
      const current = JSON.parse(
        await readFile(path.join(lockPath, 'owner.json'), 'utf8'),
      );
      if (current.token !== owner.token) {
        throw new Error(
          'The worker lease changed owners; refusing to remove it.',
        );
      }
      await rm(lockPath, { recursive: true });
      released = true;
    } finally {
      await rm(guardPath, { recursive: true });
    }
  };
}

export async function runHeadlessWorker(
  options,
  api,
  environment = process.env,
  signal,
) {
  const password = await secret(
    options.passwordFile || environment.ACTUAL_PASSWORD_FILE,
    environment.ACTUAL_PASSWORD,
  );
  const encryptionPassword = await secret(
    options.encryptionPasswordFile ||
      environment.ACTUAL_ENCRYPTION_PASSWORD_FILE,
    environment.ACTUAL_ENCRYPTION_PASSWORD,
  );
  if (!password) {
    throw new Error(
      'Provide the server password through ACTUAL_PASSWORD or --password-file.',
    );
  }
  const release = await acquireWorkerLock(
    options.dataDir,
    options.serverUrl,
    options.syncId,
  );
  let initialized = false;
  try {
    await api.init({
      dataDir: options.dataDir,
      serverURL: options.serverUrl,
      password,
    });
    initialized = true;
    await api.downloadBudget(
      options.syncId,
      encryptionPassword ? { password: encryptionPassword } : undefined,
    );
    const configRecord = (await api.getCfmState()).records.find(
      record => record.kind === 'automation',
    );
    if (
      !configRecord?.data.enabled ||
      configRecord.data.mode !== 'headless' ||
      configRecord.data.schedulerId !== options.deviceId
    ) {
      throw new Error(
        'Select this scheduler ID and headless mode in CFM automation settings before starting this worker.',
      );
    }
    do {
      if (signal?.aborted) break;
      await api.sync();
      const result = await api.runCfmAutomation({
        mode: 'headless',
        deviceId: options.deviceId,
      });
      await api.sync();
      if (result.status === 'paused') {
        throw new Error(
          `Automation paused: ${result.reason || 'configuration changed'}`,
        );
      }
      if (options.once || signal?.aborted) return result;
      await new Promise(resolve => {
        const complete = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', complete);
          resolve();
        };
        const timer = setTimeout(complete, options.intervalSeconds * 1000);
        signal?.addEventListener('abort', complete, { once: true });
      });
    } while (!signal?.aborted);
  } finally {
    try {
      if (initialized) await api.shutdown();
    } finally {
      await release();
    }
  }
}

async function main() {
  const options = parseWorkerArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      'Actual CFM headless automation\n\n--server-url <url> --sync-id <id> --device-id <selected-writer>\n[--data-dir <local-path>] [--interval-seconds <15..3600>] [--once]\n[--password-file <path>] [--encryption-password-file <path>]\n\nCredentials can instead use ACTUAL_PASSWORD[_FILE] and ACTUAL_ENCRYPTION_PASSWORD[_FILE].\nThis worker needs authorized access to an unlocked budget; it is not a server-side encryption bypass.\n',
    );
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // Prefer this checkout's built API over any published upstream npm package.
  const apiPath = pathToFileURL(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../packages/api/dist/index.js',
    ),
  ).href;
  const api = await import(apiPath);
  try {
    await runHeadlessWorker(options, api, process.env, controller.signal);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    process.stderr.write(
      `Actual CFM automation stopped: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
