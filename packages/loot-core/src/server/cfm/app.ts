import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

import * as asyncStorage from '#platform/server/asyncStorage';
import { createApp } from '#server/app';
import { aqlQuery } from '#server/aql';
import { setBudget } from '#server/budget/actions';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import * as prefs from '#server/prefs';
import { batchMessages } from '#server/sync';
import { batchUpdateTransactions } from '#server/transactions';
import { undoable } from '#server/undo';
import {
  allocateAnnualPlan,
  assertCfmAmount,
  assertCfmCurrency,
  assertCfmDate,
  getAccountBalances,
  getAssetSourceAverage,
  getCfmRecords,
  getObligationStatus,
  normalizeCfmValuationUrl,
  validateCfmRecord,
  valueAsset,
} from '#shared/cfm';
import { validateAutomationConfig } from '#shared/cfm-automation';
import { validateReportTemplate } from '#shared/cfm-reports';
import { q } from '#shared/query';
import type { TransactionEntity } from '#types/models';
import type {
  CfmAccountKind,
  CfmAsset,
  CfmAssetSourceUpdate,
  CfmAssetSourceUpdateResult,
  CfmAssetValuationSource,
  CfmRecord,
  CfmSettlement,
  CfmState,
} from '#types/models/cfm';

import {
  cancelRecoveryExport,
  exportForActualBudget,
  scheduleRecoveryExport,
} from './portability';
import { getAutomationStates, runAutomation } from './runtime';
import {
  appendAudit,
  completeOperation,
  getDeviceId,
  priorOperation,
  readRecord,
  readRecords,
  removeRecord,
  requireRequestId,
  writeRecord,
} from './store';
import { projectCfmLiquidity, runReport } from './views';

export async function getState(): Promise<CfmState> {
  if (!prefs.getPrefs()?.id) throw new Error('Open a financial file first');
  const [accounts, categories, transactions, records, currency, deviceId] =
    await Promise.all([
      aqlQuery(q('accounts').select('*')),
      aqlQuery(q('categories').select('*')),
      aqlQuery(q('transactions').select('*').options({ splits: 'all' })),
      readRecords(),
      db.first<{ value: string }>(
        'SELECT value FROM preferences WHERE id = ?',
        ['defaultCurrencyCode'],
      ),
      getDeviceId(),
    ]);
  const portability = await asyncStorage.getItem('cfm-portability-status');
  const jobStates = await getAutomationStates();
  records.push(
    ...jobStates.map(job => ({
      id: `local-job:${job.jobId}`,
      kind: 'audit' as const,
      updatedAt: job.lastAttemptAt,
      data: { ...job },
    })),
  );
  return {
    accounts: accounts.data,
    categories: categories.data,
    transactions: transactions.data,
    records,
    currency: currency?.value || 'USD',
    deviceId,
    ...(portability?.budgetId === prefs.getPrefs()?.id ? { portability } : {}),
  };
}

export type CreateCfmAccountOptions = {
  name: string;
  kind: CfmAccountKind;
  initialBalance: number;
  date: string;
  currency: string;
  requestId?: string;
};
export async function createAccount(options: CreateCfmAccountOptions) {
  const { name, kind, initialBalance, date, currency } = options;
  if (!name?.trim()) throw new Error('An account name is required');
  assertCfmAmount(initialBalance);
  assertCfmDate(date);
  assertCfmCurrency(currency);
  const requestId = options.requestId || uuidv4();
  const request = {
    operation: 'create-account',
    name: name.trim(),
    kind,
    initialBalance,
    date,
    currency,
  };
  const previous = await priorOperation(requestId, request);
  if (previous && typeof previous.accountId === 'string') {
    return { accountId: previous.accountId };
  }
  const accountId = `cfm-account-${requestId}`;
  const classification: CfmRecord = {
    id: `classification:${accountId}:${date}`,
    kind: 'classification',
    updatedAt: new Date().toISOString(),
    data: {
      accountId,
      effectiveDate: date,
      kind,
      currency,
      isLiquid: kind === 'cash',
      liabilityTerm: kind === 'loan' ? 'long-term' : 'current',
    },
  };
  validateCfmRecord(classification);
  await batchMessages(async () => {
    await db.insertAccount({
      id: accountId,
      name: name.trim(),
      offbudget: 1,
      closed: 0,
    });
    await db.insertPayee({
      id: `cfm-transfer-${requestId}`,
      name: '',
      transfer_acct: accountId,
    });
    if (initialBalance) {
      await db.insertTransaction({
        id: `cfm-opening-${requestId}`,
        account: accountId,
        amount: initialBalance,
        date,
        cleared: true,
        starting_balance_flag: true,
        notes: 'Opening balance',
      });
    }
    await writeRecord(classification);
    await completeOperation(requestId, request, { accountId });
  });
  return { accountId };
}

