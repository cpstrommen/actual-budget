import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { getObligationStatus } from '@actual-app/core/shared/cfm';
import type {
  CfmObligation,
  CfmState,
} from '@actual-app/core/types/models/cfm';

import { isObligation, isSettlement } from './records';
import {
  Action,
  Cell,
  Choice,
  DataTable,
  Field,
  Money,
  Panel,
  fieldStyle,
  gridStyle,
  newId,
  parseMoney,
  today,
} from './ui';
import type { SaveRecord } from './ui';

export type SettlementInput = {
  obligationId: string;
  amount: number;
  date: string;
  accountId: string;
  transactionId?: string;
  kind: 'payment' | 'writeoff' | 'reversal';
  notes?: string;
  requestId: string;
  reversesId?: string;
};
type Props = {
  state: CfmState;
  asOf: string;
  save: SaveRecord;
  settle: (input: SettlementInput) => Promise<boolean>;
  busy: boolean;
  onError: (error: unknown) => void;
};
export function CfmObligations({
  state,
  asOf,
  save,
  settle,
  busy,
  onError,
}: Props) {
  const { t } = useTranslation();
  const obligations = state.records.filter(isObligation);
  const settlements = state.records.filter(isSettlement);
  const [direction, setDirection] = useState<'receivable' | 'payable'>(
    'receivable',
  );
  const [counterparty, setCounterparty] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [disputed, setDisputed] = useState(false);
  const [selected, setSelected] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentAccount, setPaymentAccount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [kind, setKind] = useState<'payment' | 'writeoff' | 'reversal'>(
    'payment',
  );
  const [paymentNotes, setPaymentNotes] = useState('');
  const [reversesId, setReversesId] = useState('');
  const [requestId, setRequestId] = useState(newId);
  const controlAccounts: Array<[string, string]> = [
    ['', t('Select manual control account')],
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
  async function create() {
    try {
      const data: CfmObligation = {
        accountId,
        direction,
        counterparty: counterparty.trim(),
        amount: parseMoney(amount),
        currency: state.currency,
        date,
        ...(dueDate
          ? {
              dueDate,
              expectedDate: direction === 'receivable' ? dueDate : undefined,
            }
          : {}),
        ...(source ? { sourceTransactionId: source } : {}),
        ...(categoryId ? { categoryId } : {}),
        notes,
        disputed,
      };
      if (await save('obligation', data)) {
        setCounterparty('');
        setAmount('');
        setNotes('');
        setSource('');
      }
    } catch (error) {
      onError(error);
    }
  }
  async function recordPayment() {
    try {
      if (
        await settle({
          obligationId: selected,
          amount: parseMoney(paymentAmount),
          date: paymentDate,
          accountId: paymentAccount,
          kind,
          ...(transactionId ? { transactionId } : {}),
          ...(reversesId ? { reversesId } : {}),
          notes: paymentNotes,
          requestId,
        })
      ) {
        setPaymentAmount('');
        setTransactionId('');
        setPaymentNotes('');
        setRequestId(newId());
      }
    } catch (error) {
      onError(error);
    }
  }
  return (
    <>
      <Panel title={t('Accounts receivable and payable')}>
        <p>
          <Trans>
            Track each amount owed separately. Settlements clear the obligation
            without recognizing income or expense twice; write-offs do not move
            cash.
          </Trans>
        </p>
        <DataTable
          headers={[
            t('Counterparty'),
            t('Direction'),
            t('Original amount'),
            t('Outstanding'),
            t('Due / expected'),
            t('Status'),
            t('Actions'),
          ]}
        >
          {obligations.map(record => {
            const status = getObligationStatus(
              record.data,
              settlements,
              asOf,
              record.id,
            );
            return (
              <tr key={record.id}>
                <Cell>
                  {record.data.counterparty}
                  {record.data.notes && <div>{record.data.notes}</div>}
                </Cell>
                <Cell>
                  {record.data.direction === 'receivable'
                    ? t('Owed to me')
                    : t('Owed by me')}
                </Cell>
                <Cell right>
                  <Money amount={record.data.amount} />
                </Cell>
                <Cell right>
                  <Money amount={status.outstanding} />
                </Cell>
                <Cell>
                  {record.data.dueDate ??
                    record.data.expectedDate ??
                    t('Undated')}
                </Cell>
                <Cell>{t(status.status)}</Cell>
                <Cell>
                  <Action
                    disabled={busy}
                    onPress={() => {
                      setSelected(record.id);
                      setPaymentAmount(String(status.outstanding / 100));
                      setKind('payment');
                    }}
                  >
                    {t('Settle / write off')}
                  </Action>
                  <Action
                    disabled={busy}
                    onPress={() => {
                      void save(
                        'obligation',
                        { ...record.data, disputed: !record.data.disputed },
                        record.id,
                      );
                    }}
                  >
                    {record.data.disputed
                      ? t('Resolve dispute')
                      : t('Mark disputed')}
                  </Action>
                </Cell>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
      <Panel title={t('Create an obligation')}>
        <p>
          <Trans>
            Use a dedicated manual off-budget AR/AP account. Link a purchase
            transaction to recognize a reimbursement from that purchase,
            including a separate item for each person.
          </Trans>
        </p>
        <form
          onSubmit={event => {
            event.preventDefault();
            void create();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Direction')}
                value={direction}
                onChange={value => {
                  if (value === 'receivable' || value === 'payable')
                    setDirection(value);
                }}
                options={[
                  ['receivable', t('Owed to me (AR)')],
                  ['payable', t('Owed by me (AP)')],
                ]}
              />
              <Field label={t('Counterparty')}>
                <input
                  style={fieldStyle}
                  value={counterparty}
                  onChange={event => setCounterparty(event.target.value)}
                  required
                />
              </Field>
              <Choice
                label={t('Control account')}
                value={accountId}
                onChange={setAccountId}
                options={controlAccounts}
                required
              />
              <Field label={t('Original amount')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Effective date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Due / expected collection date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={dueDate}
                  onChange={event => setDueDate(event.target.value)}
                />
              </Field>
              <Field
                label={t('Source transaction ID')}
                hint={t(
                  'Optional; copy the ledger transaction ID to link an existing purchase.',
                )}
              >
                <input
                  style={fieldStyle}
                  value={source}
                  onChange={event => setSource(event.target.value)}
                />
              </Field>
              <Choice
                label={t('Expense / loss category')}
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  ['', t('Select if applicable')],
                  ...state.categories
                    .filter(category => !category.is_income)
                    .map(
                      category =>
                        [category.id, category.name] satisfies [string, string],
                    ),
                ]}
              />
            </div>
            <Field label={t('Notes')}>
              <input
                style={fieldStyle}
                value={notes}
                onChange={event => setNotes(event.target.value)}
              />
            </Field>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={disputed}
                  onChange={event => setDisputed(event.target.checked)}
                />{' '}
                <Trans>Disputed</Trans>
              </label>
            </p>
            <Button
              type="submit"
              variant="primary"
              isDisabled={!accountId || !counterparty || !amount}
            >
              <Trans>Create obligation</Trans>
            </Button>
          </fieldset>
        </form>
      </Panel>
      <Panel title={t('Settlement or write-off')}>
        <form
          onSubmit={event => {
            event.preventDefault();
            void recordPayment();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Obligation')}
                value={selected}
                onChange={setSelected}
                options={[
                  ['', t('Select obligation')],
                  ...obligations.map(
                    record =>
                      [
                        record.id,
                        `${record.data.counterparty} · ${record.data.direction === 'receivable' ? t('AR') : t('AP')}`,
                      ] satisfies [string, string],
                  ),
                ]}
                required
              />
              <Choice
                label={t('Action')}
                value={kind}
                onChange={value => {
                  if (
                    value === 'payment' ||
                    value === 'writeoff' ||
                    value === 'reversal'
                  )
                    setKind(value);
                }}
                options={[
                  ['payment', t('Record / match payment')],
                  ['writeoff', t('Write off without moving cash')],
                  ['reversal', t('Reverse a settlement')],
                ]}
              />
              <Field label={t('Amount')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={event => setPaymentAmount(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={paymentDate}
                  onChange={event => setPaymentDate(event.target.value)}
                  required
                />
              </Field>
              <Choice
                label={t('Payment / adjustment account')}
                value={paymentAccount}
                onChange={setPaymentAccount}
                options={[
                  ['', t('Select account')],
                  ...state.accounts
                    .filter(account => !account.closed)
                    .map(
                      account =>
                        [account.id, account.name] satisfies [string, string],
                    ),
                ]}
                required={kind === 'payment'}
              />
              {kind === 'payment' && (
                <Field
                  label={t('Existing payment transaction ID')}
                  hint={t(
                    'Optional; match an imported deposit/payment instead of creating a duplicate.',
                  )}
                >
                  <input
                    style={fieldStyle}
                    value={transactionId}
                    onChange={event => setTransactionId(event.target.value)}
                  />
                </Field>
              )}
              {kind === 'reversal' && (
                <Choice
                  label={t('Settlement to reverse')}
                  value={reversesId}
                  onChange={setReversesId}
                  options={[
                    ['', t('Select settlement')],
                    ...settlements
                      .filter(
                        record =>
                          record.data.obligationId === selected &&
                          record.data.kind !== 'reversal',
                      )
                      .map(
                        record =>
                          [
                            record.id,
                            `${record.data.date} · ${record.data.kind} · ${record.data.amount / 100}`,
                          ] satisfies [string, string],
                      ),
                  ]}
                  required
                />
              )}
            </div>
            <Field label={t('Reason / notes')}>
              <input
                style={fieldStyle}
                value={paymentNotes}
                onChange={event => setPaymentNotes(event.target.value)}
                required={kind !== 'payment'}
              />
            </Field>
            <p>
              <Button
                type="submit"
                variant="primary"
                isDisabled={!selected || !paymentAmount}
              >
                <Trans>Record settlement</Trans>
              </Button>
            </p>
          </fieldset>
        </form>
        <DataTable
          headers={[
            t('Date'),
            t('Counterparty'),
            t('Action'),
            t('Amount'),
            t('Notes'),
          ]}
        >
          {settlements.map(record => (
            <tr key={record.id}>
              <Cell>{record.data.date}</Cell>
              <Cell>
                {obligations.find(item => item.id === record.data.obligationId)
                  ?.data.counterparty ?? record.data.obligationId}
              </Cell>
              <Cell>{t(record.data.kind)}</Cell>
              <Cell right>
                <Money amount={record.data.amount} />
              </Cell>
              <Cell>{record.data.notes}</Cell>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
