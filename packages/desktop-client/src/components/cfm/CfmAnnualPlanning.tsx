import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { send } from '@actual-app/core/platform/client/connection';
import { getAnnualPlanPerformance } from '@actual-app/core/shared/cfm';
import type {
  CfmAnnualPlan,
  CfmRecord,
  CfmState,
} from '@actual-app/core/types/models/cfm';
import { addYears, format, parseISO } from 'date-fns';

import { Link } from '#components/common/Link';

import { isAnnualPlan } from './records';
import {
  Action,
  Cell,
  Choice,
  DataTable,
  Field,
  fieldStyle,
  gridStyle,
  Money,
  moneyInput,
  newId,
  Panel,
  parseMoney,
} from './ui';
import type { DeleteRecord, SaveRecord } from './ui';

type Props = {
  state: CfmState;
  asOf: string;
  save: SaveRecord;
  remove: DeleteRecord;
  busy: boolean;
  onError: (error: unknown) => void;
};
export function CfmAnnualPlanning({
  state,
  asOf,
  save,
  remove,
  busy,
  onError,
}: Props) {
  const { t } = useTranslation();
  const [year, setYear] = useState(asOf.slice(0, 4));
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'equal' | 'monthly' | 'weighted'>(
    'equal',
  );
  const [monthly, setMonthly] = useState('');
  const [dated, setDated] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState<CfmRecord<CfmAnnualPlan> | null>(null);
  const [fullMonth, setFullMonth] = useState(false);
  const plans = state.records
    .filter(isAnnualPlan)
    .filter(record => record.data.year === Number(year));
  function edit(record: CfmRecord<CfmAnnualPlan>) {
    setEditing(record);
    setYear(String(record.data.year));
    setCategoryId(record.data.categoryId);
    setAmount(moneyInput(record.data.amount));
    setMethod(record.data.allocationMethod ?? 'equal');
    setMonthly(
      record.data.allocationMethod === 'weighted'
        ? (record.data.monthlyWeights?.join(', ') ?? '')
        : (record.data.monthlyAmounts?.map(moneyInput).join(', ') ?? ''),
    );
    setDated(
      record.data.datedAmounts
        ?.map(item => `${item.date}=${moneyInput(item.amount)}`)
        .join('\n') ?? '',
    );
    setNotes(record.data.notes ?? '');
  }
  async function submit() {
    try {
      const allocation = monthly
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      const data: CfmAnnualPlan = {
        year: Number(year),
        categoryId,
        amount: parseMoney(amount),
        currency: state.currency,
        revision: (editing?.data.revision ?? 0) + 1,
        allocationMethod: method,
        notes,
        ...(method === 'monthly'
          ? { monthlyAmounts: allocation.map(parseMoney) }
          : {}),
        ...(method === 'weighted'
          ? { monthlyWeights: allocation.map(Number) }
          : {}),
        datedAmounts: dated
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [date, value] = line.split('=');
            return {
              date: date.trim(),
              amount: parseMoney(value?.trim() ?? ''),
            };
          }),
      };
      if (await save('annual-plan', data, editing?.id, editing?.updatedAt)) {
        setEditing(null);
        setAmount('');
        setMonthly('');
        setDated('');
        setNotes('');
      }
    } catch (error) {
      onError(error);
    }
  }
  return (
    <>
      <Panel title={t('Annual plan and year-to-date performance')}>
        <p>
          <Trans>
            Annual budgets use the same categories as your monthly budget.
          </Trans>{' '}
          <Link variant="internal" to="/budget">
            <Trans>Manage budget categories</Trans>
          </Link>
        </p>
        <div style={gridStyle}>
          <Field label={t('Year')}>
            <input
              style={fieldStyle}
              type="number"
              min={1900}
              max={9999}
              value={year}
              onChange={event => setYear(event.target.value)}
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={fullMonth}
              onChange={event => setFullMonth(event.target.checked)}
            />{' '}
            <Trans>Include full current-month expectation</Trans>
          </label>
        </div>
        <p>
          <Trans>
            Annual spending plans do not move money into monthly envelopes.
            Positive expense variance means over plan. Refunds reduce actual
            spending.
          </Trans>
        </p>
        <DataTable
          headers={[
            t('Category'),
            t('Annual plan'),
            t('Expected YTD'),
            t('Actual YTD'),
            t('Variance'),
            t('Annual allowance remaining'),
            t('Actions'),
          ]}
        >
          {plans.map(record => {
            const performance = getAnnualPlanPerformance(
              record.data,
              state.transactions,
              asOf,
              fullMonth ? 'full-month' : 'prorated',
            );
            return (
              <tr key={record.id}>
                <Cell>
                  {state.categories.find(
                    category => category.id === record.data.categoryId,
                  )?.name ?? record.data.categoryId}
                  <div>
                    {t('Revision {{revision}}', {
                      revision: record.data.revision,
                    })}
                  </div>
                </Cell>
                <Cell right>
                  <Money amount={performance.annualAmount} />
                </Cell>
                <Cell right>
                  <Money amount={performance.expectedYtd} />
                </Cell>
                <Cell right>
                  <Money amount={performance.actualYtd} />
                </Cell>
                <Cell right>
                  <Money amount={performance.variance} />
                </Cell>
                <Cell right>
                  <Money amount={performance.remaining} />
                </Cell>
                <Cell>
                  <Action onPress={() => edit(record)}>
                    <Trans>Edit</Trans>
                  </Action>
                  <Action
                    disabled={busy}
                    onPress={() => {
                      void save('annual-plan', {
                        ...record.data,
                        year: record.data.year + 1,
                        revision: 1,
                        datedAmounts: record.data.datedAmounts?.map(item => ({
                          ...item,
                          date: format(
                            addYears(parseISO(item.date), 1),
                            'yyyy-MM-dd',
                          ),
                        })),
                      });
                    }}
                  >
                    <Trans>Copy to next year</Trans>
                  </Action>
                  <details>
                    <summary>
                      <Trans>Monthly funding preview</Trans>
                    </summary>
                    <p>
                      {performance.monthlyAmounts.map(moneyInput).join(' · ')}
                    </p>
                    <p>
                      <Trans>
                        Applying replaces this category's twelve monthly budget
                        amounts. Annual plans remain separate until you apply
                        them.
                      </Trans>
                    </p>
                    <Action
                      disabled={busy}
                      onPress={() => {
                        void send('cfm-apply-annual-plan', {
                          id: record.id,
                          requestId: newId(),
                        }).catch(onError);
                      }}
                    >
                      <Trans>Apply all twelve amounts to monthly budgets</Trans>
                    </Action>
                  </details>
                  <Action
                    disabled={busy}
                    onPress={() => {
                      void remove(record);
                    }}
                  >
                    <Trans>Delete</Trans>
                  </Action>
                </Cell>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
      <Panel
        title={editing ? t('Revise annual plan') : t('Create annual plan')}
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Category')}
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  ['', t('Select category')],
                  ...state.categories
                    .filter(category => !category.is_income)
                    .map(
                      category =>
                        [category.id, category.name] satisfies [string, string],
                    ),
                ]}
                required
              />
              <Field label={t('Annual amount')}>
                <input
                  style={fieldStyle}
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </Field>
              <Choice
                label={t('Distribution')}
                value={method}
                onChange={value => {
                  if (
                    value === 'equal' ||
                    value === 'monthly' ||
                    value === 'weighted'
                  ) {
                    setMethod(value);
                  }
                }}
                options={[
                  ['equal', t('Equal monthly amounts')],
                  ['monthly', t('Custom monthly amounts')],
                  ['weighted', t('Monthly weights')],
                ]}
              />
            </div>
            {method !== 'equal' && (
              <Field
                label={
                  method === 'weighted'
                    ? t('Twelve monthly weights')
                    : t('Twelve monthly amounts')
                }
                hint={t(
                  'January through December, separated by commas. Monthly amounts must sum to the annual amount.',
                )}
              >
                <input
                  style={fieldStyle}
                  value={monthly}
                  onChange={event => setMonthly(event.target.value)}
                  required
                />
              </Field>
            )}
            <Field
              label={t('Dated one-off amounts')}
              hint={t(
                'Optional: one YYYY-MM-DD=amount per line. Dated amounts are included in, not added on top of, the annual total.',
              )}
            >
              <textarea
                style={fieldStyle}
                value={dated}
                onChange={event => setDated(event.target.value)}
                rows={3}
              />
            </Field>
            <Field label={t('Notes')}>
              <input
                style={fieldStyle}
                value={notes}
                onChange={event => setNotes(event.target.value)}
              />
            </Field>
            <p style={{ display: 'flex', gap: 10 }}>
              <Button
                type="submit"
                variant="primary"
                isDisabled={!categoryId || !amount}
              >
                {editing ? t('Save revision') : t('Save annual plan')}
              </Button>
              {editing && (
                <Button onPress={() => setEditing(null)}>
                  <Trans>Cancel editing</Trans>
                </Button>
              )}
            </p>
          </fieldset>
        </form>
      </Panel>
    </>
  );
}