export async function saveRecord({
  record,
}: {
  record: CfmRecord;
}): Promise<CfmRecord> {
  const state = await getState();
  validateCfmRecord(record, state);
  if (
    record.kind === 'audit' ||
    record.kind === 'settlement' ||
    record.kind === 'report-run'
  ) {
    throw new Error('Use the dedicated financial operation for this record');
  }
  if (record.kind === 'report-template') validateReportTemplate(record.data);
  if (record.kind === 'automation') validateAutomationConfig(record.data);
  const previous = state.records.find(item => item.id === record.id);
  if (previous && previous.kind !== record.kind) {
    throw new Error('A record cannot change its kind');
  }
  if (previous && previous.updatedAt !== record.updatedAt) {
    throw new Error(
      'This record changed on another device. Refresh before saving.',
    );
  }
  if (
    record.kind === 'annual-plan' &&
    state.records.some(
      item =>
        item.id !== record.id &&
        item.kind === 'annual-plan' &&
        item.data.categoryId === record.data.categoryId &&
        item.data.year === record.data.year,
    )
  ) {
    throw new Error('Edit the existing plan for this category and year');
  }
  if (
    record.kind === 'asset' &&
    state.records.some(
      item =>
        item.id !== record.id &&
        item.kind === 'asset' &&
        item.data.accountId === record.data.accountId,
    )
  ) {
    throw new Error('An asset policy already exists for this account');
  }
  if (
    record.kind === 'obligation' &&
    previous &&
    [
      'amount',
      'date',
      'direction',
      'accountId',
      'sourceTransactionId',
      'existingBalance',
      'counterAccountId',
      'categoryId',
    ].some(key => previous.data[key] !== record.data[key])
  ) {
    throw new Error(
      'Reverse an obligation before changing its original financial terms',
    );
  }
  const next: CfmRecord = { ...record, updatedAt: new Date().toISOString() };
  if (next.kind === 'asset') {
    const typed = getCfmRecords([next], 'asset')[0]!;
    const account = state.accounts.find(
      item => item.id === typed.data.accountId,
    );
    if (
      !account?.offbudget ||
      account.closed ||
      account.account_sync_source ||
      account.bank
    ) {
      throw new Error('An asset requires an open manual tracking account');
    }
    const old = getCfmRecords(previous ? [previous] : [], 'asset')[0];
    if (old) {
      if (
        ['accountId', 'acquisitionDate', 'acquisitionValue'].some(
          key => previous?.data[key] !== next.data[key],
        )
      ) {
        throw new Error(
          'Original acquisition terms are immutable; record a new observation',
        );
      }
      if (
        JSON.stringify(old.data.policy) !== JSON.stringify(typed.data.policy) &&
        typed.data.policy.effectiveDate <= old.data.policy.effectiveDate &&
        !typed.data.policyRestatementReason?.trim()
      ) {
        throw new Error(
          'A policy revision needs a later effective date; historical policies are preserved',
        );
      }
      if (
        typed.data.valuationSources !== undefined &&
        JSON.stringify(typed.data.valuationSources) !==
          JSON.stringify(old.data.valuationSources ?? [])
      ) {
        throw new Error(
          'Use the valuation source operation to preserve source history and ledger balances',
        );
      }
      typed.data.valuationSources = old.data.valuationSources;
      typed.data.observations = old.data.observations;
      typed.data.policyHistory =
        JSON.stringify(old.data.policy) === JSON.stringify(typed.data.policy)
          ? old.data.policyHistory
          : [...(old.data.policyHistory || []), old.data.policy];
    }
    if (
      !old &&
      ((typed.data.valuationSources ?? []).some(
        source => source.readings.length,
      ) ||
        (typed.data.policy.method === 'source-average' &&
          typed.data.observations?.length))
    ) {
      throw new Error(
        'Add source estimates through the valuation source operation',
      );
    }
    next.data = { ...typed.data };
  }
  if (next.kind === 'annual-plan') {
    next.data = {
      ...next.data,
      revision: Number(previous?.data.revision || 0) + 1,
    };
  }
  await batchMessages(async () => {
    if (next.kind === 'obligation' && !previous) {
      await bookObligation(next, state);
    }
    await writeRecord(next);
    await appendAudit(previous ? 'record-updated' : 'record-created', {
      recordId: record.id,
      before: previous || null,
      after: next,
    });
  });
  return next;
}

