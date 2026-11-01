import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ref = '5897cfa65';
const root = new URL('../', import.meta.url);
const read = path =>
  execFileSync('git', ['show', `${ref}:${path}`], {
    cwd: root,
    maxBuffer: 20_000_000,
  }).toString();
const fullCommit = execFileSync('git', ['rev-parse', ref], { cwd: root })
  .toString()
  .trim();
const files = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', ref, 'packages/loot-core/migrations'],
  { cwd: root },
)
  .toString()
  .trim()
  .split('\n')
  .filter(path => /\/\d+.*\.(sql|js)$/.test(path))
  .sort(
    (a, b) =>
      Number(a.split('/').at(-1).split('_')[0]) -
      Number(b.split('/').at(-1).split('_')[0]),
  );
const db = new DatabaseSync(':memory:');
db.exec(read('packages/loot-core/src/server/sql/init.sql'));
db.prepare('INSERT INTO db_version VALUES (?)').run('26.10.0');
const pending = read('packages/loot-core/src/server/sync/messages-pending.ts')
  .match(/= `([\s\S]*?)`;/)[1]
  .replaceAll('\\`', '`');
const adapter = {
  runQuery(sql, params = [], all = false) {
    const stmt = db.prepare(sql);
    return all ? stmt.all(...params) : stmt.run(...params);
  },
  execQuery(sql) {
    db.exec(sql);
  },
  transaction(fn) {
    db.exec('BEGIN');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
const migrations = [];
for (const path of files) {
  const code = read(path);
  const id = Number(path.split('/').at(-1).split('_')[0]);
  if (path.endsWith('.sql')) {
    db.exec(code);
  } else {
    // Schema generation runs the pinned migration body with an empty seed dataset.
    // Dashboard defaults are rows, subsequently copied from the user's snapshot.
    const body = code.replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '');
    const definitions = `const uuidv4=()=>globalThis.crypto.randomUUID(); const DEFAULT_DASHBOARD_STATE=[]; const PENDING_MESSAGES_TABLE_SQL=${JSON.stringify(pending)};\n`;
    const { default: run } = await import(
      'data:text/javascript;base64,' +
        Buffer.from(definitions + body).toString('base64')
    );
    await run(adapter, {
      fileId: null,
      fs: {
        getBudgetDir() {
          throw new Error('No user files during schema generation');
        },
      },
    });
  }
  db.prepare('INSERT INTO __migrations__ VALUES (?)').run(id);
  migrations.push({
    id,
    file: path.split('/').at(-1),
    sha256: createHash('sha256').update(code).digest('hex'),
  });
}
const schema = db
  .prepare(
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name",
  )
  .all();
const tables = {};
for (const item of schema.filter(x => x.type === 'table')) {
  tables[item.name] = db
    .prepare(`PRAGMA table_info("${String(item.name)}")`)
    .all()
    .map(x => ({ name: x.name, type: x.type, pk: x.pk }));
}
const manifest = {
  formatVersion: 1,
  upstreamVersion: '26.10.0',
  commit: fullCommit,
  migrations,
  schema,
  tables,
};
mkdirSync(new URL('packages/loot-core/src/server/cfm/', root), {
  recursive: true,
});
writeFileSync(
  new URL('packages/loot-core/src/server/cfm/upstream-schema.json', root),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  `Pinned ${schema.length} schema objects and ${migrations.length} migrations at ${fullCommit}`,
);
db.close();
