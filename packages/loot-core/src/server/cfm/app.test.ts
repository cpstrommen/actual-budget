import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as sqlite from '#platform/server/sqlite';
import * as db from '#server/db';
import * as prefs from '#server/prefs';
import { createSchedule } from '#server/schedules/app';
import { batchUpdateTransactions } from '#server/transactions';
import { clearUndo, undo, withUndo } from '#server/undo';
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
import {
  projectCfmLiquidity,
  runReport,
  scheduleForecastEvents,
} from './views';

let temporaryDirectory: string;
beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-31T12:00:00Z'));
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
  vi.restoreAllMocks();
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

test('write-offs, allocation reversals, and payable recognition change expenses without moving cash', async () => {
  await account('checking', false);
  await account('ar');
  await account('ap');
  await db.insertTransaction({
    id: 'opening-ar',
    account: 'ar',
    date: '2026-01-01',
    amount: 10000,
  });
  await saveRecord({
    record: envelope('old-claim', 'obligation', {
      accountId: 'ar',
      direction: 'receivable',
      counterparty: 'Alice',
      amount: 10000,
      currency: 'USD',
      date: '2026-01-01',
      existingBalance: true,
      categoryId: 'tickets',
    }),
  });
  expect(
    getAccountBalances((await getState()).transactions, '2026-01-01').ar,
  ).toBe(10000);
  await settleObligation({
    obligationId: 'old-claim',
    amount: 4000,
    date: '2026-01-10',
    accountId: 'checking',
    kind: 'writeoff',
    notes: 'Uncollectible',
    requestId: 'loss',
  });
  let state = await getState();
  expect(getAccountBalances(state.transactions, '2026-02-01')).toMatchObject({
    checking: 0,
    ar: 6000,
  });
  expect(
    state.transactions
      .filter(row => row.category === 'tickets' && !row.is_parent)
      .reduce((sum, row) => sum + row.amount, 0),
  ).toBe(-4000);
  await settleObligation({
    obligationId: 'old-claim',
    amount: 4000,
    date: '2026-01-11',
    accountId: 'checking',
    kind: 'reversal',
    reversesId: 'settlement:loss',
    notes: 'Recovery now expected',
    requestId: 'restore',
  });
  await saveRecord({
    record: envelope('invoice', 'obligation', {
      accountId: 'ap',
      direction: 'payable',
      counterparty: 'Vendor',
      amount: 5000,
      currency: 'USD',
      date: '2026-01-12',
      counterAccountId: 'checking',
      categoryId: 'tickets',
    }),
  });
  state = await getState();
  expect(getAccountBalances(state.transactions, '2026-02-01')).toMatchObject({
    checking: 0,
    ar: 10000,
    ap: -5000,
  });
  expect(
    state.transactions
      .filter(row => row.category === 'tickets' && !row.is_parent)
      .reduce((sum, row) => sum + row.amount, 0),
  ).toBe(-5000);
  await expect(
    batchUpdateTransactions({
      updated: [{ id: 'cfm-recognition-invoice', amount: 1 }],
    }),
  ).rejects.toThrow('managed');
  // An unchanged bank-import refresh must not be mistaken for a financial edit.
  await batchUpdateTransactions({
    updated: [
      { id: 'cfm-recognition-invoice', amount: -5000, date: '2026-01-12' },
    ],
  });
  await batchUpdateTransactions({
    updated: [{ id: 'cfm-recognition-invoice', notes: 'Additional note' }],
  });
});

test('scheduled realization does not compound a simple-rate policy or rewrite historical policies', async () => {
  await account('investment');
  await db.insertTransaction({
    id: 'opening-investment',
    account: 'investment',
    date: '2026-01-01',
    amount: 120000,
  });
  const asset = await saveRecord({
    record: envelope('holding', 'asset', {
      accountId: 'investment',
      name: 'Holding',
      currency: 'USD',
      acquisitionDate: '2026-01-01',
      acquisitionValue: 120000,
      policy: {
        method: 'fixed-rate',
        effectiveDate: '2026-01-01',
        baseValue: 120000,
        annualRateBasisPoints: 1200,
        compound: false,
        postingFrequency: 'monthly',
      },
    }),
  });
  await valueAssetAccount({
    assetId: asset.id,
    date: '2026-02-01',
    value: 0,
    modeled: true,
    requestId: 'feb',
  });
  await valueAssetAccount({
    assetId: asset.id,
    date: '2026-03-01',
    value: 0,
    modeled: true,
    requestId: 'mar',
  });
  expect(
    getAccountBalances((await getState()).transactions, '2026-03-01')
      .investment,
  ).toBe(122400);
  const current = (await getState()).records.find(row => row.id === asset.id)!;
  await expect(
    saveRecord({
      record: {
        ...current,
        data: {
          ...current.data,
          policy: { method: 'manual', effectiveDate: '2026-01-01' },
        },
      },
    }),
  ).rejects.toThrow('later effective');
});