export async function deleteRecord({ id }: { id: string }): Promise<void> {
  const record = await readRecord(id);
  if (!record) return;
  if (
    record.kind === 'obligation' ||
    record.kind === 'settlement' ||
    record.kind === 'audit' ||
    record.kind === 'report-run'
  ) {
    throw new Error(
      'Financial history must be settled or reversed rather than deleted',
    );
  }
  await batchMessages(async () => {
    await removeRecord(id);
    await appendAudit('record-deleted', { record });
  });
}

export type SetBalanceOptions = {
  accountId: string;
  targetBalance: number;
  date: string;
  reason?: string;
  requestId: string;
  expectedBalance?: number;
};
async function adjustment(options: SetBalanceOptions) {
  const { accountId, targetBalance, date, reason, requestId } = options;
  assertCfmAmount(targetBalance);
  assertCfmDate(date);
  requireRequestId(requestId);
  const request = {
    operation: 'set-balance',
    accountId,
    targetBalance,
    date,
    reason: reason || '',
  };
  const old = await priorOperation(requestId, request);
  if (old) {
    return {
      transactionId:
        typeof old.transactionId === 'string' ? old.transactionId : null,
      adjustment: Number(old.adjustment),
      balance: Number(old.balance),
    };
  }
  const state = await getState();
  if (
    getCfmRecords(state.records, 'obligation').some(
      row => row.data.accountId === accountId,
    )
  ) {
    throw new Error(
      'Managed AR/AP balances must be changed through their obligations',
    );
  }
  const account = state.accounts.find(item => item.id === accountId);
  if (
    !account ||
    account.closed ||
    !account.offbudget ||
    account.account_sync_source ||
    account.account_id ||
    account.bank
  ) {
    throw new Error('Set balance requires an open manual off-budget account');
  }
  const balance = getAccountBalances(state.transactions, date)[accountId] || 0;
  if (
    options.expectedBalance !== undefined &&
    options.expectedBalance !== balance
  ) {
    throw new Error(
      'The ledger changed after the preview. Refresh and review the adjustment again.',
    );
  }
  const difference = targetBalance - balance;
  assertCfmAmount(difference);
  const transactionId = difference ? `cfm-adjustment-${requestId}` : null;
  const result = {
    transactionId,
    adjustment: difference,
    balance: targetBalance,
  };
  await batchMessages(async () => {
    if (transactionId) {
      await db.insertTransaction({
        id: transactionId,
        account: accountId,
        date,
        amount: difference,
        cleared: true,
        reconciled: false,
        notes: `CFM balance adjustment${reason ? ': ' + reason : ''}`,
      });
    }
    await appendAudit('balance-observation', {
      accountId,
      date,
      observedBalance: targetBalance,
      previousBalance: balance,
      amount: difference,
      transactionId,
      reason: reason || 'Manual balance correction',
      nonCash: true,
    });
    await completeOperation(requestId, request, result);
  });
  return result;
}
export async function postAdjustment(options: SetBalanceOptions) {
  return adjustment(options);
}

export async function valueAssetAccount({
  assetId,
  date,
  value,
  reason,
  requestId,
  modeled = false,
}: {
  assetId: string;
  date: string;
  value: number;
  reason?: string;
  requestId: string;
  modeled?: boolean;
}) {
  const asset = await readRecord(assetId);
  if (!asset || asset.kind !== 'asset') throw new Error('Asset not found');
  const state = await getState();
  const typed = getCfmRecords([asset], 'asset')[0];
  if (!typed) throw new Error('Asset not found');
  if (date < typed.data.acquisitionDate) {
    throw new Error('A valuation cannot predate acquisition');
  }
  const valuation = valueAsset(typed.data, date);
  if (
    valuation.method === 'source-average' &&
    valuation.source !== 'disposed'
  ) {
    throw new Error(
      'Update the asset valuation sources instead of entering a separate observed value',
    );
  }
  if (
    valuation.method === 'source-average' &&
    valuation.source === 'disposed' &&
    !modeled &&
    value !== 0
  ) {
    throw new Error('Record a zero value for a disposed source-valued asset');
  }
  if (modeled) value = valueAsset(typed.data, date).value;
  const existing = typed.data.observations?.find(item => item.id === requestId);
  if (existing) return { transactionId: existing.transactionId || null, asset };
  let result: Awaited<ReturnType<typeof adjustment>> | undefined;
  let next: CfmRecord<CfmAsset> | undefined;
  await batchMessages(async () => {
    result = await adjustment({
      accountId: typed.data.accountId,
      targetBalance: value,
      date,
      reason: reason || 'Asset valuation',
      requestId,
    });
    next = {
      ...typed,
      updatedAt: new Date().toISOString(),
      data: {
        ...typed.data,
        observations: [
          ...(typed.data.observations || []),
          {
            id: requestId,
            date,
            value,
            source: reason || 'Manual valuation',
            modeled,
            recordedAt: new Date().toISOString(),
            ...(result.transactionId
              ? { transactionId: result.transactionId }
              : {}),
          },
        ],
      },
    };
    validateCfmRecord(next, state);
    await writeRecord(next);
  });
  if (!result || !next) throw new Error('Valuation was not posted');
  return { transactionId: result.transactionId, asset: next };
}

