import type {
  CfmAccount,
  CfmAccountClassification,
  CfmAccountKind,
  CfmAnnualPlan,
  CfmAnnualPlanPerformance,
  CfmAsset,
  CfmAssetPolicy,
  CfmBalanceSheet,
  CfmBalanceSheetRow,
  CfmForecastEvent,
  CfmLedgerTransaction,
  CfmLiquidityInput,
  CfmLiquidityPoint,
  CfmLiquidityProjection,
  CfmObligation,
  CfmObligationStatus,
  CfmRecord,
  CfmRecordDataMap,
  CfmRecordKind,
  CfmSettlement,
  CfmState,
  CfmValuation,
} from '#types/models/cfm';

const DAY = 86_400_000;
const accountKinds: CfmAccountKind[] = [
  'cash',
  'investment',
  'asset',
  'credit-card',
  'loan',
  'receivable',
  'payable',
];
const recordKinds: CfmRecordKind[] = [
  'classification',
  'annual-plan',
  'asset',
  'obligation',
  'settlement',
  'report-template',
  'report-run',
  'automation',
  'audit',
];

export function assertCfmDate(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('A date must use YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
}

export function assertCfmAmount(value: number, name = 'Amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer in minor currency units.`);
  }
}

/** Native accounts store epoch milliseconds as text; accept ISO timestamps in imports too. */
export function cfmBankSyncTimestamp(value?: string | null): number {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function assertCfmCurrency(value: string): void {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new Error('Currency must be a three-letter uppercase code.');
  }
}

function nonnegative(value: number, name = 'Amount'): void {
  assertCfmAmount(value, name);
  if (value < 0) throw new Error(`${name} cannot be negative.`);
}

function positive(value: number, name = 'Amount'): void {
  assertCfmAmount(value, name);
  if (value <= 0) throw new Error(`${name} must be positive.`);
}

function sum(values: number[]): number {
  const result = values.reduce((total, value) => total + value, 0);
  assertCfmAmount(result, 'Total');
  return result;
}

function roundAmount(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Financial calculation is not finite.');
  }
  const result = Math.round(value);
  assertCfmAmount(result);
  return result === 0 ? 0 : result;
}

function requiredText(value: string, name: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
}

function dayNumber(date: string): number {
  assertCfmDate(date);
  return new Date(`${date}T00:00:00.000Z`).getTime() / DAY;
}

function addDays(date: string, days: number): string {
  assertCfmAmount(days, 'Days');
  return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10);
}

function endOfMonth(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const originalDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const first = d.toISOString().slice(0, 10);
  const lastDay = Number(endOfMonth(first).slice(8));
  d.setUTCDate(Math.min(originalDay, lastDay));
  const result = d.toISOString().slice(0, 10);
  assertCfmDate(result);
  return result;
}

function liability(kind: CfmAccountKind): boolean {
  return kind === 'credit-card' || kind === 'loan' || kind === 'payable';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClassification(value: unknown): value is CfmAccountClassification {
  return (
    isObject(value) &&
    typeof value.accountId === 'string' &&
    typeof value.effectiveDate === 'string' &&
    typeof value.kind === 'string' &&
    accountKinds.some(kind => kind === value.kind) &&
    typeof value.currency === 'string' &&
    typeof value.isLiquid === 'boolean' &&
    (value.restricted === undefined || typeof value.restricted === 'boolean') &&
    (value.liabilityTerm === undefined ||
      value.liabilityTerm === 'current' ||
      value.liabilityTerm === 'long-term') &&
    (value.paymentAccountId === undefined ||
      typeof value.paymentAccountId === 'string') &&
    (value.paymentDay === undefined || typeof value.paymentDay === 'number') &&
    (value.statementDay === undefined || typeof value.statementDay === 'number')
  );
}

function isDatedAmount(
  value: unknown,
): value is { date: string; amount: number } {
  return (
    isObject(value) &&
    typeof value.date === 'string' &&
    typeof value.amount === 'number'
  );
}

function isAnnualPlan(value: unknown): value is CfmAnnualPlan {
  return (
    isObject(value) &&
    typeof value.year === 'number' &&
    typeof value.categoryId === 'string' &&
    typeof value.amount === 'number' &&
    typeof value.currency === 'string' &&
    typeof value.revision === 'number' &&
    (value.direction === undefined ||
      value.direction === 'expense' ||
      value.direction === 'income') &&
    (value.allocationMethod === undefined ||
      value.allocationMethod === 'equal' ||
      value.allocationMethod === 'monthly' ||
      value.allocationMethod === 'weighted') &&
    (value.monthlyAmounts === undefined ||
      (Array.isArray(value.monthlyAmounts) &&
        value.monthlyAmounts.every(n => typeof n === 'number'))) &&
    (value.monthlyWeights === undefined ||
      (Array.isArray(value.monthlyWeights) &&
        value.monthlyWeights.every(n => typeof n === 'number'))) &&
    (value.datedAmounts === undefined ||
      (Array.isArray(value.datedAmounts) &&
        value.datedAmounts.every(isDatedAmount))) &&
    (value.notes === undefined || typeof value.notes === 'string')
  );
}

function isAssetPolicy(value: unknown): value is CfmAssetPolicy {
  return (
    isObject(value) &&
    typeof value.effectiveDate === 'string' &&
    ['manual', 'straight-line', 'fixed-rate', 'schedule'].some(
      method => method === value.method,
    ) &&
    [
      'baseValue',
      'residualValue',
      'usefulLifeMonths',
      'annualRateBasisPoints',
    ].every(
      key => value[key] === undefined || typeof value[key] === 'number',
    ) &&
    (value.compound === undefined || typeof value.compound === 'boolean') &&
    (value.postingFrequency === undefined ||
      ['daily', 'monthly', 'quarterly', 'annually'].some(
        f => f === value.postingFrequency,
      )) &&
    (value.schedule === undefined ||
      (Array.isArray(value.schedule) && value.schedule.every(isDatedAmount)))
  );
}

function isAsset(value: unknown): value is CfmAsset {
  return (
    isObject(value) &&
    typeof value.accountId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.acquisitionDate === 'string' &&
    typeof value.acquisitionValue === 'number' &&
    isAssetPolicy(value.policy) &&
    (value.policyHistory === undefined ||
      (Array.isArray(value.policyHistory) &&
        value.policyHistory.every(isAssetPolicy))) &&
    (value.disposalDate === undefined ||
      typeof value.disposalDate === 'string') &&
    (value.linkedDebtAccountId === undefined ||
      typeof value.linkedDebtAccountId === 'string') &&
    (value.observations === undefined ||
      (Array.isArray(value.observations) &&
        value.observations.every(
          item =>
            isObject(item) &&
            typeof item.id === 'string' &&
            typeof item.date === 'string' &&
            typeof item.value === 'number' &&
            typeof item.recordedAt === 'string' &&
            typeof item.source === 'string' &&
            (item.transactionId === undefined ||
              typeof item.transactionId === 'string') &&
            (item.notes === undefined || typeof item.notes === 'string'),
        )))
  );
}

function isObligation(value: unknown): value is CfmObligation {
  return (
    isObject(value) &&
    typeof value.accountId === 'string' &&
    (value.direction === 'receivable' || value.direction === 'payable') &&
    typeof value.counterparty === 'string' &&
    typeof value.amount === 'number' &&
    typeof value.currency === 'string' &&
    typeof value.date === 'string' &&
    [
      'dueDate',
      'expectedDate',
      'sourceTransactionId',
      'categoryId',
      'notes',
    ].every(
      key => value[key] === undefined || typeof value[key] === 'string',
    ) &&
    (value.disputed === undefined || typeof value.disputed === 'boolean')
  );
}

function isSettlement(value: unknown): value is CfmSettlement {
  return (
    isObject(value) &&
    typeof value.obligationId === 'string' &&
    typeof value.date === 'string' &&
    typeof value.amount === 'number' &&
    ['payment', 'writeoff', 'reversal'].some(kind => kind === value.kind) &&
    ['transactionId', 'accountId', 'reversesId', 'notes'].every(
      key => value[key] === undefined || typeof value[key] === 'string',
    )
  );
}

export function validateCfmClassification(
  value: CfmAccountClassification,
): void {
  requiredText(value.accountId, 'Account');
  assertCfmDate(value.effectiveDate);
  assertCfmCurrency(value.currency);
  if (!accountKinds.includes(value.kind)) {
    throw new Error('Unknown account classification.');
  }
  if (typeof value.isLiquid !== 'boolean') {
    throw new Error('Liquidity eligibility must be explicit.');
  }
  if (value.isLiquid && value.kind !== 'cash' && value.kind !== 'investment') {
    throw new Error(
      'Only cash or explicitly selected investment accounts can be available liquidity.',
    );
  }
  for (const day of [value.paymentDay, value.statementDay]) {
    if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) {
      throw new Error('Payment and statement days must be between 1 and 31.');
    }
  }
  if (value.paymentAccountId === value.accountId) {
    throw new Error('An account cannot pay itself.');
  }
}

