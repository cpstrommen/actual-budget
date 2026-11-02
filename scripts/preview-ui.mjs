#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function main() {
  let port = 3002;
  let open = true;
  const args = process.argv.slice(2);
  while (args.length) {
    const argument = args.shift();
    if (argument === '--no-open') {
      open = false;
    } else if (argument === '--port') {
      const value = args.shift();
      if (!value || !/^\d+$/.test(value)) {
        throw new Error('--port needs a number');
      }
      port = Number(value);
      if (port < 1024 || port > 65535) {
        throw new Error('--port must be 1024–65535');
      }
    } else if (argument === '--help') {
      process.stdout.write(
        'Usage: yarn preview:ui [--port 3002] [--no-open]\nLocal CFM UI with synthetic data, live updates, themes, and viewport controls.\n',
      );
      return;
    } else {
      throw new Error('Unknown argument: ' + argument);
    }
  }

  const yarnRc = await readFile(path.join(root, '.yarnrc.yml'), 'utf8');
  const yarnPath = /^yarnPath:\s*(.+?)\s*$/m.exec(yarnRc)?.[1];
  if (!yarnPath) throw new Error('Missing pinned yarnPath in .yarnrc.yml');
  const yarn = path.resolve(root, yarnPath);
  const temporary = await mkdtemp(
    path.join(tmpdir(), 'actual-cfm-ui-preview-'),
  );
  const sample = path.join(temporary, 'sample.zip');
  let child;
  let stopping = false;
  const stop = () => {
    stopping = true;
    child?.kill('SIGTERM');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const run = (commandArgs, environment = {}) =>
    new Promise((resolve, reject) => {
      if (stopping) {
        reject(new Error('Preview stopped'));
        return;
      }
      child = spawn(process.execPath, commandArgs, {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, ...environment },
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        child = undefined;
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
    process.stdout.write(
      'Preparing the synthetic CFM sample and browser dependencies…\n',
    );
    await run([yarn, 'workspace', '@actual-app/api', 'build']);
    await run([yarn, 'workspace', 'plugins-service', 'build']);
    await run([path.join(root, 'scripts/create-cfm-example.mjs'), sample]);
    process.stdout.write(
      '\nActual CFM UI preview: http://127.0.0.1:' +
        port +
        '/__cfm-preview\nSynthetic data only. Ctrl+C stops the preview; no deployment is updated.\n\n',
    );
    await run(
      [
        yarn,
        'workspace',
        '@actual-app/web',
        'exec',
        'vite',
        '--mode',
        'browser',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
        ...(open ? ['--open', '/__cfm-preview'] : []),
      ],
      {
        BROWSER: open ? '' : 'none',
        HTTPS: '',
        REACT_APP_CFM_PREVIEW: 'true',
        CFM_PREVIEW_SAMPLE: sample,
      },
    );
  } finally {
    stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await rm(temporary, { recursive: true, force: true });
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