export type UpdateAssetSourceOptions = CfmAssetSourceUpdate;

/** A manual source update and its calculated non-cash posting are one undo action. */
export async function updateAssetSource(
  options: UpdateAssetSourceOptions,
): Promise<CfmAssetSourceUpdateResult> {
  const { assetId, sourceId, date, value, requestId, expectedUpdatedAt } =
    options;
  requireRequestId(requestId);
  requireRequestId(sourceId);
  assertCfmDate(date);
  if (!options.name.trim()) throw new Error('A valuation source needs a name');
  if (value !== undefined) {
    assertCfmAmount(value, 'Source estimate');
    if (value < 0) throw new Error('A source estimate cannot be negative');
  }
  if (options.retire && value !== undefined) {
    throw new Error('Retire a source separately from recording an estimate');
  }
  const url = normalizeCfmValuationUrl(options.url ?? '');
  const request = {
    operation: 'asset-source',
    assetId,
    sourceId,
    date,
    name: options.name.trim(),
    url: url ?? null,
    value: value ?? null,
    retire: options.retire ?? false,
    expectedUpdatedAt,
  };
  const previous = await priorOperation(requestId, request);
  if (previous) {
    const latest = await readRecord(assetId);
    const current = getCfmRecords(latest ? [latest] : [], 'asset')[0];
    if (!current) throw new Error('Asset not found');
    return {
      asset: current,
      sourceId,
      value: previous.value === null ? null : Number(previous.value),
      sourceCount: Number(previous.sourceCount),
      transactionId:
        typeof previous.transactionId === 'string'
          ? previous.transactionId
          : null,
    };
  }
  const raw = await readRecord(assetId);
  const asset = getCfmRecords(raw ? [raw] : [], 'asset')[0];
  if (!asset) throw new Error('Asset not found');
  if (asset.updatedAt !== expectedUpdatedAt) {
    throw new Error(
      'This asset changed. Reload the source details before saving.',
    );
  }
  if (
    date < asset.data.acquisitionDate ||
    (asset.data.disposalDate && date >= asset.data.disposalDate)
  ) {
    throw new Error('Source date is outside the asset holding period');
  }
  if (valueAsset(asset.data, date).method !== 'source-average') {
    throw new Error(
      'Select the average-of-sources valuation policy for this date first',
    );
  }
  const sources = asset.data.valuationSources ?? [];
  const oldSource = sources.find(source => source.id === sourceId);
  if (oldSource?.retiredDate) {
    throw new Error(
      'A retired source retains its history; add a new source to use it again',
    );
  }
  if (options.retire && !oldSource) {
    throw new Error('Valuation source not found');
  }
  if (oldSource && date < oldSource.startDate) {
    throw new Error('A source update cannot predate its creation');
  }
  // Backdated averages would require changing later posted adjustments. Keep
  // that history intact and require a new dated reading instead.
  const latest = [
    asset.data.policy.effectiveDate,
    ...(asset.data.observations ?? []).map(item => item.date),
    ...sources.flatMap(source => [
      source.startDate,
      source.retiredDate ?? '',
      ...source.readings.map(item => item.date),
    ]),
  ]
    .sort()
    .at(-1)!;
  if ((value !== undefined || options.retire) && date < latest) {
    throw new Error(
      'Use a date on or after the latest asset valuation; later balance history is preserved',
    );
  }
  const recordedAt = new Date(
    Math.max(Date.now(), Date.parse(asset.updatedAt) + 1),
  ).toISOString();
  const source: CfmAssetValuationSource = {
    id: sourceId,
    name: options.name.trim(),
    ...(url ? { url } : {}),
    startDate: oldSource?.startDate ?? date,
    ...(options.retire ? { retiredDate: date } : {}),
    readings: [
      ...(oldSource?.readings ?? []),
      ...(value === undefined
        ? []
        : [
            {
              id: requestId,
              date,
              value,
              recordedAt,
              name: options.name.trim(),
              ...(url ? { url } : {}),
            },
          ]),
    ],
  };
  const data: CfmAsset = {
    ...asset.data,
    valuationSources: [...sources.filter(item => item.id !== sourceId), source],
  };
  const average = getAssetSourceAverage(data, date);
  const shouldPost =
    average.value !== null && (value !== undefined || options.retire);
  const state = await getState();
  const result = {
    sourceId,
    value: average.value,
    sourceCount: average.inputs.length,
    transactionId: null as string | null,
  };
  const next: CfmRecord<CfmAsset> = { ...asset, updatedAt: recordedAt, data };
  validateCfmRecord(next, state);
  await batchMessages(async () => {
    if (shouldPost && average.value !== null) {
      const posted = await adjustment({
        accountId: data.accountId,
        targetBalance: average.value,
        date,
        reason:
          'Average of valuation sources: ' +
          average.inputs.map(input => input.name).join(', '),
        requestId: 'source-' + uuidv5(requestId, uuidv5.URL),
      });
      result.transactionId = posted.transactionId;
      next.data.observations = [
        ...(data.observations ?? []),
        {
          id: requestId,
          date,
          value: average.value,
          recordedAt,
          source: 'Average of valuation sources',
          sourceInputs: average.inputs,
          ...(posted.transactionId
            ? { transactionId: posted.transactionId }
            : {}),
        },
      ];
    }
    await writeRecord(next);
    await appendAudit('asset-source-updated', {
      assetId,
      before: asset,
      after: next,
      average,
      nonCash: true,
    });
    await completeOperation(requestId, request, result);
  });
  return { ...result, asset: next };
}