export function validateCfmAnnualPlan(value: CfmAnnualPlan): void {
  if (!Number.isInteger(value.year) || value.year < 1000 || value.year > 9998) {
    throw new Error('Invalid plan year.');
  }
  requiredText(value.categoryId, 'Category');
  assertCfmCurrency(value.currency);
  nonnegative(value.amount, 'Annual amount');
  positive(value.revision, 'Plan revision');
  let dated = 0;
  for (const item of value.datedAmounts ?? []) {
    assertCfmDate(item.date);
    if (Number(item.date.slice(0, 4)) !== value.year) {
      throw new Error('Dated expenses must be inside the plan year.');
    }
    nonnegative(item.amount, 'Dated amount');
    dated = sum([dated, item.amount]);
  }
  if (dated > value.amount) {
    throw new Error('Dated expenses exceed the annual plan.');
  }
  if (value.monthlyAmounts !== undefined) {
    if (value.monthlyAmounts.length !== 12) {
      throw new Error('A plan requires exactly twelve monthly amounts.');
    }
    value.monthlyAmounts.forEach(amount =>
      nonnegative(amount, 'Monthly amount'),
    );
    if (sum(value.monthlyAmounts) + dated !== value.amount) {
      throw new Error(
        'Monthly and dated amounts must sum to the annual amount.',
      );
    }
  }
  if (value.monthlyWeights !== undefined) {
    if (value.monthlyWeights.length !== 12) {
      throw new Error('A plan requires exactly twelve monthly weights.');
    }
    value.monthlyWeights.forEach(weight =>
      nonnegative(weight, 'Monthly weight'),
    );
    if (!sum(value.monthlyWeights)) {
      throw new Error('At least one monthly weight must be positive.');
    }
  }
  if (
    value.allocationMethod === 'monthly' &&
    value.monthlyAmounts === undefined
  ) {
    throw new Error('Monthly allocations are required.');
  }
  if (
    value.allocationMethod === 'weighted' &&
    value.monthlyWeights === undefined
  ) {
    throw new Error('Monthly weights are required.');
  }
}

