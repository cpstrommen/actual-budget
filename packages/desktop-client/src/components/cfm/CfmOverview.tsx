import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { buildBalanceSheet } from '@actual-app/core/shared/cfm';
import type {
  CfmAccountClassification,
  CfmAccountKind,
  CfmState,
} from '@actual-app/core/types/models/cfm';

import { isClassification } from './records';
import {
  Cell,
  Choice,
  DataTable,
  Field,
  Metric,
  Money,
  Panel,
  fieldStyle,
  gridStyle,
  newId,
  parseMoney,
  today,
} from './ui';
import type { SaveRecord } from './ui';

type Props = {
  state: CfmState;
  asOf: string;
  save: SaveRecord;
  busy: boolean;
  onError: (error: unknown) => void;
  setBalance: (input: {
    accountId: string;
    targetBalance: number;
    date: string;
    reason: string;
    requestId: string;
  }) => Promise<boolean>;
};

export function CfmOverview({
  state,
  asOf,
  save,
  busy,
  onError,
  setBalance,
}: Props) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState('');
  const [kind, setKind] = useState<CfmAccountKind>('cash');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [isLiquid, setIsLiquid] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [longTerm, setLongTerm] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentDay, setPaymentDay] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [balanceAccountId, setBalanceAccountId] = useState('');
  const [target, setTarget] = useState('');
  const [balanceDate, setBalanceDate] = useState(today());
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(newId);
  const classifications = state.records
    .filter(isClassification)
    .map(record => record.data);
  const sheet = buildBalanceSheet({
    accounts: state.accounts,
    transactions: state.transactions,
    classifications,
    asOf,
    currency: state.currency,
  });
  const options: Array<[string, string]> = [
    ['', t('Select account')],
    ...state.accounts
      .filter(account => !account.closed)
      .map(account => [account.id, account.name] satisfies [string, string]),
  ];
  const kinds: Array<[CfmAccountKind, string]> = [
    ['cash', t('Cash')],
    ['investment', t('Equity / investment')],
    ['asset', t('Other asset')],
    ['credit-card', t('Credit card')],
    ['loan', t('Loan')],
    ['receivable', t('Receivable')],
    ['payable', t('Payable')],
  ];
  const names = new Map(kinds);
  const manualAccounts: Array<[string, string]> = [
    ['', t('Select manual off-budget account')],
    ...state.accounts
      .filter(
        account =>
          account.offbudget &&
          !account.closed &&
          !account.bank &&
          !account.account_sync_source,
      )
      .map(account => [account.id, account.name] satisfies [string, string]),
  ];
  async function classify() {
    try {
      const data: CfmAccountClassification = {
        accountId,
        kind,
        effectiveDate,
        currency: state.currency,
        isLiquid,
        restricted,
        liabilityTerm: longTerm ? 'long-term' : 'current',
        ...(paymentAccountId ? { paymentAccountId } : {}),
        ...(paymentDay ? { paymentDay: Number(paymentDay) } : {}),
        ...(statementDay ? { statementDay: Number(statementDay) } : {}),
      };
      await save('classification', data);
    } catch (error) {
      onError(error);
    }
  }
  async function adjust() {
    try {
      if (
        await setBalance({
          accountId: balanceAccountId,
          targetBalance: parseMoney(target),
          date: balanceDate,
          reason,
          requestId,
        })
      ) {
        setTarget('');
        setRequestId(newId());
      }
    } catch (error) {
      onError(error);
    }
  }
  return (
    <>
      <div style={{ ...gridStyle, marginBottom: 18 }}>
        <Metric label={t('Total assets')} amount={sheet.totalAssets} />
        <Metric
          label={t('Total liabilities')}
          amount={sheet.totalLiabilities}
        />
        <Metric label={t('Net equity')} amount={sheet.netEquity} />
        <Metric label={t('Eligible liquidity')} amount={sheet.liquidity} />
      </div>
      <Panel title={t('Balance sheet')}>
        <p>
          <Trans>
            Assets, liabilities, and residual net equity at the selected date.
            Investments are distinct from available cash.
          </Trans>
        </p>
        {sheet.warnings.map(warning => (
          <p key={warning} role="note">
            {t(warning)}
          </p>
        ))}
        <DataTable
          headers={[
            t('Account'),
            t('Classification'),
            t('Section'),
            t('Signed balance'),
          ]}
        >
          {sheet.rows.map(row => (
            <tr key={row.accountId}>
              <Cell>{row.name}</Cell>
              <Cell>
                {names.get(row.kind === 'unclassified' ? 'asset' : row.kind) ??
                  t('Unclassified')}
              </Cell>
              <Cell>{t(row.group)}</Cell>
              <Cell right>
                <Money amount={row.balance} />
                {row.warnings.map(warning => (
                  <div key={warning}>{t(warning)}</div>
                ))}
              </Cell>
            </tr>
          ))}
          <tr>
            <Cell>{t('Net equity')}</Cell>
            <Cell />
            <Cell />
            <Cell right>
              <Money amount={sheet.netEquity} />
            </Cell>
          </tr>
        </DataTable>
      </Panel>
      <Panel title={t('Account classification')}>
        <p>
          <Trans>
            Classification is independent of monthly budget participation. A new
            effective date preserves earlier classifications.
          </Trans>
        </p>
        <form
          onSubmit={event => {
            event.preventDefault();
            void classify();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Account')}
                value={accountId}
                onChange={setAccountId}
                options={options}
                required
              />
              <Choice
                label={t('Classification')}
                value={kind}
                onChange={value => {
                  const selected = kinds.find(([key]) => key === value);
                  if (selected) setKind(selected[0]);
                }}
                options={kinds}
              />
              <Field label={t('Effective date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={effectiveDate}
                  onChange={event => setEffectiveDate(event.target.value)}
                  required
                />
              </Field>
              <Choice
                label={t('Payment account')}
                value={paymentAccountId}
                onChange={setPaymentAccountId}
                options={options}
              />
              <Field
                label={t('Card payment day')}
                hint={t('Optional day of month, 1–31')}
              >
                <input
                  style={fieldStyle}
                  type="number"
                  min={1}
                  max={31}
                  value={paymentDay}
                  onChange={event => setPaymentDay(event.target.value)}
                />
              </Field>
              <Field label={t('Card statement day')}>
                <input
                  style={fieldStyle}
                  type="number"
                  min={1}
                  max={31}
                  value={statementDay}
                  onChange={event => setStatementDay(event.target.value)}
                />
              </Field>
            </div>
            <p style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label>
                <input
                  type="checkbox"
                  checked={isLiquid}
                  onChange={event => setIsLiquid(event.target.checked)}
                />{' '}
                <Trans>Available liquidity</Trans>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={restricted}
                  onChange={event => setRestricted(event.target.checked)}
                />{' '}
                <Trans>Restricted funds</Trans>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={longTerm}
                  onChange={event => setLongTerm(event.target.checked)}
                />{' '}
                <Trans>Long-term liability</Trans>
              </label>
            </p>
            <Button type="submit" variant="primary" isDisabled={!accountId}>
              <Trans>Save classification</Trans>
            </Button>
          </fieldset>
        </form>
      </Panel>
      <Panel title={t('Set balance')}>
        <p>
          <Trans>
            Enter a signed target balance for a manual off-budget account. A
            dated adjustment records the difference without rewriting history or
            reconciling unrelated transactions.
          </Trans>
        </p>
        <form
          onSubmit={event => {
            event.preventDefault();
            void adjust();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Manual account')}
                value={balanceAccountId}
                onChange={setBalanceAccountId}
                options={manualAccounts}
                required
              />
              <Field label={t('Target balance')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={target}
                  onChange={event => setTarget(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Effective date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={balanceDate}
                  onChange={event => setBalanceDate(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Reason')}>
                <input
                  style={fieldStyle}
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  required
                />
              </Field>
            </div>
            <p>
              <Button
                type="submit"
                variant="primary"
                isDisabled={!balanceAccountId || !target}
              >
                <Trans>Record balance adjustment</Trans>
              </Button>
            </p>
          </fieldset>
        </form>
      </Panel>
    </>
  );
}