async function transferPayee(accountId: string): Promise<string> {
  const payee = await db.first<{ id: string }>(
    'SELECT id FROM payees WHERE transfer_acct = ? AND tombstone = 0',
    [accountId],
  );
  if (!payee) {
    throw new Error('The control account does not have a transfer payee');
  }
  return payee.id;
}

/** Allocate part of an imported transaction without duplicating its cash/card movement. */
async function allocateTransfer(
  source: TransactionEntity,
  accountId: string,
  amount: number,
  id: string,
  state: CfmState,
) {
  if (source.transfer_id) {
    throw new Error(
      'This transaction is already allocated to a transfer; choose an unallocated purchase, payment, or split.',
    );
  }
  const payee = await transferPayee(accountId);
  const existingChildren = state.transactions.filter(
    item => item.parent_id === source.id && item.is_child,
  );
  const remainder = source.is_parent
    ? existingChildren.find(
        item => !item.transfer_id && !item.notes?.startsWith('CFM obligation'),
      )
    : source;
  if (
    !remainder ||
    Math.sign(remainder.amount) !== Math.sign(amount) ||
    Math.abs(remainder.amount) < Math.abs(amount)
  ) {
    throw new Error(
      'The source transaction has insufficient unallocated value',
    );
  }
  const otherId = `cfm-counterpart-${id}`;
  const child: TransactionEntity = {
    id: `cfm-allocation-${id}`,
    parent_id: source.id,
    is_child: true,
    account: source.account,
    amount,
    payee,
    date: source.date,
    transfer_id: otherId,
    cleared: source.cleared,
    notes: `CFM obligation ${id}`,
  };
  const counterpart: TransactionEntity = {
    id: otherId,
    account: accountId,
    amount: -amount,
    payee: await transferPayee(source.account),
    date: source.date,
    transfer_id: child.id,
    cleared: source.cleared,
    notes: `CFM obligation ${id}`,
  };
  const added: TransactionEntity[] = [child, counterpart];
  const updated: Partial<TransactionEntity>[] = [];
  if (source.is_child) {
    if (source.transfer_id) {
      throw new Error('This split is already allocated to a transfer');
    }
    child.parent_id = source.parent_id;
    updated.push({ id: source.id, amount: source.amount - amount });
  } else if (!source.is_parent) {
    updated.push({ id: source.id, is_parent: true, category: undefined });
    added.push({
      ...source,
      id: `cfm-remainder-${source.id}`,
      parent_id: source.id,
      is_parent: false,
      is_child: true,
      amount: source.amount - amount,
      transfer_id: undefined,
    });
  } else {
    updated.push({ id: remainder.id, amount: remainder.amount - amount });
  }
  await batchUpdateTransactions({
    added,
    updated,
    runTransfers: false,
    learnCategories: false,
  });
  return [child.id, counterpart.id];
}

