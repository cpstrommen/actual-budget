#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repository = path.resolve(import.meta.dirname, '..');

export function parseArguments(args) {
  let port = 3002;
  let openBrowser = true;
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--no-open') {
      openBrowser = false;
    } else if (argument === '--help') {
      help = true;
    } else if (argument === '--port') {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value)) {
        throw new Error('--port needs a number');
      }
      port = Number(value);
      if (port < 1024 || port > 65535) {
        throw new Error('--port must be 1024–65535');
      }
    } else {
      throw new Error('Unknown argument: ' + argument);
    }
  }
  return { port, openBrowser, help };
}

export function checkoutIdentity(root) {
  return createHash('sha256').update(realpathSync(root)).digest('hex');
}

export async function findPreview(port, checkoutId) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/__cfm-preview/health`,
      {
        signal: AbortSignal.timeout(1500),
        redirect: 'error',
      },
    );
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes('application/json')
    ) {
      return false;
    }
    const value = await response.json();
    return (
      value?.name === 'actual-cfm-ui-preview' &&
      value.protocol === 1 &&
      value.checkoutId === checkoutId
    );
  } catch {
    return false;
  }
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error =>
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} is occupied by another service or an older preview. Stop that process or choose --port ${port === 3102 ? 3103 : 3102}.`,
            )
          : error,
      ),
    );
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () =>
      probe.close(resolve),
    );
  });
}

function isRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readOwner(lock) {
  try {
    return JSON.parse(await readFile(lock, 'utf8'));
  } catch {
    return null;
  }
}

async function acquirePreview(port, checkoutId) {
  const lock = path.join(tmpdir(), `actual-cfm-ui-preview-${port}.lock`);
  const instanceId = randomUUID();
  let waiting = false;
  for (let attempt = 0; attempt < 600; attempt++) {
    if (await findPreview(port, checkoutId)) return null;
    try {
      const handle = await open(lock, 'wx', 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, checkoutId, instanceId }),
        );
      } finally {
        await handle.close();
      }
      const release = async () => {
        if ((await readOwner(lock))?.instanceId === instanceId) {
          await rm(lock, { force: true });
        }
      };
      try {
        await assertPortAvailable(port);
      } catch (error) {
        await release();
        throw error;
      }
      return release;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await readOwner(lock);
      if (
        (owner && !isRunning(owner.pid)) ||
        (!owner &&
          Date.now() -
            (await stat(lock).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs >
            10000)
      ) {
        await rm(lock, { force: true });
        continue;
      }
      if (owner && owner.checkoutId !== checkoutId) {
        throw new Error(
          `Another checkout is starting a preview on port ${port}. Choose a different --port.`,
        );
      }
      if (!waiting) {
        process.stdout.write(
          'A preview is already starting; waiting for it…\n',
        );
        waiting = true;
      }
      await delay(250);
    }
  }
  throw new Error(
    'The other preview has not finished starting. Check its terminal, then retry.',
  );
}

function openPage(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd.exe', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
  child.on('error', () =>
    process.stderr.write(`Open ${url} in your browser.\n`),
  );
  child.unref();
}

/** Stop the whole command, including Yarn's descendants during preparation. */
export function signalCommand(child, signal = 'SIGTERM') {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    killer.on('error', () => child.kill(signal));
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

export async function main({
  root = repository,
  args = process.argv.slice(2),
} = {}) {
  const { port, openBrowser, help } = parseArguments(args);
  if (help) {
    process.stdout.write(
      'Usage: yarn preview:ui [--port 3002] [--no-open]\nLocal CFM UI with synthetic data, live updates, themes, and viewport controls. Reuses an existing preview from this checkout.\n',
    );
    return;
  }
  const url = `http://127.0.0.1:${port}/__cfm-preview`;
  const checkoutId = checkoutIdentity(root);
  const release = await acquirePreview(port, checkoutId);
  if (!release) {
    process.stdout.write(
      `Actual CFM UI preview is already running: ${url}\nReusing it without rebuilding. Stop it with Ctrl+C in its original terminal.\n`,
    );
    if (openBrowser) openPage(url);
    return;
  }
  let temporary;
  let child;
  let stopping = false;
  let killTimer;
  const stop = () => {
    if (stopping) {
      signalCommand(child, 'SIGKILL');
      return;
    }
    stopping = true;
    signalCommand(child);
    if (child && !killTimer) {
      killTimer = setTimeout(() => signalCommand(child, 'SIGKILL'), 5000);
      killTimer.unref();
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const run = (commandArgs, { cwd = root, environment = {} } = {}) =>
    new Promise((resolve, reject) => {
      if (stopping) {
        resolve();
        return;
      }
      child = spawn(process.execPath, commandArgs, {
        cwd,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
        env: { ...process.env, ...environment },
      });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        child = undefined;
        clearTimeout(killTimer);
        killTimer = undefined;
        if (stopping || code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              'Preview command failed (' + (signal || String(code)) + ')',
            ),
          );
        }
      });
    });
  try {
    const yarnRc = await readFile(path.join(root, '.yarnrc.yml'), 'utf8');
    const yarnPath = /^yarnPath:\s*(.+?)\s*$/m.exec(yarnRc)?.[1];
    if (!yarnPath) throw new Error('Missing pinned yarnPath in .yarnrc.yml');
    const yarn = path.resolve(root, yarnPath);
    temporary = await mkdtemp(path.join(tmpdir(), 'actual-cfm-ui-preview-'));
    const sample = path.join(temporary, 'sample.zip');
    process.stdout.write(
      'Preparing the synthetic CFM sample and browser dependencies…\n',
    );
    await run([yarn, 'workspace', '@actual-app/api', 'build']);
    if (stopping) return;
    await run([yarn, 'workspace', 'plugins-service', 'build']);
    if (stopping) return;
    await run([path.join(root, 'scripts/create-cfm-example.mjs'), sample]);
    if (stopping) return;
    process.stdout.write(
      `\nStarting Actual CFM UI preview at ${url}\nSynthetic data only. Ctrl+C stops the preview; no deployment is updated.\n\n`,
    );
    await run(
      [
        path.join(root, 'node_modules/vite/bin/vite.js'),
        '--mode',
        'browser',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
        ...(openBrowser ? ['--open', '/__cfm-preview'] : []),
      ],
      {
        cwd: path.join(root, 'packages/desktop-client'),
        environment: {
          BROWSER: openBrowser ? '' : 'none',
          HTTPS: '',
          REACT_APP_CFM_PREVIEW: 'true',
          CFM_PREVIEW_SAMPLE: sample,
          CFM_PREVIEW_WORKDIR: temporary,
          CFM_PREVIEW_CHECKOUT_ID: checkoutId,
          CFM_PREVIEW_CACHE_DIR: path.join(
            tmpdir(),
            'actual-cfm-preview-cache',
            `${checkoutId}-${port}`,
          ),
        },
      },
    );
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (temporary) await rm(temporary, { recursive: true, force: true });
    await release();
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  main().catch(error => {
    process.stderr.write(
      'UI preview: ' +
        (error instanceof Error ? error.message : String(error)) +
        '\n',
    );
    process.exitCode = 1;
  });
}
