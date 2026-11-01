import { addYears, format, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

import { aqlQuery } from '#server/aql';
import { getScheduleDates } from '#server/schedules/occurrences';
import {
  buildBalanceSheet,
  getAccountBalances,
  getAnnualPlanPerformance,
  getCfmRecords,
  getObligationStatus,
  projectLiquidity,
  valueAsset,
} from '#shared/cfm';
import {
  createReportRun,
  getReportDocuments,
  validateReportTemplate,
} from '#shared/cfm-reports';
import type {
  CfmReportCell,
  CfmReportColumn,
  CfmReportSection,
  CfmReportSectionDefinition,
  CfmResolvedReportPeriod,
} from '#shared/cfm-reports';
import { q } from '#shared/query';
import type { ScheduleEntity } from '#types/models';
import type { CfmForecastEvent, CfmRecord, CfmState } from '#types/models/cfm';

import { getState } from './app';
import { readRecord, writeRecord } from './store';

export type ProjectionOptions = {
  startDate: string;
  endDate: string;
  includeReceivables?: boolean;
  receivableDelayDays?: number;
  minimumCash?: number;
  planAccountId?: string;
};
export async function scheduleForecastEvents(
  startDate: string,
  endDate: string,
  currency: string,
): Promise<CfmForecastEvent[]> {
  const result = await aqlQuery(q('schedules').select('*'));
  const schedules: ScheduleEntity[] = result.data;
  const events: CfmForecastEvent[] = [];
  for (const schedule of schedules) {
    if (schedule.completed || !schedule._account || !schedule._date) continue;
    const amount =
      typeof schedule._amount === 'number'
        ? schedule._amount
        : Math.round((schedule._amount.num1 + schedule._amount.num2) / 2);
    for (const date of getScheduleDates(schedule._date, {
      start: startDate,
      end: endDate,
    }))
      events.push({
        id: `schedule:${schedule.id}:${date}`,
        date,
        accountId: schedule._account,
        amount,
        currency,
        source: 'schedule',
        scheduleId: schedule.id,
        description: schedule.name || 'Scheduled transaction',
      });
  }
  return events;
}
export async function projectCfmLiquidity(options: ProjectionOptions) {
  const state = await getState();
  const staleAccountIds = state.accounts
    .filter(
      account =>
        account.account_sync_source &&
        (!account.last_sync ||
          new Date(account.last_sync).getTime() < Date.now() - 86400000),
    )
    .map(account => account.id);
  return projectLiquidity({
    ...options,
    accounts: state.accounts,
    transactions: state.transactions,
    classifications: getCfmRecords(state.records, 'classification').map(
      item => item.data,
    ),
    events: await scheduleForecastEvents(
      options.startDate,
      options.endDate,
      state.currency,
    ),
    obligations: getCfmRecords(state.records, 'obligation'),
    settlements: getCfmRecords(state.records, 'settlement'),
    annualPlans: getCfmRecords(state.records, 'annual-plan').map(
      item => item.data,
    ),
    currency: state.currency,
    staleAccountIds,
  });
}
const column = (
  key: string,
  label: string,
  format: CfmReportColumn['format'] = 'text',
): CfmReportColumn => ({ key, label, format });
function materialize(
  definition: CfmReportSectionDefinition,
  period: CfmResolvedReportPeriod,
  state: CfmState,
  liquidity: Awaited<ReturnType<typeof projectCfmLiquidity>>,
): CfmReportSection {
  const base = {
    id: definition.id,
    type: definition.type,
    title: definition.title,
  };
  const classifications = getCfmRecords(state.records, 'classification').map(
    item => item.data,
  );
  const selectedAccounts = state.accounts.filter(
    account =>
      !definition.accountIds?.length ||
      definition.accountIds.includes(account.id),
  );
  const selectedTransactions = state.transactions.filter(
    transaction =>
      (!definition.accountIds?.length ||
        definition.accountIds.includes(transaction.account)) &&
      (!definition.categoryIds?.length ||
        (transaction.category &&
          definition.categoryIds.includes(transaction.category))),
  );
  const balances = getAccountBalances(state.transactions, period.asOf);
  const assets = () =>
    getCfmRecords(state.records, 'asset')
      .filter(
        item =>
          !definition.accountIds?.length ||
          definition.accountIds.includes(item.data.accountId),
      )
      .map(item => ({
        name: item.data.name,
        account: item.data.accountId,
        ...valueAsset(item.data, period.asOf),
      }));
  const obligations = () =>
    getCfmRecords(state.records, 'obligation')
      .filter(
        item =>
          !definition.accountIds?.length ||
          definition.accountIds.includes(item.data.accountId),
      )
      .map(item => ({
        id: item.id,
        counterparty: item.data.counterparty,
        direction: item.data.direction,
        dueDate: item.data.dueDate || '',
        original: item.data.amount,
        ...getObligationStatus(
          item.data,
          getCfmRecords(state.records, 'settlement'),
          period.asOf,
          item.id,
        ),
      }));
  if (definition.type === 'balance-sheet') {
    const sheet = buildBalanceSheet({
      accounts: selectedAccounts,
      transactions: state.transactions,
      classifications,
      asOf: period.asOf,
      currency: state.currency,
    });
    return {
      ...base,
      columns: [
        column('name', 'Account'),
        column('group', 'Section'),
        column('balance', 'Signed balance', 'money'),
      ],
      rows: sheet.rows.map(row => ({
        name: row.name,
        group: row.group,
        balance: row.balance,
      })),
      totals: {
        totalAssets: sheet.totalAssets,
        totalLiabilities: sheet.totalLiabilities,
        netEquity: sheet.netEquity,
      },
      notes: sheet.warnings,
    };
  }
  if (definition.type === 'annual-plan')
    return {
      ...base,
      columns: [
        column('category', 'Category'),
        column('annualAmount', 'Annual plan', 'money'),
        column('expectedYtd', 'Expected YTD', 'money'),
        column('actualYtd', 'Actual YTD', 'money'),
        column('variance', 'Variance', 'money'),
        column('remaining', 'Remaining', 'money'),
      ],
      rows: getCfmRecords(state.records, 'annual-plan')
        .filter(
          item =>
            item.data.year === Number(period.asOf.slice(0, 4)) &&
            (!definition.categoryIds?.length ||
              definition.categoryIds.includes(item.data.categoryId)),
        )
        .map(item => {
          const result = getAnnualPlanPerformance(
            item.data,
            state.transactions,
            period.asOf,
          );
          return {
            category:
              state.categories.find(
                category => category.id === item.data.categoryId,
              )?.name || item.data.categoryId,
            annualAmount: result.annualAmount,
            expectedYtd: result.expectedYtd,
            actualYtd: result.actualYtd,
            variance: result.variance,
            remaining: result.remaining,
          };
        }),
    };
  if (definition.type === 'liquidity')
    return {
      ...base,
      columns: [
        column('date', 'Date', 'date'),
        column('opening', 'Opening cash', 'money'),
        column('inflows', 'Receipts', 'money'),
        column('outflows', 'Payments', 'money'),
        column('closing', 'Closing cash', 'money'),
      ],
      rows: liquidity.monthly.map(row => ({
        date: row.date,
        opening: row.opening,
        inflows: row.inflows,
        outflows: row.outflows,
        closing: row.closing,
      })),
      notes: liquidity.warnings,
    };
  if (definition.type === 'assets')
    return {
      ...base,
      columns: [
        column('name', 'Asset'),
        column('value', 'Valuation', 'money'),
        column('source', 'Valuation source'),
        column('effectiveDate', 'Value date', 'date'),
      ],
      rows: assets().map(row => ({
        name: row.name,
        value: row.value,
        source: row.source,
        effectiveDate: row.effectiveDate,
      })),
    };
  if (definition.type === 'obligations')
    return {
      ...base,
      columns: [
        column('counterparty', 'Counterparty'),
        column('direction', 'AR / AP'),
        column('dueDate', 'Due date', 'date'),
        column('outstanding', 'Outstanding', 'money'),
        column('status', 'Status'),
      ],
      rows: obligations().map(row => ({
        counterparty: row.counterparty,
        direction: row.direction,
        dueDate: row.dueDate,
        outstanding: row.outstanding,
        status: row.status,
      })),
    };
  let data: Record<string, CfmReportCell>[] = [];
  if (definition.source === 'transactions')
    data = selectedTransactions
      .filter(
        row =>
          !row.is_parent &&
          row.date >= period.startDate &&
          row.date <= period.endDate,
      )
      .map(row => ({
        id: row.id,
        date: row.date,
        account:
          state.accounts.find(a => a.id === row.account)?.name || row.account,
        category: state.categories.find(c => c.id === row.category)?.name || '',
        amount: row.amount,
        notes: row.notes || '',
      }));
  else if (definition.source === 'categories')
    data = state.categories
      .filter(
        row =>
          !definition.categoryIds?.length ||
          definition.categoryIds.includes(row.id),
      )
      .map(row => ({
        name: row.name,
        amount: state.transactions
          .filter(
            transaction =>
              !transaction.is_parent &&
              transaction.category === row.id &&
              transaction.date >= period.startDate &&
              transaction.date <= period.endDate,
          )
          .reduce((sum, row) => sum + row.amount, 0),
      }));
  else if (definition.source === 'assets')
    data = assets().map(row => ({
      name: row.name,
      amount: row.value,
      date: row.effectiveDate,
    }));
  else if (definition.source === 'obligations')
    data = obligations().map(row => ({
      name: row.counterparty,
      amount: row.outstanding,
      date: row.dueDate,
    }));
  else
    data = selectedAccounts.map(row => ({
      name: row.name,
      amount: balances[row.id] || 0,
    }));
  const keys = [...new Set(data.flatMap(row => Object.keys(row)))];
  if (!keys.length) keys.push('name', 'amount');
  const columns = keys.map(key =>
    column(
      key,
      key,
      ['amount', 'value', 'balance'].includes(key)
        ? 'money'
        : key === 'date'
          ? 'date'
          : 'text',
    ),
  );
  return {
    ...base,
    columns,
    rows: data,
    ...(definition.type === 'chart'
      ? {
          chart: {
            kind: definition.chartType || 'bar',
            xKey: definition.xKey || keys[0],
            valueKeys: definition.valueKeys?.length
              ? definition.valueKeys
              : ['amount'],
          },
        }
      : {}),
  };
}

export async function runReport({
  templateId,
  asOf,
  startDate,
  endDate,
  requestId,
}: {
  templateId: string;
  asOf: string;
  startDate?: string;
  endDate?: string;
  requestId?: string;
}) {
  const id = requestId ? `report-run:${requestId}` : uuidv4();
  const previous = await readRecord(id);
  if (previous) return previous;
  const state = await getState();
  const record = state.records.find(
    item => item.kind === 'report-template' && item.id === templateId,
  );
  if (!record) throw new Error('Report template not found');
  const template = validateReportTemplate(record.data);
  const projection = await projectCfmLiquidity({
    startDate: asOf,
    endDate: format(addYears(parseISO(asOf), 1), 'yyyy-MM-dd'),
  });
  const run = createReportRun({
    id,
    templateId,
    template,
    asOf,
    startDate,
    endDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currency: state.currency,
    createdAt: new Date().toISOString(),
    sourceUpdatedAt: state.records
      .map(row => row.updatedAt)
      .sort()
      .at(-1),
    warnings: projection.warnings,
    assumptions: [
      'Ledger amounts are signed integer minor units.',
      'Projected receipts and payments are scenarios; they do not post transactions.',
    ],
    resolveSection: (section, period) =>
      materialize(section, period, state, projection),
  });
  const result: CfmRecord = {
    id,
    kind: 'report-run',
    updatedAt: run.createdAt,
    data: { ...run },
  };
  await writeRecord(result);
  return { ...result, documents: getReportDocuments(run) };
}