export async function applyAnnualPlan({
  id,
  requestId,
}: {
  id: string;
  requestId: string;
}) {
  const record = await readRecord(id);
  const plan = getCfmRecords(record ? [record] : [], 'annual-plan')[0];
  if (!plan) throw new Error('Annual plan not found');
  const request = {
    operation: 'apply-annual-plan',
    id,
    revision: plan.data.revision,
  };
  if (await priorOperation(requestId, request)) return;
  const allocations = allocateAnnualPlan(plan.data);
  await batchMessages(async () => {
    for (let index = 0; index < 12; index++) {
      await setBudget({
        category: plan.data.categoryId,
        month: `${plan.data.year}-${String(index + 1).padStart(2, '0')}`,
        amount: allocations[index],
      });
    }
    await appendAudit('annual-plan-applied-to-envelopes', {
      planId: id,
      revision: plan.data.revision,
      allocations,
    });
    await completeOperation(requestId, request, { applied: true });
  });
}

async function bookObligation(record: CfmRecord, state: CfmState) {
  const item = getCfmRecords([record], 'obligation')[0];
  if (!item) throw new Error('Invalid obligation');
  const { accountId, amount, date, direction, sourceTransactionId } = item.data;
  const account = state.accounts.find(account => account.id === accountId);
  if (!account?.offbudget || account.account_sync_source || account.closed) {
    throw new Error(
      'Obligations require an open manual off-budget control account',
    );
  }
  const signed = direction === 'receivable' ? amount : -amount;
  if (item.data.existingBalance) {
    if (sourceTransactionId) {
      throw new Error(
        'Choose an existing balance or a source transaction, not both',
      );
    }
    const balance =
      (getAccountBalances(state.transactions, date)[accountId] || 0) *
      (direction === 'receivable' ? 1 : -1);
    const allocated = getCfmRecords(state.records, 'obligation')
      .filter(row => row.data.accountId === accountId)
      .reduce(
        (total, row) =>
          total +
          getObligationStatus(
            row.data,
            getCfmRecords(state.records, 'settlement'),
            date,
            row.id,
          ).outstanding,
        0,
      );
    if (amount > balance - allocated) {
      throw new Error('Existing control balance cannot cover this allocation');
    }
    await appendAudit('existing-control-balance-allocated', {
      obligationId: record.id,
      accountId,
      date,
      amount,
      availableBefore: balance - allocated,
    });
    return;
  }
  if (sourceTransactionId) {
    const source = state.transactions.find(
      item => item.id === sourceTransactionId,
    );
    if (!source || source.account === accountId || source.date !== date) {
      throw new Error('Source transaction not found or is the control account');
    }
    await allocateTransfer(
      source,
      accountId,
      -signed,
      `recognition-${record.id}`,
      state,
    );
  } else {
    const control: TransactionEntity = {
      id: `cfm-recognition-${record.id}`,
      account: accountId,
      amount: signed,
      date,
      cleared: true,
      notes: `CFM ${direction}: ${item.data.counterparty}`,
    };
    const counterAccount = state.accounts.find(
      row =>
        row.id === item.data.counterAccountId &&
        !row.closed &&
        row.id !== accountId,
    );
    if (direction === 'payable' && !counterAccount) {
      throw new Error(
        'Select the expense or asset account for an unpaid payable, or allocate an existing control balance',
      );
    }
    const added = [control];
    if (counterAccount) {
      const counterId = `cfm-counterpart-recognition-${record.id}`;
      control.transfer_id = counterId;
      control.payee = await transferPayee(counterAccount.id);
      const counter: TransactionEntity = {
        id: counterId,
        account: counterAccount.id,
        date,
        amount: -signed,
        cleared: true,
        transfer_id: control.id,
        payee: await transferPayee(accountId),
        notes: control.notes,
      };
      if (counterAccount.offbudget) {
        added.push(counter);
      } else {
        if (!item.data.categoryId) {
          throw new Error('Choose the category for the non-cash recognition');
        }
        const parentId = `cfm-noncash-recognition-${record.id}`;
        added.push(
          { ...counter, parent_id: parentId, is_child: true },
          {
            id: parentId,
            account: counterAccount.id,
            date,
            amount: 0,
            is_parent: true,
            cleared: true,
            notes: control.notes,
          },
          {
            id: `cfm-noncash-category-recognition-${record.id}`,
            account: counterAccount.id,
            date,
            amount: signed,
            is_child: true,
            parent_id: parentId,
            category: item.data.categoryId,
            cleared: true,
            notes: control.notes,
          },
        );
      }
    }
    await batchUpdateTransactions({
      added,
      runTransfers: false,
      learnCategories: false,
    });
  }
}

