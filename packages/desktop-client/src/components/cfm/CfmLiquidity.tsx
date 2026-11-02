import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import type {
  CfmLiquidityProjection,
  CfmState,
} from '@actual-app/core/types/models/cfm';

import {
  Cell,
  Choice,
  DataTable,
  Field,
  fieldStyle,
  gridStyle,
  Metric,
  Money,
  Panel,
  parseMoney,
} from './ui';

export type ProjectionInput = {
  startDate: string;
  endDate: string;
  includeReceivables?: boolean;
  receivableDelayDays?: number;
  minimumCash?: number;
  planAccountId?: string;
};
type Props = {
  state: CfmState;
  asOf: string;
  busy: boolean;
  onError: (error: unknown) => void;
  project: (input: ProjectionInput) => Promise<CfmLiquidityProjection | null>;
};
export function CfmLiquidity({ state, asOf, busy, onError, project }: Props) {
  const { t } = useTranslation();
  const [horizon, setHorizon] = useState('90');
  const [endDate, setEndDate] = useState('');
  const [includeReceivables, setIncludeReceivables] = useState(false);
  const [delay, setDelay] = useState('0');
  const [minimum, setMinimum] = useState('0');
  const [planAccount, setPlanAccount] = useState('');
  const [monthly, setMonthly] = useState(true);
  const [projection, setProjection] = useState<CfmLiquidityProjection | null>(
    null,
  );
  async function calculate() {
    try {
      const date = new Date(`${asOf}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + Number(horizon));
      setProjection(
        await project({
          startDate: asOf,
          endDate: endDate || date.toISOString().slice(0, 10),
          includeReceivables,
          receivableDelayDays: Number(delay),
          minimumCash: parseMoney(minimum),
          ...(planAccount ? { planAccountId: planAccount } : {}),
        }),
      );
    } catch (error) {
      onError(error);
    }
  }
  const points = projection?.daily ?? [];
  const values = points.map(point => point.closing);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const y = (amount: number) => 160 - (140 * (amount - min)) / (max - min);
  return (
    <>
      <Panel title={t('Liquidity scenario')}>
        <p>
          <Trans>
            Project eligible cash using posted transactions, scheduled events,
            card payments, open obligations, and remaining annual-plan
            estimates. Transfers and matched occurrences are counted once.
            Valuation gains and unused credit limits are not cash.
          </Trans>
        </p>
        <form
          onSubmit={event => {
            event.preventDefault();
            void calculate();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Horizon')}
                value={horizon}
                onChange={setHorizon}
                options={[
                  ['30', t('30 days')],
                  ['60', t('60 days')],
                  ['90', t('90 days')],
                  ['365', t('12 months')],
                ]}
              />
              <Field label={t('Custom end date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  min={asOf}
                  value={endDate}
                  onChange={event => setEndDate(event.target.value)}
                />
              </Field>
              <Field label={t('Minimum cash reserve')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={minimum}
                  onChange={event => setMinimum(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Delay receivable collections (days)')}>
                <input
                  style={fieldStyle}
                  type="number"
                  min={0}
                  max={3650}
                  value={delay}
                  onChange={event => setDelay(event.target.value)}
                />
              </Field>
              <Choice
                label={t('Account for annual-plan residual estimates')}
                value={planAccount}
                onChange={setPlanAccount}
                options={[
                  ['', t('Exclude unassigned plan estimates')],
                  ...state.accounts
                    .filter(account => !account.closed)
                    .map(
                      account =>
                        [account.id, account.name] satisfies [string, string],
                    ),
                ]}
              />
            </div>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={includeReceivables}
                  onChange={event =>
                    setIncludeReceivables(event.target.checked)
                  }
                />{' '}
                <Trans>Include dated expected receivable collections</Trans>
              </label>
            </p>
            <Button type="submit" variant="primary">
              <Trans>Calculate projection</Trans>
            </Button>
          </fieldset>
        </form>
        <p>
          <Trans>
            Choose cash eligibility and restrictions in Balances → Accounts and
            balances. Undated obligations remain visible and do not receive
            invented due dates.
          </Trans>
        </p>
      </Panel>
      {projection && (
        <>
          <div style={{ ...gridStyle, marginBottom: 18 }}>
            <Metric
              label={t('Opening liquidity')}
              amount={projection.openingLiquidity}
            />
            <Metric
              label={t('Current short-term liabilities')}
              amount={projection.currentLiabilities}
            />
            <Metric
              label={t('Cash after covering current liabilities')}
              amount={projection.cashAfterCoverage}
            />
            <Metric
              label={t('Coverage ratio')}
              text={
                projection.coverageRatio === null
                  ? t('No current liabilities')
                  : projection.coverageRatio.toFixed(2)
              }
            />
            <Metric
              label={t('Minimum projected cash')}
              amount={projection.minimumLiquidity}
            />
            <Metric
              label={t('Minimum cash date')}
              text={projection.minimumDate}
            />
          </div>
          <Panel title={t('Projected available cash')}>
            <p>
              {projection.startDate} – {projection.endDate} · {state.currency}
            </p>
            {projection.warnings.map(warning => (
              <p key={warning} role="note">
                {t(warning)}
              </p>
            ))}
            <svg
              role="img"
              aria-label={t('Projected cash balance over the selected period')}
              viewBox="0 0 1000 185"
              style={{ width: '100%', height: 185 }}
            >
              <line
                x1={5}
                x2={995}
                y1={y(0)}
                y2={y(0)}
                stroke={theme.tableBorder}
                strokeDasharray="5 4"
              />
              <polyline
                points={points
                  .map(
                    (point, index) =>
                      `${5 + (990 * index) / Math.max(1, points.length - 1)},${y(point.closing)}`,
                  )
                  .join(' ')}
                fill="none"
                stroke={theme.pageText}
                strokeWidth={3}
              />
              {points
                .filter(
                  (_, index) =>
                    index === 0 ||
                    index === points.length - 1 ||
                    index % Math.max(1, Math.floor(points.length / 8)) === 0,
                )
                .map(point => {
                  const index = points.indexOf(point);
                  return (
                    <circle
                      key={point.date}
                      cx={5 + (990 * index) / Math.max(1, points.length - 1)}
                      cy={y(point.closing)}
                      r={3}
                      fill={
                        point.closing < 0
                          ? theme.numberNegative
                          : theme.pageText
                      }
                    >
                      <title>{`${point.date}: ${point.closing / 100} ${state.currency}`}</title>
                    </circle>
                  );
                })}
            </svg>
            {projection.shortfallDates.length > 0 && (
              <p role="alert">
                <Trans>
                  Projected cash falls below the selected reserve on{' '}
                  {{ count: projection.shortfallDates.length }} dates.
                </Trans>
              </p>
            )}
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={monthly}
                  onChange={event => setMonthly(event.target.checked)}
                />{' '}
                <Trans>Group by month</Trans>
              </label>
            </p>
            <DataTable
              headers={[
                t('Period'),
                t('Opening'),
                t('Inflows'),
                t('Outflows'),
                t('Closing'),
                t('Included events'),
              ]}
            >
              {(monthly ? projection.monthly : projection.daily).map(point => (
                <tr key={point.date}>
                  <Cell>{point.date}</Cell>
                  <Cell right>
                    <Money amount={point.opening} />
                  </Cell>
                  <Cell right>
                    <Money amount={point.inflows} />
                  </Cell>
                  <Cell right>
                    <Money amount={point.outflows} />
                  </Cell>
                  <Cell right>
                    <Money amount={point.closing} />
                  </Cell>
                  <Cell>
                    <details>
                      <summary>
                        {t('{{count}} events', { count: point.events.length })}
                      </summary>
                      {point.events.map(event => (
                        <div key={event.id}>
                          {event.date} · {event.description ?? t(event.source)}{' '}
                          · <Money amount={event.amount} />
                        </div>
                      ))}
                    </details>
                  </Cell>
                </tr>
              ))}
            </DataTable>
            {projection.excludedAccounts.length > 0 && (
              <p>
                {t('Excluded accounts: {{accounts}}', {
                  accounts: projection.excludedAccounts
                    .map(
                      id =>
                        state.accounts.find(account => account.id === id)
                          ?.name ?? id,
                    )
                    .join(', '),
                })}
              </p>
            )}
            {projection.undatedObligations.length > 0 && (
              <p>
                {t(
                  '{{count}} obligations have no due date and are not assigned a cash date.',
                  { count: projection.undatedObligations.length },
                )}
              </p>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
