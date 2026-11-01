import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as sqlite from '#platform/server/sqlite';
import * as db from '#server/db';
import * as prefs from '#server/prefs';
import { undo, clearUndo, withUndo } from '#server/undo';
import { safeUnzip } from '#server/util/zip';
import {
  getAccountBalances,
  getCfmRecords,
  getObligationStatus,
} from '#shared/cfm';
import type { CfmRecord } from '#types/models/cfm';

import {
  createAccount,
  getState,
  postAdjustment,
  saveRecord,
  settleObligation,
  valueAssetAccount,
} from './app';
import { convertCfmDatabase, exportForActualBudget } from './portability';

let temporaryDirectory: string;
beforeEach(async () => {
  global.stepForwardInTime(Date.parse('2026-10-31T12:00:00Z'));
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'actual-cfm-test-'));
  vi.stubEnv('ACTUAL_DATA_DIR', temporaryDirectory);
  await global.emptyDatabase()();
  await prefs.loadPrefs();
  clearUndo();
  await db.insertCategoryGroup({
    id: 'expenses',
    name: 'Expenses',
    is_income: 0,
  });
  await db.insertCategory({
    id: 'tickets',
    name: 'Entertainment',
    cat_group: 'expenses',
    is_income: 0,
  });
});
afterEach(async () => {
  db.closeDatabase();
  prefs.unloadPrefs();
  vi.unstubAllEnvs();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

async function account(id: string, offbudget = true) {
  await db.insertAccount({
    id,
    name: id,
    offbudget: offbudget ? 1 : 0,
    closed: 0,
  });
  await db.insertPayee({ id: `payee-${id}`, name: '', transfer_acct: id });
}
const envelope = (
  id: string,
  kind: CfmRecord['kind'],
  data: Record<string, unknown>,
): CfmRecord => ({ id, kind, data, updatedAt: new Date().toISOString() });

test('dated balance targets include uncleared entries, preserve later entries, retry safely, and undo atomically', async () => {
  await account('property');
  await db.insertTransaction({
    id: 'opening',
    account: 'property',
    date: '2026-01-01',
    amount: 20000,
    cleared: false,
  });
  await db.insertTransaction({
    id: 'later',
    account: 'property',
    date: '2026-03-01',
    amount: -1000,
    cleared: true,
  });
  const input = {
    accountId: 'property',
    targetBalance: -5000,
    date: '2026-02-01',
    reason: 'Correction',
    requestId: 'balance-1',
  };
  const result = await withUndo(() => postAdjustment(input));
  expect(result.adjustment).toBe(-25000);
  expect(await postAdjustment(input)).toEqual(result);
  expect(
    getAccountBalances((await getState()).transactions, '2026-03-01').property,
  ).toBe(-6000);
  await undo();
  expect(
    getAccountBalances((await getState()).transactions, '2026-03-01').property,
  ).toBe(19000);
  expect((await getState()).records).toHaveLength(0);
  const zero = await postAdjustment({
    ...input,
    targetBalance: 20000,
    requestId: 'zero',
  });
  expect(zero.transactionId).toBeNull();
  await account('checking', false);
  await expect(
    postAdjustment({ ...input, accountId: 'checking' }),
  ).rejects.toThrow('off-budget');
  await db.updateAccount({ id: 'property', account_sync_source: 'simpleFin' });
  await expect(
    postAdjustment({ ...input, requestId: 'linked' }),
  ).rejects.toThrow('manual');
});

test('ticket purchase and imported partial repayments allocate cash exactly once', async () => {
  await account('card', false);
  await account('checking', false);
  await account('receivables');
  await db.insertTransaction({
    id: 'purchase',
    account: 'card',
    amount: -40000,
    date: '2026-01-10',
    category: 'tickets',
  });
  for (const friend of ['Alice', 'Bob', 'Carol']) {
    await saveRecord({
      record: envelope(friend, 'obligation', {
        accountId: 'receivables',
        direction: 'receivable',
        counterparty: friend,
        amount: 10000,
        currency: 'USD',
        date: '2026-01-10',
        sourceTransactionId: 'purchase',
        categoryId: 'tickets',
      }),
    });
  }
  let state = await getState();
  expect(getAccountBalances(state.transactions, '2026-02-01')).toMatchObject({
    card: -40000,
    receivables: 30000,
  });
  expect(
    state.transactions
      .filter(row => row.category === 'tickets' && !row.is_parent)
      .reduce((sum, row) => sum + row.amount, 0),
  ).toBe(-10000);
  await db.insertTransaction({
    id: 'deposit',
    account: 'checking',
    amount: 15000,
    date: '2026-01-20',
  });
  await settleObligation({
    obligationId: 'Alice',
    amount: 10000,
    date: '2026-01-20',
    accountId: 'checking',
    transactionId: 'deposit',
    kind: 'payment',
    requestId: 'alice-paid',
  });
  await settleObligation({
    obligationId: 'Bob',
    amount: 5000,
    date: '2026-01-20',
    accountId: 'checking',
    transactionId: 'deposit',
    kind: 'payment',
    requestId: 'bob-part-paid',
  });
  state = await getState();
  expect(getAccountBalances(state.transactions, '2026-02-01')).toMatchObject({
    card: -40000,
    receivables: 15000,
    checking: 15000,
  });
  const bob = getCfmRecords(state.records, 'obligation').find(
    row => row.id === 'Bob',
  )!;
  expect(
    getObligationStatus(
      bob.data,
      getCfmRecords(state.records, 'settlement'),
      '2026-02-01',
      bob.id,
    ).outstanding,
  ).toBe(5000);
  await expect(
    settleObligation({
      obligationId: 'Bob',
      amount: 6000,
      date: '2026-01-21',
      accountId: 'checking',
      kind: 'payment',
      requestId: 'overpaid',
    }),
  ).rejects.toThrow('exceeds');
});

test('realized valuations create dated non-cash ledger history and export without CFM metadata', async () => {
  const { accountId } = await createAccount({
    name: 'Property',
    kind: 'asset',
    initialBalance: 100000,
    date: '2026-01-01',
    currency: 'USD',
    requestId: 'property',
  });
  await saveRecord({
    record: envelope('asset', 'asset', {
      accountId,
      name: 'Property',
      currency: 'USD',
      acquisitionDate: '2026-01-01',
      acquisitionValue: 100000,
      policy: { method: 'manual', effectiveDate: '2026-01-01' },
    }),
  });
  await valueAssetAccount({
    assetId: 'asset',
    date: '2026-06-01',
    value: 120000,
    reason: 'Appraisal',
    requestId: 'appraisal',
  });
  await valueAssetAccount({
    assetId: 'asset',
    date: '2026-06-01',
    value: 120000,
    reason: 'Appraisal',
    requestId: 'appraisal',
  });
  const before = await getState();
  expect(getAccountBalances(before.transactions, '2026-05-31')[accountId]).toBe(
    100000,
  );
  expect(getAccountBalances(before.transactions, '2026-06-01')[accountId]).toBe(
    120000,
  );
  const exported = await exportForActualBudget();
  const upstream = safeUnzip(exported.data);
  const target = await sqlite.openDatabase(Buffer.from(upstream['db.sqlite']!));
  try {
    expect(
      sqlite.runQuery(
        target,
        "SELECT * FROM notes WHERE id LIKE 'cfm:v1:%'",
        [],
        true,
      ),
    ).toHaveLength(0);
    expect(
      sqlite.runQuery(
        target,
        'SELECT * FROM transactions WHERE tombstone=0',
        [],
        true,
      ),
    ).toHaveLength(2);
    expect(exported.receipt.accounts[0]?.checkpoints).toEqual([
      { date: '20260101', balance: 100000 },
      { date: '20260601', balance: 120000 },
    ]);
    const archive = safeUnzip(exported.archive);
    expect(archive['full-cfm-backup.zip']).toBeDefined();
    expect(
      new TextDecoder().decode(archive['cfm-records-and-audit.json']),
    ).toContain('Appraisal');
    const restored = await sqlite.openDatabase(
      Buffer.from(safeUnzip(archive['full-cfm-backup.zip']!)['db.sqlite']!),
    );
    try {
      expect((await convertCfmDatabase(restored)).checkpoints).toEqual(
        exported.receipt.accounts,
      );
    } finally {
      sqlite.closeDatabase(restored);
    }
  } finally {
    sqlite.closeDatabase(target);
  }
  await expect(
    exportForActualBudget({ targetVersion: 'unsupported' }),
  ).rejects.toThrow('pinned');
});