export type SettleOptions = {
  obligationId: string;
  amount: number;
  date: string;
  accountId: string;
  transactionId?: string;
  kind: 'payment' | 'writeoff' | 'reversal';
  reversesId?: string;
  notes?: string;
  requestId: string;
  categoryId?: string;
};
export async function settleObligation(options: SettleOptions) {
  const {
    obligationId,
    amount,
    date,
    accountId,
    transactionId,
    kind,
    reversesId,
    notes,
    requestId,
  } = options;
  assertCfmAmount(amount);
  assertCfmDate(date);
  requireRequestId(requestId);
  if (amount <= 0) throw new Error('Settlement amount must be positive');
  const request = {
    operation: 'settle',
    obligationId,
    amount,
    date,
    accountId,
    transactionId: transactionId || '',
    kind,
    reversesId: reversesId || '',
    notes: notes || '',
    categoryId: options.categoryId || '',
  };
  const previous = await priorOperation(requestId, request);
  if (previous) {
    const record = await readRecord(`settlement:${requestId}`);
    if (!record) throw new Error('Settlement receipt is incomplete');
    return {
      settlement: record,
      transactionIds: Array.isArray(previous.transactionIds)
        ? previous.transactionIds.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
    };
  }
  const state = await getState();
  const obligation = getCfmRecords(state.records, 'obligation').find(
    item => item.id === obligationId,
  );
  if (!obligation) throw new Error('Obligation not found');
  const settlements = getCfmRecords(state.records, 'settlement');
  const outstanding = getObligationStatus(
    obligation.data,
    settlements,
    date,
    obligationId,
  ).outstanding;
  if (kind !== 'reversal' && amount > outstanding) {
    throw new Error(
      'Payment exceeds the outstanding amount; record any credit separately',
    );
  }
  if (kind === 'reversal') {
    const prior = settlements.find(
      item => item.id === reversesId && item.data.obligationId === obligationId,
    );
    if (
      !prior ||
      prior.data.kind === 'reversal' ||
      prior.data.amount !== amount ||
      settlements.some(item => item.data.reversesId === reversesId)
    ) {
      throw new Error('Select an unreversed settlement with the same amount');
    }
  }
  const signed = obligation.data.direction === 'receivable' ? -amount : amount;
  const settlement: CfmRecord<CfmSettlement> = {
    id: `settlement:${requestId}`,
    kind: 'settlement',
    updatedAt: new Date().toISOString(),
    data: {
      obligationId,
      amount,
      date,
      kind,
      ...(accountId ? { accountId } : {}),
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
      ...(transactionId ? { transactionId } : {}),
      ...(reversesId ? { reversesId } : {}),
      ...(notes ? { notes } : {}),
    },
  };
  validateCfmRecord(settlement, state);
  let transactionIds: string[] = [];
  await batchMessages(async () => {
    if (kind === 'payment' && transactionId) {
      const source = state.transactions.find(
        item => item.id === transactionId && item.account === accountId,
      );
      if (!source || source.date !== date) {
        throw new Error('Payment transaction date/account mismatch');
      }
      transactionIds = await allocateTransfer(
        source,
        obligation.data.accountId,
        -signed,
        requestId,
        state,
      );
    } else {
      const controlId = `cfm-control-${requestId}`;
      const controlAmount = kind === 'reversal' ? -signed : signed;
      const control: TransactionEntity = {
        id: controlId,
        account: obligation.data.accountId,
        date,
        amount: controlAmount,
        cleared: true,
        notes: `CFM ${kind}: ${obligation.data.counterparty}${notes ? ': ' + notes : ''}`,
      };
      const added = [control];
      if (kind === 'payment') {
        if (
          !state.accounts.some(
            item =>
              item.id === accountId &&
              item.id !== obligation.data.accountId &&
              !item.closed,
          )
        ) {
          throw new Error('Choose an open payment account');
        }
        const cashId = `cfm-payment-${requestId}`;
        control.transfer_id = cashId;
        control.payee = await transferPayee(accountId);
        added.push({
          id: cashId,
          account: accountId,
          date,
          amount: -signed,
          cleared: true,
          transfer_id: controlId,
          payee: await transferPayee(obligation.data.accountId),
          notes: control.notes,
        });
      } else if (
        kind === 'reversal' ||
        (kind === 'writeoff' && obligation.data.direction === 'receivable')
      ) {
        const prior = settlements.find(item => item.id === reversesId);
        const adjustmentAccountId =
          kind === 'reversal' ? prior?.data.accountId || accountId : accountId;
        const category =
          options.categoryId ||
          prior?.data.categoryId ||
          obligation.data.categoryId;
        if (kind === 'writeoff' && !category) {
          throw new Error(
            'Select a loss category for the receivable write-off',
          );
        }
        if (
          category &&
          !state.categories.some(
            item => item.id === category && !item.tombstone,
          )
        ) {
          throw new Error('Unknown adjustment category');
        }
        if (
          kind === 'writeoff' ||
          prior?.data.kind === 'payment' ||
          (prior?.data.kind === 'writeoff' &&
            obligation.data.direction === 'receivable')
        ) {
          const adjustmentAccount = state.accounts.find(
            item =>
              item.id === adjustmentAccountId &&
              !item.closed &&
              !item.offbudget &&
              item.id !== obligation.data.accountId,
          );
          if (!adjustmentAccount) {
            throw new Error(
              'Choose an open on-budget account for the non-cash expense allocation',
            );
          }
          const parentId = `cfm-noncash-${requestId}`;
          const transferId = `cfm-noncash-transfer-${requestId}`;
          control.transfer_id = transferId;
          control.payee = await transferPayee(adjustmentAccountId);
          added.push(
            {
              id: parentId,
              account: adjustmentAccountId,
              date,
              amount: 0,
              is_parent: true,
              cleared: true,
              notes: control.notes,
            },
            {
              id: transferId,
              account: adjustmentAccountId,
              date,
              amount: -controlAmount,
              is_child: true,
              parent_id: parentId,
              transfer_id: controlId,
              payee: await transferPayee(obligation.data.accountId),
              cleared: true,
              notes: control.notes,
            },
            {
              id: `cfm-noncash-category-${requestId}`,
              account: adjustmentAccountId,
              date,
              amount: controlAmount,
              is_child: true,
              parent_id: parentId,
              category,
              cleared: true,
              notes: control.notes,
            },
          );
        }
      }
      await batchUpdateTransactions({
        added,
        runTransfers: false,
        learnCategories: false,
      });
      transactionIds = added.map(item => item.id);
    }
    settlement.data.transactionId = transactionIds[0];
    await writeRecord(settlement);
    await appendAudit('obligation-settled', {
      settlement,
      transactionIds,
      nonCash: kind !== 'payment',
    });
    await completeOperation(requestId, request, { transactionIds });
  });
  return { settlement, transactionIds };
}

