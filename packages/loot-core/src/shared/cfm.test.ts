import { describe, expect, it } from 'vitest';

import type {
  CfmAccountClassification,
  CfmAnnualPlan,
  CfmAsset,
  CfmForecastEvent,
  CfmLedgerTransaction,
  CfmObligation,
  CfmRecord,
  CfmSettlement,
} from '#types/models/cfm';

import {
  allocateAnnualPlan,
  assertCfmDate,
  buildBalanceSheet,
  getAccountBalances,
  getAnnualPlanPerformance,
  getAssetValuation,
  getCfmRecords,
  getObligationStatus,
  projectLiquidity,
  validateCfmRecord,
} from './cfm';

const currency = 'USD';
const classification: CfmAccountClassification = {
  accountId: 'checking',
  effectiveDate: '2026-01-01',
  kind: 'cash',
  currency,
  isLiquid: true,
};
const annual: CfmAnnualPlan = {
  year: 2026,
  categoryId: 'food',
  amount: 120000,
  currency,
  revision: 1,
};
const car: CfmAsset = {
  accountId: 'car',
  name: 'Car',
  acquisitionDate: '2026-01-01',
  acquisitionValue: 120000,
  currency,
  policy: {
    effectiveDate: '2026-01-01',
    method: 'straight-line',
    usefulLifeMonths: 12,
    residualValue: 0,
  },
};
const obligation: CfmObligation = {
  accountId: 'ar',
  direction: 'receivable',
  counterparty: 'Friend',
  amount: 10000,
  currency,
  date: '2026-01-01',
  dueDate: '2026-02-01',
};
function settlement(id: string, data: CfmSettlement): CfmRecord<CfmSettlement> {
  return { id, kind: 'settlement', data, updatedAt: `${data.date}T12:00:00Z` };
}
function tx(
  id: string,
  account: string,
  date: string,
  amount: number,
  fields: Partial<CfmLedgerTransaction> = {},
): CfmLedgerTransaction {
  return { id, account, date, amount, ...fields };
}

const cashAccounts = [
  { id: 'checking', name: 'Checking' },
  { id: 'savings', name: 'Savings' },
];
const liquidClasses = [
  classification,
  { ...classification, accountId: 'savings' },
];
const opening = [tx('open', 'checking', '2026-01-01', 100000)];

function forecast(events: CfmForecastEvent[] = []) {
  return projectLiquidity({
    accounts: cashAccounts,
    classifications: liquidClasses,
    transactions: opening,
    events,
    currency,
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  });
}

