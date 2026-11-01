import { v4 as uuidv4 } from 'uuid';

import * as asyncStorage from '#platform/server/asyncStorage';
import * as db from '#server/db';
import { validateCfmRecord } from '#shared/cfm';
import type { CfmRecord } from '#types/models/cfm';

export const CFM_NOTE_PREFIX = 'cfm:v1:';

/** Each extension record is an ordinary synced/undoable note, never a private schema migration. */
export async function readRecords(): Promise<CfmRecord[]> {
  const rows = await db.all<{ id: string; note: string | null }>(
    'SELECT id, note FROM notes WHERE id LIKE ? ORDER BY id',
    [`${CFM_NOTE_PREFIX}%`],
  );
  const records: CfmRecord[] = [];
  for (const row of rows) {
    if (!row.note) continue;
    const record: unknown = JSON.parse(row.note);
    validateCfmRecord(record);
    if (`${CFM_NOTE_PREFIX}${record.id}` !== row.id) {
      throw new Error('CFM record identity mismatch');
    }
    records.push(record);
  }
  return records;
}

export async function readRecord(id: string): Promise<CfmRecord | undefined> {
  const row = await db.first<{ note: string | null }>(
    'SELECT note FROM notes WHERE id = ?',
    [`${CFM_NOTE_PREFIX}${id}`],
  );
  if (!row?.note) return undefined;
  const record: unknown = JSON.parse(row.note);
  validateCfmRecord(record);
  return record;
}

export async function writeRecord(record: CfmRecord): Promise<void> {
  validateCfmRecord(record);
  await db.update('notes', {
    id: `${CFM_NOTE_PREFIX}${record.id}`,
    note: JSON.stringify(record),
  });
}

export async function removeRecord(id: string): Promise<void> {
  await db.update('notes', { id: `${CFM_NOTE_PREFIX}${id}`, note: null });
}

export async function appendAudit(
  action: string,
  data: Record<string, unknown>,
  id = uuidv4(),
): Promise<CfmRecord> {
  const record: CfmRecord = {
    id,
    kind: 'audit',
    updatedAt: new Date().toISOString(),
    data: { action, ...data },
  };
  await writeRecord(record);
  return record;
}

export async function getDeviceId(): Promise<string> {
  const value = await asyncStorage.getItem('cfm-device-id');
  if (typeof value === 'string' && value) return value;
  const id = uuidv4();
  await asyncStorage.setItem('cfm-device-id', id);
  return id;
}

export function requireRequestId(id: string): void {
  if (typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(id)) {
    throw new Error('A valid operation identifier is required');
  }
}

export async function priorOperation(
  id: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  requireRequestId(id);
  const previous = await readRecord(`operation:${id}`);
  if (!previous) return undefined;
  if (JSON.stringify(previous.data.request) !== JSON.stringify(request)) {
    throw new Error(
      'Operation identifier was already used for a different request',
    );
  }
  const result = previous.data.result;
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('Invalid operation receipt');
  }
  return Object.fromEntries(Object.entries(result));
}

export async function completeOperation(
  id: string,
  request: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  await appendAudit('operation', { request, result }, `operation:${id}`);
}