export type CfmHandlers = {
  'cfm-apply-annual-plan': typeof applyAnnualPlan;
  'cfm-get-state': typeof getState;
  'cfm-save-record': typeof saveRecord;
  'cfm-delete-record': typeof deleteRecord;
  'cfm-create-account': typeof createAccount;
  'cfm-post-adjustment': typeof postAdjustment;
  'cfm-value-asset': typeof valueAssetAccount;
  'cfm-update-asset-source': typeof updateAssetSource;
  'cfm-settle-obligation': typeof settleObligation;
  'cfm-project-liquidity': typeof projectCfmLiquidity;
  'cfm-run-report': typeof runReport;
  'cfm-run-automation': typeof runAutomation;
  'cfm-export-upstream': typeof exportForActualBudget;
};
export const app = createApp<CfmHandlers>();
app.method('cfm-apply-annual-plan', mutator(undoable(applyAnnualPlan)));
app.method('cfm-get-state', getState);
app.method('cfm-project-liquidity', projectCfmLiquidity);
app.method('cfm-export-upstream', exportForActualBudget);
app.method('cfm-save-record', mutator(undoable(saveRecord)));
app.method('cfm-delete-record', mutator(undoable(deleteRecord)));
app.method('cfm-create-account', mutator(undoable(createAccount)));
app.method('cfm-post-adjustment', mutator(undoable(postAdjustment)));
app.method('cfm-value-asset', mutator(undoable(valueAssetAccount)));
app.method('cfm-update-asset-source', mutator(undoable(updateAssetSource)));
app.method('cfm-settle-obligation', mutator(undoable(settleObligation)));
app.method('cfm-run-report', mutator(runReport));
app.method('cfm-run-automation', runAutomation);
app.service(() => {
  const timer = setInterval(() => {
    if (prefs.getPrefs()?.id) {
      void runAutomation({}).catch(() => {
        /* Persisted job state exposes failures in settings. */
      });
    }
  }, 60000);
  return () => clearInterval(timer);
});
app.events.on('load-budget', scheduleRecoveryExport);
app.events.on('sync', event => {
  if (
    event.type === 'applied' &&
    event.tables?.some(table => !['kvcache', 'kvcache_key'].includes(table))
  ) {
    scheduleRecoveryExport();
  }
});
app.service(() => cancelRecoveryExport);