test('every report section materializes and an archive survives subsequent ledger and template edits', async () => {
  await account('checking', false);
  await db.insertTransaction({
    id: 'income',
    account: 'checking',
    date: '2026-01-01',
    amount: 100000,
  });
  await account('asset');
  await saveRecord({
    record: envelope('report-asset', 'asset', {
      accountId: 'asset',
      name: 'Car',
      currency: 'USD',
      acquisitionDate: '2026-01-01',
      acquisitionValue: 120000,
      policy: {
        method: 'straight-line',
        effectiveDate: '2026-01-01',
        usefulLifeMonths: 60,
      },
    }),
  });
  const sections = [
    'balance-sheet',
    'annual-plan',
    'assets',
    'obligations',
    'liquidity',
    'table',
    'chart',
  ].map(type => ({
    id: type,
    type,
    title: type,
    ...(type === 'table' || type === 'chart'
      ? {
          source: 'accounts',
          valueKeys: ['amount'],
          xKey: 'name',
          chartType: 'bar',
        }
      : {}),
  }));
  const template = await saveRecord({
    record: envelope('report-template', 'report-template', {
      name: 'Annual statement',
      period: 'annual',
      revision: 1,
      sections,
    }),
  });
  const run = await runReport({
    templateId: template.id,
    asOf: '2026-10-31',
    requestId: 'report-2026',
  });
  const original = JSON.stringify(run.data);
  expect(
    Array.isArray(run.data.sections) &&
      run.data.sections.find(section => section.id === 'assets')?.rows[0],
  ).toMatchObject({
    opening: 0,
    additions: 120000,
    disposals: 0,
    change: -18000,
    value: 102000,
  });
  expect(Array.isArray(run.data.sections) && run.data.sections.length).toBe(7);
  await db.insertTransaction({
    id: 'correction',
    account: 'checking',
    date: '2026-01-01',
    amount: 1000,
  });
  await saveRecord({
    record: {
      ...template,
      data: { ...template.data, name: 'Revised template', revision: 2 },
    },
  });
  expect(
    JSON.stringify(
      (await getState()).records.find(row => row.id === run.id)?.data,
    ),
  ).toBe(original);
  expect((await exportForActualBudget()).archive.length).toBeGreaterThan(0);
});

test('native transfer schedules replace automatic card payments without counting cash twice', async () => {
  await account('checking', false);
  await account('card', false);
  await db.insertTransaction({
    id: 'cash-opening',
    account: 'checking',
    date: '2026-01-01',
    amount: 100000,
  });
  await db.insertTransaction({
    id: 'card-opening',
    account: 'card',
    date: '2026-01-01',
    amount: -10000,
  });
  await saveRecord({
    record: envelope('checking-class', 'classification', {
      accountId: 'checking',
      kind: 'cash',
      effectiveDate: '2026-01-01',
      currency: 'USD',
      isLiquid: true,
    }),
  });
  await saveRecord({
    record: envelope('card-class', 'classification', {
      accountId: 'card',
      kind: 'credit-card',
      effectiveDate: '2026-01-01',
      currency: 'USD',
      isLiquid: false,
      paymentAccountId: 'checking',
      statementDay: 15,
      paymentDay: 10,
    }),
  });
  await createSchedule({
    schedule: { name: 'Card payment' },
    conditions: [
      { field: 'date', op: 'is', value: '2026-11-10' },
      { field: 'account', op: 'is', value: 'checking' },
      { field: 'payee', op: 'is', value: 'payee-card' },
      { field: 'amount', op: 'is', value: -5000 },
    ],
  });
  const events = await scheduleForecastEvents(
    '2026-11-01',
    '2026-11-30',
    'USD',
  );
  expect(events[0]?.transferAccountId).toBe('card');
  expect(
    (
      await projectCfmLiquidity({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      })
    ).closingLiquidity,
  ).toBe(90000);
});

test('unsupported financial tables refuse conversion while leaving the source ledger intact', async () => {
  await account('checking');
  await db.insertTransaction({
    id: 'retained',
    account: 'checking',
    date: '2026-01-01',
    amount: 12345,
  });
  db.execQuery(
    'CREATE TABLE unsupported_financial_data (id TEXT PRIMARY KEY, amount INTEGER)',
  );
  db.runQuery('INSERT INTO unsupported_financial_data VALUES (?,?)', [
    'retained',
    6789,
  ]);
  await expect(exportForActualBudget()).rejects.toThrow(
    'Unsupported financial table',
  );
  expect(
    getAccountBalances((await getState()).transactions, '2026-01-01').checking,
  ).toBe(12345);
  expect(
    (
      await db.first<{ amount: number }>(
        'SELECT amount FROM unsupported_financial_data',
      )
    )?.amount,
  ).toBe(6789);
});

test('allocating an imported transaction with an apostrophe in its identifier preserves the split', async () => {
  await account('card', false);
  await account('ar');
  await db.insertTransaction({
    id: "merchant's-id",
    account: 'card',
    amount: -20000,
    date: '2026-01-01',
    category: 'tickets',
  });
  await saveRecord({
    record: envelope('safe-obligation', 'obligation', {
      accountId: 'ar',
      direction: 'receivable',
      counterparty: 'Friend',
      amount: 10000,
      currency: 'USD',
      date: '2026-01-01',
      sourceTransactionId: "merchant's-id",
    }),
  });
  expect(
    getAccountBalances((await getState()).transactions, '2026-01-01'),
  ).toMatchObject({ card: -20000, ar: 10000 });
});
