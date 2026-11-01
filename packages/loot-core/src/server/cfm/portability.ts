import { v4 as uuidv4 } from 'uuid';

import * as asyncStorage from '#platform/server/asyncStorage';
import * as fs from '#platform/server/fs';
import * as sqlite from '#platform/server/sqlite';
import * as db from '#server/db';
import { runMutator } from '#server/mutators';
import * as prefs from '#server/prefs';
import { safeZip } from '#server/util/zip';
import { getReportDocuments, validateReportRun } from '#shared/cfm-reports';

import { CFM_NOTE_PREFIX } from './store';
import targetManifest from './upstream-schema.json';

export const CFM_UPSTREAM_VERSION = targetManifest.upstreamVersion;
export const CFM_UPSTREAM_COMMIT = targetManifest.commit;
type Database = Awaited<ReturnType<typeof sqlite.openDatabase>>;
type Row = Record<string, string | number | null>;
const ephemeral = new Set([
  'kvcache',
  'kvcache_key',
  'messages_crdt',
  'messages_clock',
  'messages_pending',
]);
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value, null, 2));
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
function rows(database: Database, table: string): Row[] {
  return sqlite.runQuery<Row>(
    database,
    `SELECT * FROM ${quote(table)}`,
    [],
    true,
  );
}
function sorted(value: Row[]): string {
  return JSON.stringify(
    value
      .map(row =>
        Object.fromEntries(
          Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
        ),
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
export async function cfmHash(data: Uint8Array): Promise<string> {
  const input = new Uint8Array(data.length);
  input.set(data);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

export function balanceCheckpoints(transactions: Row[]) {
  const events = transactions
    .filter(row => !row.tombstone && !row.isParent)
    .sort(
      (a, b) =>
        Number(a.date) - Number(b.date) ||
        Number(a.sort_order) - Number(b.sort_order) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const byAccount = new Map<string, Map<string, number>>();
  const counts: Record<string, number> = {};
  for (const row of events) {
    if (
      typeof row.acct !== 'string' ||
      !Number.isSafeInteger(row.amount) ||
      !Number.isSafeInteger(row.date)
    )
      throw new Error(
        'A financial transaction cannot be represented by the upstream target',
      );
    const accountEvents = byAccount.get(row.acct) || new Map<string, number>();
    const date = String(row.date);
    accountEvents.set(
      date,
      (accountEvents.get(date) || 0) + Number(row.amount),
    );
    byAccount.set(row.acct, accountEvents);
    counts[row.acct] = (counts[row.acct] || 0) + 1;
  }
  return [...byAccount]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountId, days]) => {
      let balance = 0;
      const checkpoints = [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => {
          balance += amount;
          if (!Number.isSafeInteger(balance))
            throw new Error('Account balance exceeds safe integer range');
          return { date, balance };
        });
      return {
        accountId,
        transactionCount: counts[accountId],
        balance,
        checkpoints,
      };
    });
}

/** A fresh pinned upstream schema, never an in-place deletion of migration history. */
export async function convertCfmDatabase(source: Database) {
  const knownTables = new Map(Object.entries(targetManifest.tables));
  const sourceTables = sqlite.runQuery<{ name: string }>(
    source,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    [],
    true,
  );
  for (const { name } of sourceTables)
    if (!knownTables.has(name))
      throw new Error(
        `Unsupported financial table ${name}; export refused rather than dropping data`,
      );
  const migrations = rows(source, '__migrations__')
    .map(row => Number(row.id))
    .sort((a, b) => a - b);
  const supported = targetManifest.migrations
    .map(row => row.id)
    .sort((a, b) => a - b);
  if (JSON.stringify(migrations) !== JSON.stringify(supported))
    throw new Error(
      `Unsupported migration history for Actual Budget ${CFM_UPSTREAM_VERSION}`,
    );
  const destination = await sqlite.openDatabase(':memory:');
  const archived: Record<string, unknown> = {};
  const copied: Record<string, number> = {};
  try {
    for (const object of targetManifest.schema)
      if (object.type === 'table') sqlite.execQuery(destination, object.sql);
    for (const [table, columns] of knownTables) {
      const sourceColumns = sqlite
        .runQuery<{ name: string }>(
          source,
          `PRAGMA table_info(${quote(table)})`,
          [],
          true,
        )
        .map(row => row.name);
      if (
        sorted(sourceColumns.map(name => ({ name }))) !==
        sorted(columns.map(row => ({ name: row.name })))
      )
        throw new Error(`Unsupported columns in ${table}`);
      const original = rows(source, table);
      if (ephemeral.has(table)) {
        archived[table] = original;
        copied[table] = 0;
        continue;
      }
      let selected = original;
      if(table==='__meta__') {
        archived.derivedViewMetadata=original.filter(row=>row.key==='view-hash');
        selected=original.filter(row=>row.key!=='view-hash');
      }
      if (table === 'notes') {
        archived.cfmRecords = original.filter(row =>
          String(row.id).startsWith(CFM_NOTE_PREFIX),
        );
        selected = original.filter(
          row => !String(row.id).startsWith(CFM_NOTE_PREFIX),
        );
      }
      const names = columns.map(column => column.name);
      const sql = `INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')})`;
      sqlite.transaction(destination, () => {
        for (const row of selected)
          sqlite.runQuery(
            destination,
            sql,
            names.map(name => row[name] ?? null),
          );
      });
      if (sorted(rows(destination, table)) !== sorted(selected))
        throw new Error(`Export validation failed for ${table}`);
      copied[table] = selected.length;
    }
    for (const object of targetManifest.schema)
      if (object.type !== 'table') sqlite.execQuery(destination, object.sql);
    const sourceTransactions = rows(source, 'transactions');
    const checkpoints = balanceCheckpoints(sourceTransactions);
    if (
      JSON.stringify(checkpoints) !==
      JSON.stringify(balanceCheckpoints(rows(destination, 'transactions')))
    )
      throw new Error('Dated balance comparison failed');
    const validIds = new Set(
      sourceTransactions.filter(row => !row.tombstone).map(row => row.id),
    );
    const warnings: string[] = [];
    for (const row of sourceTransactions.filter(row => !row.tombstone)) {
      if (row.transferred_id && !validIds.has(row.transferred_id))
        warnings.push(`Existing unresolved transfer: ${row.id}`);
      if (row.isChild && row.parent_id && !validIds.has(row.parent_id))
        warnings.push(`Existing orphan split: ${row.id}`);
    }
    // Invalid pre-existing links are preserved and visible, never silently repaired.
    const integrity = sqlite.runQuery<{ integrity_check: string }>(
      destination,
      'PRAGMA integrity_check',
      [],
      true,
    );
    if (integrity.some(row => row.integrity_check !== 'ok'))
      throw new Error('Converted database failed SQLite integrity validation');
    return {
      data: new Uint8Array(await sqlite.exportDatabase(destination)),
      archived,
      copied,
      checkpoints,
      warnings,
      transactions: sourceTransactions,
    };
  } finally {
    sqlite.closeDatabase(destination);
  }
}

export async function exportForActualBudget({
  targetVersion = CFM_UPSTREAM_VERSION,
}: { targetVersion?: string } = {}) {
  if (targetVersion !== CFM_UPSTREAM_VERSION)
    throw new Error(
      `Only the pinned ${CFM_UPSTREAM_VERSION} target is supported`,
    );
  return runMutator(async () => {
    const live = db.getDatabase();
    if (!live || !prefs.getPrefs()?.id)
      throw new Error('Open a financial file first');
    const sourceBytes = new Uint8Array(await sqlite.exportDatabase(live));
    const snapshot = await sqlite.openDatabase(Buffer.from(sourceBytes));
    try {
      const converted = await convertCfmDatabase(snapshot);
      const originalMetadata = { ...prefs.getPrefs() };
      const metadata = {
        ...originalMetadata,
        id: uuidv4(),
        cloudFileId: null,
        groupId: null,
        encryptKeyId: null,
        lastUploaded: null,
        lastSyncedTimestamp: null,
        resetClock: true,
      };
      const exportedFiles = {
        'db.sqlite': converted.data,
        'metadata.json': encode(metadata),
      };
      const data = Buffer.from(safeZip(exportedFiles));
      const receipt = {
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        targetVersion: CFM_UPSTREAM_VERSION,
        targetCommit: CFM_UPSTREAM_COMMIT,
        calculationVersion: 'cfm-1',
        sourceBudgetName: originalMetadata.budgetName,
        sourceSha256: await cfmHash(sourceBytes),
        files: {
          'db.sqlite': await cfmHash(converted.data),
          'metadata.json': await cfmHash(exportedFiles['metadata.json']),
        },
        tables: converted.copied,
        accounts: converted.checkpoints,
        warnings: converted.warnings,
        representationChanges: [
          'CFM reserved note records are preserved in the companion archive.',
          'Sync identities and computed caches are reset; all supported ledger records are copied field for field.',
          'Same-day sort order and original edit/deletion messages are retained in the audit archive.',
        ],
      };
      const fullBackup = safeZip({
        'db.sqlite': sourceBytes,
        'metadata.json': encode(originalMetadata),
      });
      const archiveFiles: Record<string, Uint8Array> = {
        'receipt.json': encode(receipt),
        'cfm-records-and-audit.json': encode(converted.archived),
        'transactions-including-deletions.json': encode(converted.transactions),
        'full-cfm-backup.zip': fullBackup,
        'README.txt': new TextEncoder().encode(
          `Actual CFM recovery archive\nUpstream target: ${CFM_UPSTREAM_VERSION}, commit ${CFM_UPSTREAM_COMMIT}\nImport the separate Actual Budget ZIP as a new budget. Keep this full backup and audit archive. Exports are UNENCRYPTED.\nSee packages/docs/docs/migration/return-to-actual-budget.md and scripts/cfm-export-upstream.mjs in the source release.\n`,
        ),
      };
      const auditRows = (converted.archived.cfmRecords || []) as Row[];
      const csvCell = (value: unknown) =>
        `"${String(value ?? '').replaceAll('"', '""')}"`;
      archiveFiles['cfm-records.csv'] = new TextEncoder().encode(
        'id,kind,recorded_at,data_json\r\n' +
          auditRows
            .filter(row => row.note)
            .map(row => {
              const record = JSON.parse(String(row.note));
              return [
                record.id,
                record.kind,
                record.updatedAt,
                JSON.stringify(record.data),
              ]
                .map(csvCell)
                .join(',');
            })
            .join('\r\n'),
      );
      for (const note of (converted.archived.cfmRecords || []) as Row[]) {
        if (!note.note) continue;
        const envelope: unknown = JSON.parse(String(note.note));
        if (
          typeof envelope !== 'object' ||
          !envelope ||
          !('kind' in envelope) ||
          envelope.kind !== 'report-run' ||
          !('data' in envelope)
        )
          continue;
        try {
          const run = validateReportRun(envelope.data);
          const documents = getReportDocuments(run);
          const id = run.id.replace(/[^A-Za-z0-9_-]/g, '_');
          archiveFiles[`reports/${id}.html`] = new TextEncoder().encode(
            documents.html,
          );
          archiveFiles[`reports/${id}.csv`] = new TextEncoder().encode(
            documents.csv,
          );
          archiveFiles[`reports/${id}.json`] = new TextEncoder().encode(
            documents.json,
          );
        } catch {
          throw new Error('An archived report cannot be exported without loss');
        }
      }
      const archiveHashes = Object.fromEntries(
        await Promise.all(
          Object.entries(archiveFiles)
            .filter(([name]) => name !== 'receipt.json')
            .map(async ([name, bytes]) => [name, await cfmHash(bytes)]),
        ),
      );
      const finalReceipt = { ...receipt, archiveFiles: archiveHashes };
      archiveFiles['receipt.json'] = encode(finalReceipt);
      return {
        data,
        archive: Buffer.from(safeZip(archiveFiles)),
        receipt: finalReceipt,
        warnings: [
          'Exports contain unencrypted financial information.',
          ...converted.warnings,
        ],
      };
    } finally {
      sqlite.closeDatabase(snapshot);
    }
  });
}

/** The pending timer runs outside the mutation queue; export takes its own consistent snapshot. */
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleRecoveryExport(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  const budgetId = prefs.getPrefs()?.id;
  if (!budgetId) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = undefined;
    if (prefs.getPrefs()?.id !== budgetId) return;
    void refreshRecoveryExport(budgetId).catch(() => {
      /* The saved status exposes the failure. */
    });
  }, 2000);
}
export function cancelRecoveryExport(): void {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
}
export async function refreshRecoveryExport(budgetId = prefs.getPrefs()?.id) {
  if (!budgetId || prefs.getPrefs()?.id !== budgetId) return;
  // Avoid the export cost for files which have never used CFM extensions.
  const record = await db.first<{ id: string }>(
    "SELECT id FROM notes WHERE id LIKE 'cfm:v1:%' AND note IS NOT NULL LIMIT 1",
  );
  if (!record) return;
  try {
    const result = await exportForActualBudget();
    if (prefs.getPrefs()?.id !== budgetId) return;
    const folder = fs.getBudgetDir(budgetId);
    await fs.writeFile(fs.join(folder, 'cfm-upstream.zip'), result.data);
    await fs.writeFile(fs.join(folder, 'cfm-recovery.zip'), result.archive);
    await fs.writeFile(
      fs.join(folder, 'cfm-portability-receipt.json'),
      JSON.stringify(result.receipt, null, 2),
    );
    await asyncStorage.setItem('cfm-portability-status', {
      updatedAt: result.receipt.createdAt,
    });
    return result.receipt;
  } catch (error) {
    const previous = await asyncStorage.getItem('cfm-portability-status');
    await asyncStorage.setItem('cfm-portability-status', {
      updatedAt: previous?.updatedAt || '',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
