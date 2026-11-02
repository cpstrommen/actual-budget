#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
// Run after yarn build:api. The resulting directory needs Node, but no install or server.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export async function packageRecovery(destination) {
  destination = path.resolve(destination);
  await mkdir(destination, { mode: 0o700 });
  try {
    const copy = async (source, target) => {
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true, dereference: true });
    };
    for (const file of [
      'index.js',
      'models.js',
      'default-db.sqlite',
      'migrations',
    ]) {
      await copy(
        path.join(root, 'packages/api/dist', file),
        path.join(destination, 'packages/api/dist', file),
      );
    }
    for (const file of [
      'cfm-export-upstream.mjs',
      'cfm-automation-worker.mjs',
      'create-cfm-example.mjs',
    ]) {
      await copy(
        path.join(root, 'scripts', file),
        path.join(destination, 'scripts', file),
      );
    }
    for (const file of ['return-to-actual-budget.md', 'cfm-format.md']) {
      await copy(
        path.join(root, 'packages/docs/docs/migration', file),
        path.join(destination, 'docs', file),
      );
    }
    await copy(
      path.join(root, 'packages/loot-core/src/server/cfm/upstream-schema.json'),
      path.join(destination, 'upstream-schema.json'),
    );
    await copy(
      path.join(root, 'LICENSE.txt'),
      path.join(destination, 'LICENSE.txt'),
    );
    await copy(
      path.join(root, 'assets/fonts/geologica/OFL.txt'),
      path.join(destination, 'licenses/Geologica-OFL.txt'),
    );
    const require = createRequire(path.join(root, 'packages/api/package.json'));
    const copied = new Set();
    async function dependency(name, fromRequire) {
      if (copied.has(name)) return;
      const source = path.dirname(fromRequire.resolve(`${name}/package.json`));
      const metadata = JSON.parse(
        await readFile(path.join(source, 'package.json'), 'utf8'),
      );
      await copy(source, path.join(destination, 'node_modules', name));
      copied.add(name);
      const localRequire = createRequire(path.join(source, 'package.json'));
      for (const name of Object.keys(metadata.dependencies || {})) {
        await dependency(name, localRequire);
      }
    }
    await dependency('better-sqlite3', require);
    await mkdir(path.join(destination, 'examples'));
    execFileSync(
      process.execPath,
      [
        path.join(destination, 'scripts/create-cfm-example.mjs'),
        path.join(destination, 'examples/cfm-2026.zip'),
      ],
      { stdio: 'pipe', timeout: 60000 },
    );
    await writeFile(
      path.join(destination, 'README.txt'),
      `Actual CFM offline recovery runtime\n\nRequires Node ${process.versions.node} or a compatible Node >=22 runtime on ${process.platform}/${process.arch}.\nThe SQLite addon and its dependencies are included. No installation, server, credentials, or CFM maintenance service is required.\n\nRun: node scripts/cfm-export-upstream.mjs /path/to/native-cfm-backup.zip /path/to/new-output-directory\nExports are unencrypted. Read docs/return-to-actual-budget.md and retain all output files.\n\nBuild separate packages for other OS/CPU combinations; native addons are platform-specific.\n`,
    );
    const hashes = {};
    async function scan(folder) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) {
          await scan(filename);
        } else {
          hashes[path.relative(destination, filename)] = createHash('sha256')
            .update(await readFile(filename))
            .digest('hex');
        }
      }
    }
    await scan(destination);
    await writeFile(
      path.join(destination, 'runtime-manifest.json'),
      JSON.stringify(
        {
          formatVersion: 1,
          node: process.versions.node,
          platform: process.platform,
          architecture: process.arch,
          files: hashes,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  const [destination, ...extra] = process.argv.slice(2);
  if (!destination || extra.length) {
    throw new Error(
      'Usage: node scripts/package-cfm-recovery.mjs <new-output-directory>',
    );
  }
  await packageRecovery(destination);
  process.stdout.write(
    `Recovery runtime packaged in ${path.resolve(destination)}\n`,
  );
}
