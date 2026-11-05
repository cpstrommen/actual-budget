#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Shared, synthetic 2026 example for UI exploration and the upstream compatibility harness. */
export async function createCfmExample(api) {
  let checking, savings, card, category, insurance;
  await api.runImport('Actual CFM example — 2026', async () => {
    checking = await api.createAccount({ name: 'Checking', offbudget: false });
    savings = await api.createAccount({ name: 'Savings', offbudget: false });
    card = await api.createAccount({ name: 'Credit card', offbudget: false });
    const group = await api.createCategoryGroup({
      name: 'Annual expenses',
      is_income: false,
    });
    category = await api.createCategory({
      name: 'Entertainment',
      group_id: group,
      is_income: false,
    });
    insurance = await api.createCategory({
      name: 'Annual insurance',
      group_id: group,
      is_income: false,
    });
    await api.addTransactions(checking, [
      {
        id: 'example-checking-opening',
        date: '2026-01-01',
        amount: 1000000,
        cleared: true,
        reconciled: true,
        notes: 'Synthetic opening balance',
      },
      {
        id: 'example-refund',
        date: '2026-02-01',
        amount: 1000,
        category,
        notes: 'Ticket refund',
      },
    ]);
    await api.addTransactions(savings, [
      {
        id: 'example-savings-opening',
        date: '2026-01-01',
        amount: 500000,
        cleared: true,
      },
    ]);
    await api.addTransactions(card, [
      {
        id: 'example-card-opening',
        date: '2026-01-01',
        amount: -15000,
        cleared: true,
      },
      {
        id: 'example-tickets',
        date: '2026-01-10',
        amount: -40000,
        category,
        notes: 'Four sports tickets at $100 each',
      },
    ]);
  });
  const put = (id, kind, data) =>
    api.saveCfmRecord({ id, kind, data, updatedAt: new Date().toISOString() });
  for (const accountId of [checking, savings]) {
    await put(`example-class:${accountId}`, 'classification', {
      accountId,
      kind: 'cash',
      isLiquid: true,
      effectiveDate: '2026-01-01',
      currency: 'USD',
    });
  }
  await put('example-card-class', 'classification', {
    accountId: card,
    kind: 'credit-card',
    isLiquid: false,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    liabilityTerm: 'current',
    paymentAccountId: checking,
    statementDay: 15,
    paymentDay: 10,
  });
  async function tracking(requestId, name, kind, initialBalance) {
    return (
      await api.createCfmAccount({
        requestId,
        name,
        kind,
        initialBalance,
        date: '2026-01-01',
        currency: 'USD',
      })
    ).accountId;
  }
  const property = await tracking(
    'example-property',
    'Property',
    'asset',
    30000000,
  );
  const mortgage = await tracking(
    'example-mortgage',
    'Mortgage',
    'loan',
    -20000000,
  );
  const investment = await tracking(
    'example-investment',
    'Investment holdings',
    'investment',
    5000000,
  );
  const ar = await tracking('example-ar', 'Receivables', 'receivable', 0);
  const ap = await tracking('example-ap', 'Payables', 'payable', 0);
  await put('example-property-policy', 'asset', {
    accountId: property,
    name: 'Property',
    currency: 'USD',
    acquisitionDate: '2026-01-01',
    acquisitionValue: 30000000,
    linkedDebtAccountId: mortgage,
    policy: { method: 'manual', effectiveDate: '2026-01-01' },
  });
  await api.valueCfmAsset({
    assetId: 'example-property-policy',
    date: '2026-06-01',
    value: 31000000,
    reason: 'Independent appraisal — synthetic example',
    requestId: 'example-appraisal',
  });
  const home = (await api.getCfmState()).records.find(
    record => record.id === 'example-property-policy',
  );
  await api.saveCfmRecord({
    ...home,
    data: {
      ...home.data,
      policy: { method: 'source-average', effectiveDate: '2026-10-01' },
    },
  });
  for (const [sourceId, name, value, url] of [
    [
      'example-tax',
      'Tax assessment',
      28000000,
      'https://assessor.example/property/123',
    ],
    ['example-zillow', 'Zillow estimate', 33000000, 'https://www.zillow.com/'],
    ['example-redfin', 'Redfin estimate', 32000000, 'https://www.redfin.com/'],
  ]) {
    const current = (await api.getCfmState()).records.find(
      record => record.id === 'example-property-policy',
    );
    await api.updateCfmAssetSource({
      assetId: current.id,
      sourceId,
      name,
      value,
      url,
      date: '2026-10-31',
      expectedUpdatedAt: current.updatedAt,
      requestId: sourceId,
    });
  }
  await put('example-investment-policy', 'asset', {
    accountId: investment,
    name: 'Investment holdings',
    currency: 'USD',
    acquisitionDate: '2026-01-01',
    acquisitionValue: 5000000,
    policy: {
      method: 'fixed-rate',
      effectiveDate: '2026-01-01',
      annualRateBasisPoints: 500,
      compound: true,
      postingFrequency: 'monthly',
    },
  });
  await put('example-annual-entertainment', 'annual-plan', {
    year: 2026,
    categoryId: category,
    amount: 120000,
    currency: 'USD',
    revision: 1,
    allocationMethod: 'equal',
  });
  await put('example-annual-insurance', 'annual-plan', {
    year: 2026,
    categoryId: insurance,
    amount: 120000,
    currency: 'USD',
    revision: 1,
    allocationMethod: 'equal',
    datedAmounts: [{ date: '2026-11-15', amount: 120000 }],
  });
  for (const friend of ['Alice', 'Bob', 'Carol']) {
    await put(`example-claim:${friend}`, 'obligation', {
      accountId: ar,
      direction: 'receivable',
      counterparty: friend,
      amount: 10000,
      currency: 'USD',
      date: '2026-01-10',
      expectedDate: '2026-11-05',
      sourceTransactionId: 'example-tickets',
      categoryId: category,
    });
  }
  await api.settleCfmObligation({
    obligationId: 'example-claim:Alice',
    amount: 10000,
    date: '2026-02-01',
    accountId: checking,
    kind: 'payment',
    requestId: 'example-alice-paid',
  });
  await api.settleCfmObligation({
    obligationId: 'example-claim:Bob',
    amount: 5000,
    date: '2026-02-02',
    accountId: checking,
    kind: 'payment',
    requestId: 'example-bob-part-paid',
  });
  await put('example-vendor-invoice', 'obligation', {
    accountId: ap,
    direction: 'payable',
    counterparty: 'Equipment vendor',
    amount: 25000,
    currency: 'USD',
    date: '2026-10-01',
    dueDate: '2026-11-20',
    counterAccountId: checking,
    categoryId: category,
    notes: 'Non-cash recognition; pay in November',
  });
  const cardPayee = (await api.getPayees()).find(
    payee => payee.transfer_acct === card,
  );
  if (cardPayee) {
    await api.createSchedule({
      name: 'Known card payment',
      account: checking,
      payee: cardPayee.id,
      amount: -20000,
      amountOp: 'is',
      date: '2026-11-10',
      posts_transaction: false,
    });
  }
  await put('example-report-template', 'report-template', {
    name: 'Annual financial position',
    revision: 1,
    period: 'annual',
    sections: [
      { id: 'position', type: 'balance-sheet', title: 'Balance sheet' },
      { id: 'plan', type: 'annual-plan', title: 'Annual performance' },
      { id: 'liquidity', type: 'liquidity', title: 'Liquidity scenario' },
      { id: 'assets', type: 'assets', title: 'Asset valuation roll-forward' },
      {
        id: 'obligations',
        type: 'obligations',
        title: 'Receivables and payables',
      },
      {
        id: 'chart',
        type: 'chart',
        title: 'Account balances',
        source: 'accounts',
        chartType: 'bar',
        xKey: 'name',
        valueKeys: ['amount'],
      },
    ],
  });
  await api.runCfmReport({
    templateId: 'example-report-template',
    asOf: '2026-10-31',
    requestId: 'example-annual-report',
  });
  return {
    checking,
    savings,
    card,
    category,
    insurance,
    property,
    mortgage,
    investment,
    ar,
    ap,
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  const [output, ...extra] = process.argv.slice(2);
  if (!output || extra.length) {
    throw new Error(
      'Usage: node scripts/create-cfm-example.mjs <new-example.zip> (run yarn build:api first)',
    );
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'cfm-example-'));
  const api = await import(
    pathToFileURL(
      path.resolve(import.meta.dirname, '../packages/api/dist/index.js'),
    ).href
  );
  try {
    await api.init({ dataDir: temporary });
    await createCfmExample(api);
    await writeFile(path.resolve(output), await api.exportBudget(), {
      flag: 'wx',
      mode: 0o600,
    });
    process.stdout.write(
      `Synthetic example saved to ${path.resolve(output)}. Import it as a separate Actual CFM file and select 2026-10-31.\n`,
    );
  } finally {
    try {
      await api.shutdown();
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