describe('CFM ledger and annual plans', () => {
  it('rejects impossible dates and currency mixing instead of coercing them', () => {
    expect(() => assertCfmDate('2026-02-29')).toThrow();
    expect(() => assertCfmDate('2026-13-01')).toThrow();
    expect(() => assertCfmDate('2026-01-01T12:00:00Z')).toThrow();
    expect(() => assertCfmDate('2024-02-29')).not.toThrow();
    expect(() =>
      buildBalanceSheet({
        accounts: cashAccounts,
        transactions: opening,
        classifications: [{ ...classification, currency: 'EUR' }],
        asOf: '2026-01-01',
        currency,
      }),
    ).toThrow(/combine/);
  });

  it('preserves signed as-of balances, split parents, uncleared and future transactions correctly', () => {
    const transactions = [
      tx('open', 'checking', '2026-01-01', 100000),
      tx('parent', 'checking', '2026-01-10', -40000, { is_parent: true }),
      tx('personal', 'checking', '2026-01-10', -10000, {
        is_child: true,
        parent_id: 'parent',
        category: 'food',
      }),
      tx('shared', 'checking', '2026-01-10', -30000, {
        is_child: true,
        parent_id: 'parent',
      }),
      tx('uncleared', 'checking', '2026-01-20', -5000, { cleared: false }),
      tx('future', 'checking', '2026-02-01', -10000),
      tx('deleted', 'checking', '2026-01-01', 20000, { tombstone: true }),
    ];
    expect(getAccountBalances(transactions, '2026-01-31')).toEqual({
      checking: 55000,
    });
    expect(getAccountBalances(transactions, '2026-02-01')).toEqual({
      checking: 45000,
    });
    expect(
      getAnnualPlanPerformance(annual, transactions, '2026-01-31').actualYtd,
    ).toBe(10000);
  });

  it('allocates every cent exactly and uses deterministic largest remainders', () => {
    expect(allocateAnnualPlan({ ...annual, amount: 100 })).toEqual([
      9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8,
    ]);
    expect(
      allocateAnnualPlan({
        ...annual,
        amount: 100,
        allocationMethod: 'weighted',
        monthlyWeights: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      }),
    ).toEqual([33, 67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() =>
      allocateAnnualPlan({ ...annual, monthlyAmounts: [1, 2] }),
    ).toThrow(/twelve/);
    expect(() =>
      allocateAnnualPlan({ ...annual, monthlyAmounts: Array(12).fill(1) }),
    ).toThrow(/sum/);
    expect(() => allocateAnnualPlan({ ...annual, amount: 0.1 })).toThrow(
      /integer/,
    );
  });

  it('keeps a November insurance payment out of earlier expected spending', () => {
    const insurance = {
      ...annual,
      amount: 20000,
      categoryId: 'insurance',
      datedAmounts: [{ date: '2026-11-15', amount: 20000 }],
    };
    expect(
      getAnnualPlanPerformance(insurance, [], '2026-10-31').expectedYtd,
    ).toBe(0);
    expect(
      getAnnualPlanPerformance(insurance, [], '2026-11-14').expectedYtd,
    ).toBe(0);
    expect(
      getAnnualPlanPerformance(insurance, [], '2026-11-15').expectedYtd,
    ).toBe(20000);
    expect(allocateAnnualPlan(insurance)[10]).toBe(20000);
  });

  it('compares YTD using leap-day proration, refunds, transfers and plan revision', () => {
    const plan = { ...annual, year: 2024, revision: 3 };
    const transactions = [
      tx('expense', 'checking', '2024-01-01', -16000, { category: 'food' }),
      tx('refund', 'checking', '2024-02-01', 1000, { category: 'food' }),
      tx('transfer', 'checking', '2024-02-01', -3000, {
        category: 'food',
        transfer_id: 'other',
      }),
    ];
    const result = getAnnualPlanPerformance(plan, transactions, '2024-02-15');
    expect(result.expectedYtd).toBe(10000 + Math.round((10000 * 15) / 29));
    expect(result.actualYtd).toBe(15000);
    expect(result.variance).toBe(15000 - result.expectedYtd);
    expect(result.remaining).toBe(105000);
    expect(result.revision).toBe(3);
    expect(
      getAnnualPlanPerformance(plan, transactions, '2023-12-31').actualYtd,
    ).toBe(0);
    expect(
      getAnnualPlanPerformance(plan, transactions, '2024-02-15', 'full-month')
        .expectedYtd,
    ).toBe(20000);
  });
});

describe('CFM valuation policies and balance sheets', () => {
  it('depreciates monthly to residual without changing past observations and ends at disposal', () => {
    expect(getAssetValuation(car, '2025-12-31').value).toBe(0);
    expect(getAssetValuation(car, '2026-02-01').value).toBe(110000);
    expect(getAssetValuation(car, '2026-07-01').value).toBe(60000);
    expect(getAssetValuation(car, '2028-01-01').value).toBe(0);
    expect(
      getAssetValuation({ ...car, disposalDate: '2026-07-01' }, '2026-07-01')
        .source,
    ).toBe('disposed');
  });

  it('compounds annual rates and applies manual overrides from their effective date', () => {
    const asset: CfmAsset = {
      ...car,
      policy: {
        effectiveDate: '2026-01-01',
        method: 'fixed-rate',
        annualRateBasisPoints: 1000,
        postingFrequency: 'annually',
      },
      observations: [
        {
          id: 'quote',
          date: '2027-01-01',
          value: 150000,
          recordedAt: '2027-01-02T12:00:00Z',
          source: 'appraisal',
        },
      ],
    };
    expect(getAssetValuation(asset, '2026-12-31').value).toBe(120000);
    expect(getAssetValuation(asset, '2027-01-01')).toMatchObject({
      value: 150000,
      source: 'observed',
      observationId: 'quote',
    });
    expect(getAssetValuation(asset, '2028-01-01').value).toBe(165000);
    expect(
      getAssetValuation({ ...asset, observations: [] }, '2027-01-01').value,
    ).toBe(132000);
  });

  it('preserves historical policy revisions and honors irregular schedules on the exact date', () => {
    const asset: CfmAsset = {
      ...car,
      policyHistory: [{ effectiveDate: '2026-01-01', method: 'manual' }],
      policy: {
        effectiveDate: '2026-07-01',
        method: 'schedule',
        schedule: [
          { date: '2026-07-15', amount: 90000 },
          { date: '2026-09-03', amount: 80000 },
        ],
      },
    };
    expect(getAssetValuation(asset, '2026-06-30').value).toBe(120000);
    expect(getAssetValuation(asset, '2026-07-14').value).toBe(120000);
    expect(getAssetValuation(asset, '2026-07-15').value).toBe(90000);
    expect(getAssetValuation(asset, '2026-09-03').value).toBe(80000);
  });

  it('uses ledger values once and keeps gross property, debt and net equity separate', () => {
    const sheet = buildBalanceSheet({
      accounts: [
        ...cashAccounts,
        { id: 'property', name: 'Property' },
        { id: 'mortgage', name: 'Mortgage' },
      ],
      transactions: [
        ...opening,
        tx('property', 'property', '2026-01-01', 30000000),
        tx('debt', 'mortgage', '2026-01-01', -20000000),
      ],
      classifications: [
        ...liquidClasses,
        {
          ...classification,
          accountId: 'property',
          kind: 'asset',
          isLiquid: false,
        },
        {
          ...classification,
          accountId: 'mortgage',
          kind: 'loan',
          isLiquid: false,
        },
      ],
      asOf: '2026-01-01',
      currency,
    });
    expect(sheet.totalAssets).toBe(30100000);
    expect(sheet.totalLiabilities).toBe(20000000);
    expect(sheet.netEquity).toBe(10100000);
    expect(sheet.liquidity).toBe(100000);
    expect(sheet.totalAssets).toBe(sheet.totalLiabilities + sheet.netEquity);
  });
});

describe('CFM obligations and validation', () => {
  it('tracks partial settlement, write-off and reversal without allowing overpayment', () => {
    const paid = settlement('paid', {
      obligationId: 'ticket',
      date: '2026-01-10',
      amount: 4000,
      kind: 'payment',
    });
    const writeoff = settlement('writeoff', {
      obligationId: 'ticket',
      date: '2026-01-20',
      amount: 6000,
      kind: 'writeoff',
      notes: 'Released',
    });
    expect(getObligationStatus(obligation, [paid], '2026-01-15')).toMatchObject(
      { outstanding: 6000, paid: 4000, status: 'partially-settled' },
    );
    expect(
      getObligationStatus(obligation, [paid, writeoff], '2026-01-31'),
    ).toMatchObject({
      outstanding: 0,
      writtenOff: 6000,
      status: 'written-off',
    });
    const reversal = settlement('reverse', {
      obligationId: 'ticket',
      date: '2026-02-02',
      amount: 6000,
      kind: 'reversal',
      reversesId: 'writeoff',
      notes: 'Reopened',
    });
    expect(
      getObligationStatus(obligation, [paid, writeoff, reversal], '2026-02-03'),
    ).toMatchObject({ outstanding: 6000, writtenOff: 0, status: 'overdue' });
    expect(() =>
      getObligationStatus(
        obligation,
        [settlement('over', { ...paid.data, amount: 11000 })],
        '2026-01-31',
      ),
    ).toThrow(/exceeds/);
    expect(() =>
      getObligationStatus(
        obligation,
        [
          paid,
          { ...reversal, data: { ...reversal.data, reversesId: 'missing' } },
        ],
        '2026-02-03',
      ),
    ).toThrow(/missing/);
  });

  it('does not apply future settlement history to earlier statements', () => {
    const future = settlement('future', {
      obligationId: 'ticket',
      date: '2026-03-01',
      amount: 10000,
      kind: 'payment',
    });
    expect(
      getObligationStatus(obligation, [future], '2026-01-01').outstanding,
    ).toBe(10000);
    expect(
      getObligationStatus(obligation, [future], '2026-03-01').outstanding,
    ).toBe(0);
  });

  it('narrows validated CFM data and rejects malformed saved records', () => {
    const record: CfmRecord = {
      id: 'classification',
      kind: 'classification',
      data: classification,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(getCfmRecords([record], 'classification')[0]?.data.kind).toBe(
      'cash',
    );
    expect(() =>
      validateCfmRecord({
        ...record,
        data: { ...classification, kind: 'credit-card', isLiquid: true },
      }),
    ).toThrow(/liquidity/);
    expect(() =>
      validateCfmRecord({
        ...record,
        data: { ...classification, currency: 'usd' },
      }),
    ).toThrow(/Currency/);
    expect(() =>
      validateCfmRecord({
        ...record,
        data: { ...classification, paymentDay: 32 },
      }),
    ).toThrow(/days/);
    expect(() =>
      validateCfmRecord({ ...record, updatedAt: 'not a date' }),
    ).toThrow(/envelope/);
  });
});

describe('CFM liquidity projection', () => {
  it('nets transfers between included accounts and deducts transfers out of eligible cash', () => {
    const internal: CfmForecastEvent = {
      id: 'transfer',
      accountId: 'checking',
      transferAccountId: 'savings',
      date: '2026-01-02',
      amount: -50000,
      currency,
      source: 'manual',
    };
    expect(forecast([internal]).closingLiquidity).toBe(100000);
    const result = projectLiquidity({
      accounts: cashAccounts,
      classifications: [
        classification,
        { ...classification, accountId: 'savings', isLiquid: false },
      ],
      transactions: opening,
      events: [internal],
      currency,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(result.closingLiquidity).toBe(50000);
    expect(result.excludedAccounts).toContain('savings');
  });

  it('deduplicates a posted future schedule and preserves the balance identity each day', () => {
    const schedule: CfmForecastEvent = {
      id: 'schedule',
      accountId: 'checking',
      date: '2026-01-10',
      amount: -10000,
      currency,
      source: 'schedule',
      scheduleId: 'rent',
    };
    const result = projectLiquidity({
      accounts: cashAccounts,
      classifications: liquidClasses,
      transactions: [
        ...opening,
        tx('posted', 'checking', '2026-01-10', -10000, { schedule: 'rent' }),
      ],
      events: [schedule],
      currency,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(result.closingLiquidity).toBe(90000);
    for (const point of result.daily)
      expect(point.closing).toBe(
        point.opening + point.inflows - point.outflows,
      );
    expect(result.monthly[0]?.closing).toBe(result.closingLiquidity);
  });

  it('excludes uncertain receivables, reports undated liabilities and can delay collections', () => {
    const ar: CfmRecord<CfmObligation> = {
      id: 'ticket',
      kind: 'obligation',
      data: obligation,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const ap: CfmRecord<CfmObligation> = {
      ...ar,
      id: 'undated',
      data: { ...obligation, direction: 'payable', dueDate: undefined },
    };
    const common = {
      accounts: [...cashAccounts, { id: 'ar', name: 'Receivables' }],
      classifications: liquidClasses,
      transactions: opening,
      obligations: [ar, ap],
      currency,
      startDate: '2026-01-01',
      endDate: '2026-02-28',
    };
    expect(projectLiquidity(common).closingLiquidity).toBe(100000);
    const result = projectLiquidity({
      ...common,
      includeReceivables: true,
      receivableDelayDays: 10,
    });
    expect(result.closingLiquidity).toBe(110000);
    expect(
      result.daily.find(point => point.date === '2026-02-11')?.inflows,
    ).toBe(10000);
    expect(result.undatedObligations).toEqual(['undated']);
  });

  it('uses annual plan residuals once after posted spending and scheduled commitments', () => {
    const plan = { ...annual, amount: 120000 };
    const result = projectLiquidity({
      accounts: cashAccounts,
      classifications: liquidClasses,
      transactions: [
        ...opening,
        tx('food', 'checking', '2026-01-01', -3000, { category: 'food' }),
      ],
      events: [
        {
          id: 'food2',
          accountId: 'checking',
          date: '2026-01-10',
          amount: -2000,
          categoryId: 'food',
          source: 'schedule',
          currency,
        },
      ],
      annualPlans: [plan],
      currency,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(result.openingLiquidity).toBe(97000);
    expect(result.closingLiquidity).toBe(90000);
    expect(result.daily.at(-1)?.outflows).toBe(5000);
  });

  it('moves card purchases to the payment date rather than charging cash on purchase', () => {
    const card: CfmAccountClassification = {
      ...classification,
      accountId: 'card',
      kind: 'credit-card',
      isLiquid: false,
      paymentAccountId: 'checking',
      statementDay: 15,
      paymentDay: 10,
    };
    const result = projectLiquidity({
      accounts: [...cashAccounts, { id: 'card', name: 'Card' }],
      classifications: [...liquidClasses, card],
      transactions: [...opening, tx('debt', 'card', '2026-01-01', -10000)],
      events: [
        {
          id: 'charge',
          accountId: 'card',
          date: '2026-01-20',
          amount: -5000,
          currency,
          source: 'schedule',
        },
      ],
      currency,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
    expect(result.currentLiabilities).toBe(10000);
    expect(
      result.daily.find(point => point.date === '2026-01-10')?.outflows,
    ).toBe(10000);
    expect(
      result.daily.find(point => point.date === '2026-01-20')?.outflows,
    ).toBe(0);
    expect(
      result.daily.find(point => point.date === '2026-03-10')?.outflows,
    ).toBe(5000);
    expect(result.closingLiquidity).toBe(85000);
  });

  it('has no infinite ratio at zero liabilities and does not project non-cash valuations', () => {
    const result = forecast([
      {
        id: 'value',
        accountId: 'checking',
        date: '2026-01-10',
        amount: 90000,
        currency,
        source: 'manual',
        nonCash: true,
      },
    ]);
    expect(result.coverageRatio).toBeNull();
    expect(result.closingLiquidity).toBe(100000);
    expect(() =>
      forecast([
        {
          id: 'fx',
          accountId: 'checking',
          date: '2026-01-10',
          amount: 10000,
          currency: 'EUR',
          source: 'manual',
        },
      ]),
    ).toThrow(/currencies/);
  });
});