export function validateCfmAsset(value: CfmAsset): void {
  requiredText(value.accountId, 'Asset account');
  requiredText(value.name, 'Asset name');
  assertCfmCurrency(value.currency);
  assertCfmDate(value.acquisitionDate);
  nonnegative(value.acquisitionValue, 'Acquisition value');
  if (value.disposalDate !== undefined) {
    assertCfmDate(value.disposalDate);
    if (value.disposalDate < value.acquisitionDate) {
      throw new Error('Disposal cannot precede acquisition.');
    }
  }
  const dates = new Map<string, string>();
  for (const policy of [...(value.policyHistory ?? []), value.policy]) {
    assertCfmDate(policy.effectiveDate);
    if (policy.effectiveDate < value.acquisitionDate) {
      throw new Error('A valuation policy cannot precede acquisition.');
    }
    const encoded = JSON.stringify(policy);
    const prior = dates.get(policy.effectiveDate);
    if (prior && prior !== encoded) {
      throw new Error(
        'Conflicting valuation policies have the same effective date.',
      );
    }
    dates.set(policy.effectiveDate, encoded);
    if (policy.baseValue !== undefined) {
      nonnegative(policy.baseValue, 'Valuation base');
    }
    if (policy.residualValue !== undefined) {
      nonnegative(policy.residualValue, 'Residual value');
    }
    if (
      (policy.residualValue ?? 0) > (policy.baseValue ?? value.acquisitionValue)
    ) {
      throw new Error('Residual value exceeds the asset value.');
    }
    if (
      policy.method === 'straight-line' &&
      (!Number.isInteger(policy.usefulLifeMonths) ||
        (policy.usefulLifeMonths ?? 0) <= 0 ||
        (policy.usefulLifeMonths ?? 0) > 12000)
    ) {
      throw new Error(
        'Straight-line depreciation requires a positive useful life in months.',
      );
    }
    if (policy.method === 'fixed-rate') {
      if (
        policy.annualRateBasisPoints === undefined ||
        !Number.isSafeInteger(policy.annualRateBasisPoints) ||
        policy.annualRateBasisPoints < -10000 ||
        policy.annualRateBasisPoints > 1000000
      ) {
        throw new Error(
          'Annual rate must be integer basis points between -10000 and 1000000.',
        );
      }
    }
    const seen = new Set<string>();
    for (const item of policy.schedule ?? []) {
      assertCfmDate(item.date);
      nonnegative(item.amount, 'Scheduled value');
      if (item.date < policy.effectiveDate) {
        throw new Error('Scheduled values cannot precede their policy.');
      }
      if (seen.has(item.date)) {
        throw new Error('An asset schedule has duplicate dates.');
      }
      seen.add(item.date);
    }
  }
  const ids = new Set<string>();
  for (const observation of value.observations ?? []) {
    requiredText(observation.id, 'Observation ID');
    requiredText(observation.source, 'Observation source');
    if (ids.has(observation.id)) {
      throw new Error('Duplicate valuation observation ID.');
    }
    ids.add(observation.id);
    assertCfmDate(observation.date);
    if (
      observation.date < value.acquisitionDate ||
      (value.disposalDate && observation.date > value.disposalDate)
    ) {
      throw new Error('Observation date is outside the asset holding period.');
    }
    nonnegative(observation.value, 'Observed value');
    if (!Number.isFinite(Date.parse(observation.recordedAt))) {
      throw new Error('Observation requires a recorded timestamp.');
    }
  }
}

export function validateCfmObligation(value: CfmObligation): void {
  requiredText(value.accountId, 'Control account');
  requiredText(value.counterparty, 'Counterparty');
  positive(value.amount, 'Obligation amount');
  assertCfmCurrency(value.currency);
  assertCfmDate(value.date);
  for (const date of [value.dueDate, value.expectedDate]) {
    if (date !== undefined) {
      assertCfmDate(date);
      if (date < value.date) {
        throw new Error('An obligation date cannot precede its creation date.');
      }
    }
  }
}

export function validateCfmSettlement(value: CfmSettlement): void {
  requiredText(value.obligationId, 'Obligation');
  assertCfmDate(value.date);
  positive(value.amount, 'Settlement amount');
  if (value.kind === 'reversal' && !value.reversesId) {
    throw new Error('A reversal must identify the settlement it reverses.');
  }
  if (value.kind !== 'reversal' && value.reversesId) {
    throw new Error('Only reversals may reference another settlement.');
  }
  if (
    (value.kind === 'writeoff' || value.kind === 'reversal') &&
    !value.notes?.trim()
  ) {
    throw new Error('Write-offs and reversals require a reason.');
  }
}

export function validateCfmRecord(
  record: unknown,
  state?: CfmState,
): asserts record is CfmRecord {
  if (
    !isObject(record) ||
    typeof record.id !== 'string' ||
    !/^[A-Za-z0-9:_-]+$/.test(record.id) ||
    record.id.length > 200 ||
    !recordKinds.some(kind => kind === record.kind) ||
    !isObject(record.data) ||
    typeof record.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error('Invalid CFM record envelope.');
  }
  const value = record.data;
  switch (record.kind) {
    case 'classification':
      if (!isClassification(value)) {
        throw new Error('Invalid account classification.');
      }
      validateCfmClassification(value);
      break;
    case 'annual-plan':
      if (!isAnnualPlan(value)) throw new Error('Invalid annual plan.');
      validateCfmAnnualPlan(value);
      break;
    case 'asset':
      if (!isAsset(value)) throw new Error('Invalid asset.');
      validateCfmAsset(value);
      break;
    case 'obligation':
      if (!isObligation(value)) throw new Error('Invalid obligation.');
      validateCfmObligation(value);
      break;
    case 'settlement':
      if (!isSettlement(value)) throw new Error('Invalid settlement.');
      validateCfmSettlement(value);
      break;
    default:
      // The report and automation services validate their own versioned documents.
      break;
  }
  if (!state) return;
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(value),
  );
  const currency = fields.currency;
  if (currency !== undefined && currency !== state.currency) {
    throw new Error('The record currency does not match this budget.');
  }
  for (const key of [
    'accountId',
    'paymentAccountId',
    'linkedDebtAccountId',
    'counterAccountId',
  ]) {
    const id = fields[key];
    if (
      id !== undefined &&
      !state.accounts.some(account => account.id === id && !account.tombstone)
    ) {
      throw new Error(`Unknown account in ${key}.`);
    }
  }
  const categoryId = fields.categoryId;
  if (
    categoryId !== undefined &&
    !state.categories.some(
      category => category.id === categoryId && !category.tombstone,
    )
  ) {
    throw new Error('Unknown category.');
  }
  if (record.kind === 'settlement' && isSettlement(value)) {
    const obligation = getCfmRecords(state.records, 'obligation').find(
      item => item.id === value.obligationId,
    );
    if (!obligation) throw new Error('Unknown obligation.');
    const other = getCfmRecords(state.records, 'settlement').filter(
      item => item.id !== record.id,
    );
    getObligationStatus(
      obligation.data,
      [
        ...other,
        {
          id: record.id,
          kind: 'settlement',
          data: value,
          updatedAt: record.updatedAt,
        },
      ],
      '9999-12-31',
      obligation.id,
    );
  }
}

export function getCfmRecords<K extends CfmRecordKind>(
  records: CfmRecord[],
  kind: K,
): CfmRecord<CfmRecordDataMap[K]>[] {
  return records.filter((record): record is CfmRecord<CfmRecordDataMap[K]> => {
    if (record.kind !== kind) return false;
    validateCfmRecord(record);
    return true;
  });
}

