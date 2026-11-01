import type { AccountEntity } from './account';
import type { CategoryEntity } from './category';
import type { TransactionEntity } from './transaction';

export type CfmRecordKind =
  | 'classification'
  | 'annual-plan'
  | 'asset'
  | 'obligation'
  | 'settlement'
  | 'report-template'
  | 'report-run'
  | 'automation'
  | 'audit';

export type CfmRecord<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  kind: CfmRecordKind;
  data: T;
  updatedAt: string;
};

export type CfmState = {
  deviceId: string;
  accounts: AccountEntity[];
  categories: CategoryEntity[];
  transactions: TransactionEntity[];
  records: CfmRecord[];
  currency: string;
};

export type CfmAccountKind =
  | 'cash'
  | 'investment'
  | 'asset'
  | 'credit-card'
  | 'loan'
  | 'receivable'
  | 'payable';

export type CfmAccountClassification = {
  accountId: string;
  effectiveDate: string;
  kind: CfmAccountKind;
  currency: string;
  isLiquid: boolean;
  restricted?: boolean;
  liabilityTerm?: 'current' | 'long-term';
  paymentAccountId?: string;
  paymentDay?: number;
  statementDay?: number;
};

export type CfmDatedAmount = { date: string; amount: number };

export type CfmAnnualPlan = {
  year: number;
  categoryId: string;
  amount: number;
  currency: string;
  revision: number;
  direction?: 'expense' | 'income';
  allocationMethod?: 'equal' | 'monthly' | 'weighted';
  monthlyAmounts?: number[];
  monthlyWeights?: number[];
  datedAmounts?: CfmDatedAmount[];
  notes?: string;
};

export type CfmAssetPolicy = {
  effectiveDate: string;
  method: 'manual' | 'straight-line' | 'fixed-rate' | 'schedule';
  baseValue?: number;
  residualValue?: number;
  usefulLifeMonths?: number;
  annualRateBasisPoints?: number;
  compound?: boolean;
  postingFrequency?: 'daily' | 'monthly' | 'quarterly' | 'annually';
  schedule?: CfmDatedAmount[];
};

export type CfmAssetObservation = {
  id: string;
  date: string;
  value: number;
  recordedAt: string;
  source: string;
  modeled?: boolean;
  transactionId?: string;
  notes?: string;
};

export type CfmAsset = {
  accountId: string;
  name: string;
  currency: string;
  acquisitionDate: string;
  acquisitionValue: number;
  policy: CfmAssetPolicy;
  policyHistory?: CfmAssetPolicy[];
  observations?: CfmAssetObservation[];
  disposalDate?: string;
  linkedDebtAccountId?: string;
};

export type CfmObligation = {
  accountId: string;
  direction: 'receivable' | 'payable';
  counterparty: string;
  amount: number;
  currency: string;
  date: string;
  dueDate?: string;
  expectedDate?: string;
  sourceTransactionId?: string;
  existingBalance?: boolean;
  categoryId?: string;
  disputed?: boolean;
  notes?: string;
};

export type CfmSettlement = {
  obligationId: string;
  categoryId?:string;
  date: string;
  amount: number;
  kind: 'payment' | 'writeoff' | 'reversal';
  transactionId?: string;
  accountId?: string;
  reversesId?: string;
  notes?: string;
};

export type CfmLedgerTransaction = {
  id: string;
  account: string;
  date: string;
  amount: number;
  category?: string | null;
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string;
  transfer_id?: string;
  schedule?: string;
  tombstone?: boolean | number;
  cleared?: boolean;
  reconciled?: boolean;
  subtransactions?: CfmLedgerTransaction[];
};

export type CfmAccount = {
  id: string;
  name: string;
  closed?: boolean | number;
  offbudget?: boolean | number;
};

export type CfmForecastEvent = {
  id: string;
  date: string;
  accountId: string;
  amount: number;
  currency: string;
  source:
    | 'transaction'
    | 'schedule'
    | 'obligation'
    | 'plan'
    | 'manual'
    | 'card-payment';
  occurrenceId?: string;
  transactionId?: string;
  scheduleId?: string;
  obligationId?: string;
  categoryId?: string;
  transferAccountId?: string;
  nonCash?: boolean;
  description?: string;
};

export type CfmBalanceSheetRow = {
  accountId: string;
  name: string;
  kind: CfmAccountKind | 'unclassified';
  balance: number;
  amount: number;
  group:
    | 'liquidity'
    | 'equities'
    | 'other-assets'
    | 'current-liabilities'
    | 'long-term-liabilities';
  warnings: string[];
};

export type CfmBalanceSheet = {
  asOf: string;
  currency: string;
  rows: CfmBalanceSheetRow[];
  totalAssets: number;
  totalLiabilities: number;
  netEquity: number;
  liquidity: number;
  currentLiabilities: number;
  warnings: string[];
};

export type CfmAnnualPlanPerformance = {
  year: number;
  categoryId: string;
  revision: number;
  annualAmount: number;
  monthlyAmounts: number[];
  expectedYtd: number;
  actualYtd: number;
  variance: number;
  remaining: number;
  cutoff: string;
};

export type CfmValuation = {
  value: number;
  asOf: string;
  effectiveDate: string;
  source: 'acquisition' | 'observed' | 'modeled' | 'disposed';
  method: CfmAssetPolicy['method'];
  observationId?: string;
};

export type CfmObligationStatus = {
  outstanding: number;
  paid: number;
  writtenOff: number;
  status:
    | 'not-started'
    | 'open'
    | 'partially-settled'
    | 'settled'
    | 'overdue'
    | 'written-off'
    | 'disputed';
};

export type CfmLiquidityPoint = {
  date: string;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  events: CfmForecastEvent[];
};

export type CfmLiquidityProjection = {
  startDate: string;
  endDate: string;
  currency: string;
  openingLiquidity: number;
  currentLiabilities: number;
  coverageRatio: number | null;
  cashAfterCoverage: number;
  closingLiquidity: number;
  minimumLiquidity: number;
  minimumDate: string;
  shortfallDates: string[];
  daily: CfmLiquidityPoint[];
  monthly: CfmLiquidityPoint[];
  excludedAccounts: string[];
  undatedObligations: string[];
  warnings: string[];
};

export type CfmLiquidityInput = {
  accounts: CfmAccount[];
  transactions: CfmLedgerTransaction[];
  classifications: CfmAccountClassification[];
  events?: CfmForecastEvent[];
  obligations?: CfmRecord<CfmObligation>[];
  settlements?: CfmRecord<CfmSettlement>[];
  annualPlans?: CfmAnnualPlan[];
  startDate: string;
  endDate: string;
  currency: string;
  planAccountId?: string;
  includeReceivables?: boolean;
  receivableDelayDays?: number;
  minimumCash?: number;
  staleAccountIds?: string[];
};

export type CfmRecordDataMap = {
  classification: CfmAccountClassification;
  'annual-plan': CfmAnnualPlan;
  asset: CfmAsset;
  obligation: CfmObligation;
  settlement: CfmSettlement;
  'report-template': Record<string, unknown>;
  'report-run': Record<string, unknown>;
  automation: Record<string, unknown>;
  audit: Record<string, unknown>;
};
