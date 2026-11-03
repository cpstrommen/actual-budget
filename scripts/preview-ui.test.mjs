import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { checkoutIdentity, main } from './preview-ui.mjs';

async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for preview process');
    }
    await delay(25);
  }
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cfm-preview-runner-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of [
    'scripts',
    'packages/desktop-client',
    'node_modules/vite/bin',
  ]) {
    await mkdir(path.join(root, folder), { recursive: true });
  }
  await writeFile(path.join(root, '.yarnrc.yml'), 'yarnPath: yarn.cjs\n');
  await writeFile(
    path.join(root, 'yarn.cjs'),
    `
    const fs = require('node:fs');
    fs.appendFileSync('preparations.log', process.argv.slice(2).join(' ') + '\\n');
    if (process.env.HOLD_PREPARATION) {
      const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'inherit'});
      fs.writeFileSync('preparing.json', JSON.stringify({child: child.pid}));
      setInterval(() => {}, 1000);
    }
  `,
  );
  await writeFile(
    path.join(root, 'scripts/create-cfm-example.mjs'),
    `import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], 'sample');`,
  );
  await writeFile(
    path.join(root, 'node_modules/vite/bin/vite.js'),
    `
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.resolve('../..');
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'inherit'});
    const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
    if (process.env.HOLD_SHUTDOWN) process.on('SIGTERM', () => fs.writeFileSync(path.join(root,'stopping.json'),'stopping'));
    const server = require('node:http').createServer((req,res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({name:'actual-cfm-ui-preview',protocol:1,checkoutId:process.env.CFM_PREVIEW_CHECKOUT_ID}));
    });
    server.listen(port,'127.0.0.1',() => fs.writeFileSync(path.join(root,'started.json'),JSON.stringify({child:child.pid,temporary:process.env.CFM_PREVIEW_WORKDIR})));
  `,
  );
  const launcher = path.join(root, 'launch.mjs');
  await writeFile(
    launcher,
    `import {main} from ${JSON.stringify(new URL('./preview-ui.mjs', import.meta.url).href)}; main({root:${JSON.stringify(root)}}).catch(error => { console.error(error); process.exitCode=1; });`,
  );
  const probe = createServer();
  const port = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  const start = environment => {
    const child = spawn(
      process.execPath,
      [launcher, '--no-open', '--port', String(port)],
      {
        env: { ...process.env, ...environment },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const finished = once(child, 'close');
    let output = '';
    child.stdout.on('data', bytes => {
      output += bytes;
    });
    child.stderr.on('data', bytes => {
      output += bytes;
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await finished;
      }
    });
    return { child, finished, output: () => output };
  };
  return { root, port, start };
}

void test('rejects an unrelated port owner before starting any build', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cfm-preview-occupied-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer((request, response) =>
    response.end('another application'),
  );
  const port = await listen(server);
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(
    main({ root, args: ['--no-open', '--port', String(port)] }),
    /occupied by another service/,
  );
  assert.equal(
    await (await fetch(`http://127.0.0.1:${port}`)).text(),
    'another application',
  );
});

void test('reuses only a preview from the same checkout without preparing files', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'cfm-preview-reuse-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        name: 'actual-cfm-ui-preview',
        protocol: 1,
        checkoutId: checkoutIdentity(root),
      }),
    );
  });
  const port = await listen(server);
  t.after(() => new Promise(resolve => server.close(resolve)));
  await main({ root, args: ['--no-open', '--port', String(port)] });
  const other = await mkdtemp(path.join(tmpdir(), 'cfm-preview-other-'));
  t.after(() => rm(other, { recursive: true, force: true }));
  await assert.rejects(
    main({ root: other, args: ['--no-open', '--port', String(port)] }),
    /occupied by another service/,
  );
});

void test('simultaneous launches prepare once, and Ctrl+C stops descendants and frees the port', async t => {
  const { root, port, start } = await fixture(t);
  const first = start({ HOLD_SHUTDOWN: '1' });
  const second = start({ HOLD_SHUTDOWN: '1' });
  await waitFor(() => existsSync(path.join(root, 'started.json')));
  await waitFor(
    () => first.child.exitCode !== null || second.child.exitCode !== null,
  );
  const reused = first.child.exitCode !== null ? first : second;
  const owner = reused === first ? second : first;
  assert.equal((await reused.finished)[0], 0, reused.output());
  assert.match(reused.output(), /already running/);
  const metadata = JSON.parse(
    await readFile(path.join(root, 'started.json'), 'utf8'),
  );
  assert.equal(
    (await readFile(path.join(root, 'preparations.log'), 'utf8'))
      .trim()
      .split('\n').length,
    2,
  );
  assert.ok(existsSync(metadata.temporary));
  owner.child.kill('SIGINT');
  await waitFor(() => existsSync(path.join(root, 'stopping.json')));
  owner.child.kill('SIGINT');
  assert.equal((await owner.finished)[0], 0, owner.output());
  await waitFor(() => !isRunning(metadata.child));
  assert.equal(existsSync(metadata.temporary), false);
  assert.equal(
    existsSync(path.join(tmpdir(), `actual-cfm-ui-preview-${port}.lock`)),
    false,
  );
  const probe = createServer();
  probe.listen(port, '127.0.0.1');
  await once(probe, 'listening');
  await new Promise(resolve => probe.close(resolve));
});

void test('interrupting preparation kills nested build processes and allows a fresh launch', async t => {
  const { root, port, start } = await fixture(t);
  // A terminated launcher must not leave its port permanently locked.
  await writeFile(
    path.join(tmpdir(), `actual-cfm-ui-preview-${port}.lock`),
    JSON.stringify({
      pid: 2147483647,
      checkoutId: checkoutIdentity(root),
      instanceId: 'stale',
    }),
    { flag: 'wx' },
  );
  const preparing = start({ HOLD_PREPARATION: '1' });
  await waitFor(() => existsSync(path.join(root, 'preparing.json')));
  const { child } = JSON.parse(
    await readFile(path.join(root, 'preparing.json'), 'utf8'),
  );
  preparing.child.kill('SIGTERM');
  assert.equal((await preparing.finished)[0], 0, preparing.output());
  await waitFor(() => !isRunning(child));
  const next = start();
  await waitFor(() => existsSync(path.join(root, 'started.json')));
  next.child.kill('SIGINT');
  assert.equal((await next.finished)[0], 0, next.output());
});