export function getAccountClassification(
  classifications: CfmAccountClassification[],
  accountId: string,
  asOf: string,
): CfmAccountClassification | undefined {
  assertCfmDate(asOf);
  const eligible = classifications.filter(
    item => item.accountId === accountId && item.effectiveDate <= asOf,
  );
  eligible.forEach(validateCfmClassification);
  eligible.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  for (let i = 1; i < eligible.length; i++) {
    const prior = eligible[i - 1];
    const item = eligible[i];
    if (
      prior &&
      item &&
      prior.effectiveDate === item.effectiveDate &&
      JSON.stringify(prior) !== JSON.stringify(item)
    ) {
      throw new Error(
        'Conflicting classifications have the same effective date.',
      );
    }
  }
  return eligible.at(-1);
}

function ledgerRows(
  transactions: CfmLedgerTransaction[],
): CfmLedgerTransaction[] {
  const rows = new Map<string, CfmLedgerTransaction>();
  for (const transaction of transactions) {
    if (transaction.tombstone) continue;
    assertCfmDate(transaction.date);
    assertCfmAmount(transaction.amount);
    rows.set(transaction.id, transaction);
    for (const child of transaction.subtransactions ?? []) {
      if (!child.tombstone) {
        rows.set(child.id, {
          ...child,
          is_child: true,
          parent_id: transaction.id,
        });
      }
    }
  }
  return [...rows.values()];
}

export function getAccountBalances(
  transactions: CfmLedgerTransaction[],
  asOf: string,
): Record<string, number> {
  assertCfmDate(asOf);
  const rows = ledgerRows(transactions);
  const ids = new Set(rows.map(row => row.id));
  const balances: Record<string, number> = {};
  for (const row of rows) {
    if (
      row.date > asOf ||
      (row.is_child && row.parent_id && ids.has(row.parent_id))
    ) {
      continue;
    }
    balances[row.account] = sum([balances[row.account] ?? 0, row.amount]);
  }
  return balances;
}

function annualAllocations(plan: CfmAnnualPlan): {
  regular: number[];
  dated: number[];
} {
  validateCfmAnnualPlan(plan);
  const dated = Array.from({ length: 12 }, () => 0);
  for (const item of plan.datedAmounts ?? []) {
    const month = Number(item.date.slice(5, 7)) - 1;
    dated[month] = sum([dated[month] ?? 0, item.amount]);
  }
  const remainder = plan.amount - sum(dated);
  if (plan.monthlyAmounts) return { regular: [...plan.monthlyAmounts], dated };
  const weights = plan.monthlyWeights ?? Array.from({ length: 12 }, () => 1);
  const total = BigInt(sum(weights));
  const amounts = weights.map(weight =>
    Number((BigInt(remainder) * BigInt(weight)) / total),
  );
  let unallocated = remainder - sum(amounts);
  const order = weights
    .map((weight, index) => ({
      index,
      remainder: (BigInt(remainder) * BigInt(weight)) % total,
    }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const item of order) {
    if (!unallocated) break;
    amounts[item.index] = (amounts[item.index] ?? 0) + 1;
    unallocated--;
  }
  return { regular: amounts, dated };
}

export function allocateAnnualPlan(plan: CfmAnnualPlan): number[] {
  const { regular, dated } = annualAllocations(plan);
  return regular.map((value, index) => sum([value, dated[index] ?? 0]));
}

export function getAnnualPlanPerformance(
  plan: CfmAnnualPlan,
  transactions: CfmLedgerTransaction[],
  asOf: string,
  mode: 'prorated' | 'full-month' = 'prorated',
): CfmAnnualPlanPerformance {
  assertCfmDate(asOf);
  const { regular, dated } = annualAllocations(plan);
  const start = `${plan.year}-01-01`;
  const end = `${plan.year}-12-31`;
  const cutoff = asOf < start ? asOf : asOf > end ? end : asOf;
  let expectedYtd = 0;
  if (asOf >= end) {
    expectedYtd = plan.amount;
  } else if (asOf >= start) {
    const month = Number(asOf.slice(5, 7)) - 1;
    expectedYtd = sum(regular.slice(0, month));
    const current = regular[month] ?? 0;
    expectedYtd = sum([
      expectedYtd,
      mode === 'full-month'
        ? current
        : roundAmount(
            (current * Number(asOf.slice(8))) /
              Number(endOfMonth(asOf).slice(8)),
          ),
    ]);
    expectedYtd = sum([
      expectedYtd,
      sum(
        (plan.datedAmounts ?? [])
          .filter(item => item.date <= asOf)
          .map(item => item.amount),
      ),
    ]);
  }
  const actualYtd = sum(
    ledgerRows(transactions)
      .filter(
        row =>
          !row.is_parent &&
          !row.transfer_id &&
          row.category === plan.categoryId &&
          row.date >= start &&
          row.date <= cutoff,
      )
      .map(row => (plan.direction === 'income' ? row.amount : -row.amount)),
  );
  return {
    year: plan.year,
    categoryId: plan.categoryId,
    revision: plan.revision,
    annualAmount: plan.amount,
    monthlyAmounts: regular.map((value, index) =>
      sum([value, dated[index] ?? 0]),
    ),
    expectedYtd,
    actualYtd,
    variance: actualYtd - expectedYtd,
    remaining: plan.amount - actualYtd,
    cutoff,
  };
}

function completedMonths(from: string, to: string): number {
  let months =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7));
  if (addMonths(from, months) > to) months--;
  return Math.max(0, months);
}

function modelAsset(
  value: number,
  from: string,
  to: string,
  policy: CfmAssetPolicy,
): number {
  if (to <= from || policy.method === 'manual') return value;
  if (policy.method === 'schedule') {
    const latest = [...(policy.schedule ?? [])]
      .filter(item => item.date > from && item.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    return latest?.amount ?? value;
  }
  const frequency = policy.postingFrequency ?? 'monthly';
  const step =
    frequency === 'annually' ? 12 : frequency === 'quarterly' ? 3 : 1;
  const date =
    frequency === 'daily'
      ? to
      : addMonths(
          policy.effectiveDate,
          Math.floor(completedMonths(policy.effectiveDate, to) / step) * step,
        );
  if (date <= from) return value;
  const residual = policy.residualValue ?? 0;
  if (policy.method === 'straight-line') {
    const end = addMonths(policy.effectiveDate, policy.usefulLifeMonths ?? 1);
    if (date >= end || from >= end) return residual;
    const total = policy.usefulLifeMonths ?? 1;
    const remaining = total - fractionalMonths(policy.effectiveDate, from);
    const after = total - fractionalMonths(policy.effectiveDate, date);
    return Math.max(
      residual,
      roundAmount(residual + ((value - residual) * after) / remaining),
    );
  }
  if (policy.method === 'fixed-rate') {
    const rate = (policy.annualRateBasisPoints ?? 0) / 10000;
    const years =
      frequency === 'daily'
        ? actualYears(from, date)
        : completedMonths(from, date) / 12;
    return Math.max(
      residual,
      roundAmount(
        value *
          (policy.compound === false ? 1 + rate * years : (1 + rate) ** years),
      ),
    );
  }
  return value;
}

function fractionalMonths(from: string, to: string): number {
  const months = completedMonths(from, to);
  const lower = addMonths(from, months);
  const upper = addMonths(from, months + 1);
  return (
    months +
    (dayNumber(to) - dayNumber(lower)) / (dayNumber(upper) - dayNumber(lower))
  );
}

function actualYears(from: string, to: string): number {
  let date = from;
  let years = 0;
  while (date < to) {
    const year = Number(date.slice(0, 4));
    const next = `${year + 1}-01-01`;
    const until = next < to ? next : to;
    years +=
      (dayNumber(until) - dayNumber(date)) /
      (dayNumber(next) - dayNumber(`${year}-01-01`));
    date = until;
  }
  return years;
}

export function getAssetValuation(asset: CfmAsset, asOf: string): CfmValuation {
  validateCfmAsset(asset);
  assertCfmDate(asOf);
  if (asOf < asset.acquisitionDate) {
    return {
      value: 0,
      asOf,
      effectiveDate: asset.acquisitionDate,
      source: 'acquisition',
      method: 'manual',
    };
  }
  if (asset.disposalDate && asOf >= asset.disposalDate) {
    return {
      value: 0,
      asOf,
      effectiveDate: asset.disposalDate,
      source: 'disposed',
      method: asset.policy.method,
    };
  }
  const policies = new Map<string, CfmAssetPolicy>();
  for (const policy of [...(asset.policyHistory ?? []), asset.policy]) {
    policies.set(policy.effectiveDate, policy);
  }
  const events = [
    ...[...policies.values()]
      .filter(policy => policy.effectiveDate <= asOf)
      .map(policy => ({
        date: policy.effectiveDate,
        policy,
        observation: undefined,
      })),
    ...(asset.observations ?? [])
      .filter(observation => observation.date <= asOf && !observation.modeled)
      .map(observation => ({
        date: observation.date,
        policy: undefined,
        observation,
      })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.policy
        ? -1
        : b.policy
          ? 1
          : (a.observation?.recordedAt ?? '').localeCompare(
              b.observation?.recordedAt ?? '',
            )),
  );
  let value = asset.acquisitionValue;
  let date = asset.acquisitionDate;
  let policy: CfmAssetPolicy = { effectiveDate: date, method: 'manual' };
  let source: CfmValuation['source'] = 'acquisition';
  let observationId: string | undefined;
  for (const event of events) {
    const next = modelAsset(value, date, event.date, policy);
    if (next !== value) source = 'modeled';
    value = next;
    date = event.date;
    if (event.policy) {
      policy = event.policy;
      if (policy.baseValue !== undefined) value = policy.baseValue;
      if (policy.method === 'schedule') {
        const initial = policy.schedule?.find(item => item.date === date);
        if (initial) value = initial.amount;
      }
      if (policy.baseValue !== undefined) source = 'modeled';
    } else if (event.observation) {
      value = event.observation.value;
      source = 'observed';
      observationId = event.observation.id;
    }
  }
  const result = modelAsset(value, date, asOf, policy);
  if (result !== value) source = 'modeled';
  return {
    value: result,
    asOf,
    effectiveDate: date,
    source,
    method: policy.method,
    observationId,
  };
}

export const valueAsset = getAssetValuation;

export function getObligationStatus(
  obligation: CfmObligation,
  settlements: CfmRecord<CfmSettlement>[],
  asOf: string,
  obligationId?: string,
): CfmObligationStatus {
  validateCfmObligation(obligation);
  assertCfmDate(asOf);
  const ids = new Set(settlements.map(record => record.data.obligationId));
  const id = obligationId ?? (ids.size === 1 ? [...ids][0] : undefined);
  if (!id && ids.size > 1) {
    throw new Error(
      'Specify the obligation ID when evaluating multiple obligations.',
    );
  }
  const events = settlements
    .filter(record => !id || record.data.obligationId === id)
    .sort(
      (a, b) =>
        a.data.date.localeCompare(b.data.date) ||
        a.updatedAt.localeCompare(b.updatedAt) ||
        a.id.localeCompare(b.id),
    );
  const applied = new Map<
    string,
    { kind: CfmSettlement['kind']; amount: number; reversed: number }
  >();
  let paid = 0;
  let writtenOff = 0;
  for (const record of events) {
    const item = record.data;
    validateCfmSettlement(item);
    if (item.date < obligation.date) {
      throw new Error('A settlement cannot precede its obligation.');
    }
    if (applied.has(record.id)) throw new Error('Duplicate settlement ID.');
    if (item.date > asOf) continue;
    if (item.kind === 'reversal') {
      const prior = item.reversesId ? applied.get(item.reversesId) : undefined;
      if (!prior || prior.kind === 'reversal') {
        throw new Error(
          'The reversed settlement is missing or is itself a reversal.',
        );
      }
      if (item.amount > prior.amount - prior.reversed) {
        throw new Error('Reversal exceeds the unreversed settlement.');
      }
      prior.reversed += item.amount;
      if (prior.kind === 'payment') paid -= item.amount;
      else writtenOff -= item.amount;
    } else {
      if (item.amount > obligation.amount - paid - writtenOff) {
        throw new Error(
          'Settlement exceeds the outstanding amount; allocate overpayments explicitly.',
        );
      }
      if (item.kind === 'payment') paid = sum([paid, item.amount]);
      else writtenOff = sum([writtenOff, item.amount]);
    }
    applied.set(record.id, {
      kind: item.kind,
      amount: item.amount,
      reversed: 0,
    });
  }
  const outstanding =
    asOf < obligation.date ? 0 : obligation.amount - paid - writtenOff;
  let status: CfmObligationStatus['status'] = 'open';
  if (asOf < obligation.date) status = 'not-started';
  else if (!outstanding) status = writtenOff ? 'written-off' : 'settled';
  else if (obligation.disputed) status = 'disputed';
  else if (obligation.dueDate && obligation.dueDate < asOf) status = 'overdue';
  else if (paid || writtenOff) status = 'partially-settled';
  return { outstanding, paid, writtenOff, status };
}

export function createBalanceSheet(
  accounts: CfmAccount[],
  balances: Record<string, number>,
  classifications: CfmAccountClassification[],
  asOf: string,
  currency: string,
): CfmBalanceSheet {
  assertCfmDate(asOf);
  assertCfmCurrency(currency);
  const rows: CfmBalanceSheetRow[] = [];
  const warnings: string[] = [];
  for (const account of accounts) {
    const balance = balances[account.id] ?? 0;
    assertCfmAmount(balance);
    if (account.closed && !balance) continue;
    const classification = getAccountClassification(
      classifications,
      account.id,
      asOf,
    );
    if (classification && classification.currency !== currency) {
      throw new Error(
        `Cannot combine ${classification.currency} and ${currency} in one financial view.`,
      );
    }
    const kind = classification?.kind ?? 'unclassified';
    const isLiability = classification
      ? liability(classification.kind)
      : balance < 0;
    const rowWarnings: string[] = [];
    if (!classification) {
      rowWarnings.push(`Unclassified account: ${account.name}`);
    }
    if (
      classification &&
      ((isLiability && balance > 0) || (!isLiability && balance < 0))
    ) {
      rowWarnings.push(`Unusual balance sign: ${account.name}`);
    }
    const group = isLiability
      ? classification?.liabilityTerm === 'long-term' ||
        (classification?.kind === 'loan' &&
          classification.liabilityTerm !== 'current')
        ? 'long-term-liabilities'
        : 'current-liabilities'
      : classification?.kind === 'cash'
        ? 'liquidity'
        : classification?.kind === 'investment'
          ? 'equities'
          : 'other-assets';
    rows.push({
      accountId: account.id,
      name: account.name,
      kind,
      balance,
      amount: isLiability ? -balance : balance,
      group,
      warnings: rowWarnings,
    });
    warnings.push(...rowWarnings);
  }
  const totalAssets = sum(
    rows
      .filter(row => !row.group.endsWith('liabilities'))
      .map(row => row.amount),
  );
  const totalLiabilities = sum(
    rows
      .filter(row => row.group.endsWith('liabilities'))
      .map(row => row.amount),
  );
  const liquidity = sum(
    rows
      .filter(row => {
        const classification = getAccountClassification(
          classifications,
          row.accountId,
          asOf,
        );
        return classification?.isLiquid && !classification.restricted;
      })
      .map(row => row.balance),
  );
  return {
    asOf,
    currency,
    rows,
    totalAssets,
    totalLiabilities,
    netEquity: totalAssets - totalLiabilities,
    liquidity,
    currentLiabilities: sum(
      rows
        .filter(row => row.group === 'current-liabilities')
        .map(row => row.amount),
    ),
    warnings,
  };
}

export function buildBalanceSheet(input: {
  accounts: CfmAccount[];
  transactions: CfmLedgerTransaction[];
  classifications: CfmAccountClassification[];
  asOf: string;
  currency: string;
}): CfmBalanceSheet {
  return createBalanceSheet(
    input.accounts,
    getAccountBalances(input.transactions, input.asOf),
    input.classifications,
    input.asOf,
    input.currency,
  );
}

function eventIdentity(event: CfmForecastEvent): string {
  if (event.occurrenceId) {
    return `occurrence:${event.occurrenceId}:${event.accountId}`;
  }
  if (event.scheduleId) {
    return `schedule:${event.scheduleId}:${event.date}:${event.accountId}`;
  }
  if (event.obligationId) {
    return `obligation:${event.obligationId}:${event.date}:${event.accountId}`;
  }
  if (event.transactionId) return `transaction:${event.transactionId}`;
  return `event:${event.id}`;
}

function eventPriority(event: CfmForecastEvent): number {
  return {
    transaction: 0,
    'card-payment': 1,
    obligation: 2,
    schedule: 3,
    manual: 4,
    plan: 5,
  }[event.source];
}

function paymentDate(
  after: string,
  statementDay: number,
  paymentDay: number,
): string {
  const month = `${after.slice(0, 7)}-01`;
  const statement = `${month.slice(0, 8)}${String(Math.min(statementDay, Number(endOfMonth(month).slice(8)))).padStart(2, '0')}`;
  const statementMonth = after <= statement ? month : addMonths(month, 1);
  let paymentMonth =
    paymentDay > statementDay ? statementMonth : addMonths(statementMonth, 1);
  let date = `${paymentMonth.slice(0, 8)}${String(Math.min(paymentDay, Number(endOfMonth(paymentMonth).slice(8)))).padStart(2, '0')}`;
  if (date <= after) {
    paymentMonth = addMonths(paymentMonth, 1);
    date = `${paymentMonth.slice(0, 8)}${String(Math.min(paymentDay, Number(endOfMonth(paymentMonth).slice(8)))).padStart(2, '0')}`;
  }
  return date;
}

function nextPaymentDate(after: string, day: number): string {
  let month = `${after.slice(0, 7)}-01`;
  let date = `${month.slice(0, 8)}${String(Math.min(day, Number(endOfMonth(month).slice(8)))).padStart(2, '0')}`;
  if (date <= after) {
    month = addMonths(month, 1);
    date = `${month.slice(0, 8)}${String(Math.min(day, Number(endOfMonth(month).slice(8)))).padStart(2, '0')}`;
  }
  return date;
}

export function projectLiquidity(
  input: CfmLiquidityInput,
): CfmLiquidityProjection {
  const { startDate, endDate, currency } = input;
  assertCfmDate(startDate);
  assertCfmDate(endDate);
  assertCfmCurrency(currency);
  if (endDate < startDate || dayNumber(endDate) - dayNumber(startDate) > 3660) {
    throw new Error('Projection horizon must be between zero and 3660 days.');
  }
  if (input.receivableDelayDays !== undefined) {
    nonnegative(input.receivableDelayDays, 'Receivable delay');
  }
  if (input.minimumCash !== undefined) {
    assertCfmAmount(input.minimumCash, 'Minimum cash');
  }
  const rows = ledgerRows(input.transactions);
  const balances = getAccountBalances(input.transactions, startDate);
  const sheet = createBalanceSheet(
    input.accounts,
    balances,
    input.classifications,
    startDate,
    currency,
  );
  const warnings = [...sheet.warnings];
  for (
    let year = Number(startDate.slice(0, 4));
    year <= Number(endDate.slice(0, 4));
    year++
  ) {
    if (!input.annualPlans?.some(plan => plan.year === year)) {
      warnings.push(
        `No annual plans for ${year}; only posted transactions, schedules, and obligations are projected.`,
      );
    }
  }
  const accountIds = new Set(input.accounts.map(account => account.id));
  const eligible = new Set(
    input.accounts
      .filter(account => {
        const classification = getAccountClassification(
          input.classifications,
          account.id,
          startDate,
        );
        return (
          classification?.isLiquid &&
          !classification.restricted &&
          !account.closed
        );
      })
      .map(account => account.id),
  );
  const excludedAccounts = input.accounts
    .filter(account => !eligible.has(account.id))
    .map(account => account.id);
  const openingLiquidity = sum([...eligible].map(id => balances[id] ?? 0));
  if (input.staleAccountIds?.length) {
    warnings.push(`Stale account data: ${input.staleAccountIds.join(', ')}`);
  }
  const proposed: CfmForecastEvent[] = [];
  for (const row of rows) {
    if (row.is_child || row.date <= startDate || row.date > endDate) continue;
    proposed.push({
      id: row.id,
      date: row.date,
      accountId: row.account,
      amount: row.amount,
      currency,
      source: 'transaction',
      transactionId: row.id,
      scheduleId: row.schedule,
      categoryId: row.category ?? undefined,
    });
  }
  proposed.push(...(input.events ?? []));
  const undatedObligations: string[] = [];
  const settlements = input.settlements ?? [];
  const defaultCash = input.planAccountId ?? [...eligible][0];
  if (input.planAccountId && !eligible.has(input.planAccountId)) {
    throw new Error('The forecast plan account must be eligible liquidity.');
  }
  for (const record of input.obligations ?? []) {
    const obligation = record.data;
    validateCfmObligation(obligation);
    if (obligation.currency !== currency) {
      throw new Error('Obligation currency differs from projection currency.');
    }
    const status = getObligationStatus(
      obligation,
      settlements,
      startDate,
      record.id,
    );
    if (!status.outstanding || obligation.disputed) continue;
    const date = obligation.expectedDate ?? obligation.dueDate;
    if (!date) {
      undatedObligations.push(record.id);
      continue;
    }
    if (obligation.direction === 'receivable' && !input.includeReceivables) {
      continue;
    }
    if (!defaultCash) {
      warnings.push('No eligible cash account for obligation projections.');
      continue;
    }
    const shifted =
      obligation.direction === 'receivable'
        ? addDays(date, input.receivableDelayDays ?? 0)
        : date;
    const forecastDate = shifted <= startDate ? addDays(startDate, 1) : shifted;
    if (forecastDate > endDate) continue;
    // Linked payments already posted/scheduled in the future replace the corresponding obligation portion.
    const futureSettled = sum(
      settlements
        .filter(
          item =>
            item.data.obligationId === record.id &&
            item.data.kind === 'payment' &&
            item.data.date > startDate &&
            item.data.date <= endDate,
        )
        .map(item => item.data.amount),
    );
    const amount = Math.max(0, status.outstanding - futureSettled);
    if (amount) {
      proposed.push({
        id: `obligation:${record.id}`,
        date: forecastDate,
        accountId: defaultCash,
        amount: obligation.direction === 'receivable' ? amount : -amount,
        currency,
        source: 'obligation',
        obligationId: record.id,
        categoryId: obligation.categoryId,
      });
    }
  }
  for (const event of proposed) {
    assertCfmDate(event.date);
    assertCfmAmount(event.amount);
    if (event.currency !== currency) {
      throw new Error('Forecast events use different currencies.');
    }
    if (
      !accountIds.has(event.accountId) ||
      (event.transferAccountId && !accountIds.has(event.transferAccountId))
    ) {
      throw new Error('Forecast event references an unknown account.');
    }
  }
  const actualTransactions = new Map(rows.map(row => [row.id, row]));
  const postedScheduleKeys = new Set(
    rows
      .filter(row => row.schedule && row.date <= startDate)
      .map(row => `${row.schedule}:${row.date}:${row.account}`),
  );
  const deduplicated = new Map<string, CfmForecastEvent>();
  for (const event of proposed.sort(
    (a, b) => eventPriority(a) - eventPriority(b) || a.id.localeCompare(b.id),
  )) {
    if (event.date <= startDate || event.date > endDate || event.nonCash) {
      continue;
    }
    if (
      event.source !== 'transaction' &&
      event.transactionId &&
      actualTransactions.has(event.transactionId)
    ) {
      continue;
    }
    if (
      event.source !== 'transaction' &&
      event.scheduleId &&
      postedScheduleKeys.has(
        `${event.scheduleId}:${event.date}:${event.accountId}`,
      )
    ) {
      continue;
    }
    const key = eventIdentity(event);
    if (!deduplicated.has(key)) deduplicated.set(key, event);
  }
  const events = [...deduplicated.values()];
  // Fill only the category/month amount not already represented by posted or committed events.
  for (const plan of input.annualPlans ?? []) {
    validateCfmAnnualPlan(plan);
    if (plan.currency !== currency) {
      throw new Error('Annual plan currency differs from projection currency.');
    }
    if (!defaultCash) {
      warnings.push('No eligible cash account for annual plan projections.');
      continue;
    }
    const monthly = allocateAnnualPlan(plan);
    for (let month = 1; month <= 12; month++) {
      const prefix = `${plan.year}-${String(month).padStart(2, '0')}`;
      const last = endOfMonth(`${prefix}-01`);
      if (last <= startDate || `${prefix}-01` > endDate) continue;
      const posted = sum(
        rows
          .filter(
            row =>
              !row.is_parent &&
              !row.transfer_id &&
              row.category === plan.categoryId &&
              row.date.startsWith(prefix) &&
              row.date <= startDate,
          )
          .map(row => (plan.direction === 'income' ? row.amount : -row.amount)),
      );
      const committed = sum([
        sum(
          rows
            .filter(
              row =>
                !row.is_parent &&
                !row.transfer_id &&
                row.category === plan.categoryId &&
                row.date.startsWith(prefix) &&
                row.date > startDate &&
                row.date <= endDate,
            )
            .map(row =>
              plan.direction === 'income' ? row.amount : -row.amount,
            ),
        ),
        sum(
          events
            .filter(
              event =>
                event.source !== 'plan' &&
                event.source !== 'transaction' &&
                event.categoryId === plan.categoryId &&
                event.date.startsWith(prefix) &&
                !event.transferAccountId,
            )
            .map(event =>
              plan.direction === 'income' ? event.amount : -event.amount,
            ),
        ),
      ]);
      let remaining = Math.max(
        0,
        (monthly[month - 1] ?? 0) - posted - committed,
      );
      for (const dated of [...(plan.datedAmounts ?? [])]
        .filter(
          item =>
            item.date.startsWith(prefix) &&
            item.date > startDate &&
            item.date <= endDate,
        )
        .sort((a, b) => a.date.localeCompare(b.date))) {
        const amount = Math.min(remaining, dated.amount);
        if (amount) {
          events.push({
            id: `plan:${plan.categoryId}:${dated.date}`,
            accountId: defaultCash,
            date: dated.date,
            amount: plan.direction === 'income' ? amount : -amount,
            currency,
            source: 'plan',
            categoryId: plan.categoryId,
          });
        }
        remaining -= amount;
      }
      if (remaining && last <= endDate) {
        events.push({
          id: `plan:${plan.categoryId}:${prefix}`,
          accountId: defaultCash,
          date: last,
          amount: plan.direction === 'income' ? remaining : -remaining,
          currency,
          source: 'plan',
          categoryId: plan.categoryId,
        });
      }
    }
  }
  // Cards affect liquid cash on payment, not on purchase. Existing explicit card transfers take precedence.
  const automaticCardPayments = new Map<string, CfmForecastEvent>();
  for (const account of input.accounts) {
    const classification = getAccountClassification(
      input.classifications,
      account.id,
      startDate,
    );
    if (classification?.kind !== 'credit-card') continue;
    const cardEvents = events.filter(
      event =>
        event.accountId === account.id &&
        event.amount < 0 &&
        !event.transferAccountId,
    );
    const debt = Math.max(0, -(balances[account.id] ?? 0));
    if (!debt && !cardEvents.length) continue;
    if (
      !classification.paymentDay ||
      !classification.statementDay ||
      !classification.paymentAccountId
    ) {
      warnings.push(`Card payment timing is missing: ${account.name}`);
      continue;
    }
    const paymentAccount = classification.paymentAccountId;
    if (!eligible.has(paymentAccount)) {
      warnings.push(
        `Card payment account is not eligible liquidity: ${account.name}`,
      );
      continue;
    }
    const explicit = events.filter(
      event =>
        event.source === 'card-payment' ||
        event.transferAccountId === account.id ||
        (event.accountId === account.id && event.amount > 0),
    );
    const expectedPayments = new Map<string, number>();
    const addPayment = (date: string, amount: number) => {
      if (date <= endDate && amount) {
        expectedPayments.set(
          date,
          sum([expectedPayments.get(date) || 0, amount]),
        );
      }
    };
    if (debt) {
      addPayment(nextPaymentDate(startDate, classification.paymentDay), debt);
    }
    for (const event of cardEvents) {
      addPayment(
        paymentDate(
          event.date,
          classification.statementDay,
          classification.paymentDay,
        ),
        -event.amount,
      );
    }
    const appliedExplicit = new Set<string>();
    for (const [date, amount] of [...expectedPayments].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const matching = explicit.filter(
        event =>
          !appliedExplicit.has(event.id) &&
          event.date.slice(0, 7) === date.slice(0, 7) &&
          (event.accountId === account.id ||
            event.transferAccountId === account.id ||
            event.description === account.id),
      );
      const effective = Math.max(
        0,
        amount - sum(matching.map(event => Math.abs(event.amount))),
      );
      for (const event of matching) appliedExplicit.add(event.id);
      if (!effective) continue;
      const key = `${account.id}:${date}`;
      automaticCardPayments.set(key, {
        id: `card:${key}`,
        date,
        accountId: paymentAccount,
        amount: -effective,
        currency,
        source: 'card-payment',
        description: account.id,
      });
    }
  }
  events.push(...automaticCardPayments.values());
  const movements: CfmForecastEvent[] = [];
  for (const event of events) {
    if (event.nonCash) continue;
    if (eligible.has(event.accountId)) movements.push(event);
    if (event.transferAccountId && eligible.has(event.transferAccountId)) {
      movements.push({
        ...event,
        id: `${event.id}:counterpart`,
        accountId: event.transferAccountId,
        amount: -event.amount,
        transferAccountId: event.accountId,
      });
    }
  }
  movements.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const daily: CfmLiquidityPoint[] = [];
  let balance = openingLiquidity;
  let minimumLiquidity = balance;
  let minimumDate = startDate;
  const shortfallDates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const items = movements.filter(event => event.date === date);
    const inflows = sum(
      items.filter(event => event.amount > 0).map(event => event.amount),
    );
    const outflows = sum(
      items.filter(event => event.amount < 0).map(event => -event.amount),
    );
    const closing = sum([balance, inflows, -outflows]);
    daily.push({
      date,
      opening: balance,
      inflows,
      outflows,
      closing,
      events: items,
    });
    if (closing < minimumLiquidity) {
      minimumLiquidity = closing;
      minimumDate = date;
    }
    if (closing < (input.minimumCash ?? 0)) shortfallDates.push(date);
    balance = closing;
  }
  const monthly: CfmLiquidityPoint[] = [];
  for (const point of daily) {
    const prior = monthly.at(-1);
    if (prior?.date === point.date.slice(0, 7)) {
      prior.inflows = sum([prior.inflows, point.inflows]);
      prior.outflows = sum([prior.outflows, point.outflows]);
      prior.closing = point.closing;
      prior.events.push(...point.events);
    } else {
      monthly.push({
        ...point,
        date: point.date.slice(0, 7),
        events: [...point.events],
      });
    }
  }
  const currentLiabilities = sheet.currentLiabilities;
  return {
    startDate,
    endDate,
    currency,
    openingLiquidity,
    currentLiabilities,
    coverageRatio:
      currentLiabilities > 0 ? openingLiquidity / currentLiabilities : null,
    cashAfterCoverage: openingLiquidity - currentLiabilities,
    closingLiquidity: balance,
    minimumLiquidity,
    minimumDate,
    shortfallDates,
    daily,
    monthly,
    excludedAccounts,
    undatedObligations,
    warnings: [...new Set(warnings)],
  };
}
