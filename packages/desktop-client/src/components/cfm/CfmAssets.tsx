import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { valueAsset } from '@actual-app/core/shared/cfm';
import type {
  CfmAsset,
  CfmAssetPolicy,
  CfmAssetSourceUpdate,
  CfmRecord,
  CfmState,
} from '@actual-app/core/types/models/cfm';

import { CfmAssetSources } from './CfmAssetSources';
import { isAsset } from './records';
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
  today,
} from './ui';
import type { SaveRecord } from './ui';

type Props = {
  state: CfmState;
  asOf: string;
  save: SaveRecord;
  busy: boolean;
  onError: (error: unknown) => void;
  updateSource: (input: CfmAssetSourceUpdate) => Promise<boolean>;
  valueAssetAccount: (input: {
    assetId: string;
    date: string;
    value: number;
    reason: string;
    requestId: string;
  }) => Promise<boolean>;
};
export function CfmAssets({
  state,
  asOf,
  save,
  busy,
  onError,
  valueAssetAccount,
  updateSource,
}: Props) {
  const { t } = useTranslation();
  const [restatementReason, setRestatementReason] = useState('');
  const [editing, setEditing] = useState<CfmRecord<CfmAsset> | null>(null);
  const [accountId, setAccountId] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(today());
  const [acquisitionValue, setAcquisitionValue] = useState('');
  const [method, setMethod] = useState<CfmAssetPolicy['method']>('manual');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [baseValue, setBaseValue] = useState('');
  const [residual, setResidual] = useState('0');
  const [life, setLife] = useState('60');
  const [rate, setRate] = useState('0');
  const [compound, setCompound] = useState(true);
  const [frequency, setFrequency] =
    useState<NonNullable<CfmAssetPolicy['postingFrequency']>>('monthly');
  const [schedule, setSchedule] = useState('');
  const [disposal, setDisposal] = useState('');
  const [debt, setDebt] = useState('');
  const [observationAsset, setObservationAsset] = useState('');
  const [observationDate, setObservationDate] = useState(today());
  const [observationValue, setObservationValue] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(newId);
  const assets = state.records.filter(isAsset);
  const accountOptions: Array<[string, string]> = [
    ['', t('Select manual tracking account')],
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
  function edit(record: CfmRecord<CfmAsset>) {
    setEditing(record);
    const asset = record.data;
    setAccountId(asset.accountId);
    setAcquisitionDate(asset.acquisitionDate);
    setAcquisitionValue(moneyInput(asset.acquisitionValue));
    setMethod(asset.policy.method);
    setEffectiveDate(asset.policy.effectiveDate);
    setBaseValue(moneyInput(asset.policy.baseValue ?? asset.acquisitionValue));
    setResidual(moneyInput(asset.policy.residualValue ?? 0));
    setLife(String(asset.policy.usefulLifeMonths ?? 60));
    setRate(String((asset.policy.annualRateBasisPoints ?? 0) / 100));
    setCompound(asset.policy.compound ?? true);
    setFrequency(asset.policy.postingFrequency ?? 'monthly');
    setSchedule(
      asset.policy.schedule
        ?.map(item => `${item.date}=${moneyInput(item.amount)}`)
        .join('\n') ?? '',
    );
    setDisposal(asset.disposalDate ?? '');
    setDebt(asset.linkedDebtAccountId ?? '');
  }
  async function submit() {
    try {
      const policy: CfmAssetPolicy = {
        effectiveDate,
        method,
        baseValue: baseValue
          ? parseMoney(baseValue)
          : parseMoney(acquisitionValue),
        residualValue: parseMoney(residual),
        ...(method === 'straight-line'
          ? { usefulLifeMonths: Number(life) }
          : {}),
        ...(method === 'fixed-rate'
          ? { annualRateBasisPoints: Math.round(Number(rate) * 100), compound }
          : {}),
        postingFrequency: frequency,
        ...(method === 'schedule'
          ? {
              schedule: schedule
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                  const [date, amount] = line.split('=');
                  return {
                    date: date.trim(),
                    amount: parseMoney(amount?.trim() ?? ''),
                  };
                }),
            }
          : {}),
      };
      const asset: CfmAsset = {
        accountId,
        name:
          state.accounts.find(account => account.id === accountId)?.name ?? '',
        currency: state.currency,
        acquisitionDate,
        acquisitionValue: parseMoney(acquisitionValue),
        policy,
        ...(restatementReason.trim()
          ? { policyRestatementReason: restatementReason.trim() }
          : {}),
        ...(editing
          ? {
              policyHistory: [
                ...(editing.data.policyHistory ?? []),
                editing.data.policy,
              ],
              observations: editing.data.observations ?? [],
              valuationSources: editing.data.valuationSources,
            }
          : {}),
        ...(disposal ? { disposalDate: disposal } : {}),
        ...(debt ? { linkedDebtAccountId: debt } : {}),
      };
      if (await save('asset', asset, editing?.id, editing?.updatedAt)) {
        setEditing(null);
        setRestatementReason('');
        setAccountId('');
        setAcquisitionValue('');
        setBaseValue('');
      }
    } catch (error) {
      onError(error);
    }
  }
  async function observe() {
    try {
      if (
        await valueAssetAccount({
          assetId: observationAsset,
          date: observationDate,
          value: parseMoney(observationValue),
          reason,
          requestId,
        })
      ) {
        setObservationValue('');
        setReason('');
        setRequestId(newId());
      }
    } catch (error) {
      onError(error);
    }
  }
  return (
    <>
      <Panel title={t('Assets and valuations')}>
        <p>
          <Trans>
            Observed values, modeled values, and posted ledger balances remain
            distinct. Recording a realized value posts a dated non-cash
            adjustment, preserving history for an upstream export.
          </Trans>
        </p>
        <DataTable
          headers={[
            t('Asset'),
            t('Value at selected date'),
            t('Source'),
            t('Method'),
            t('Effective date'),
            t('Actions'),
          ]}
        >
          {assets.map(record => {
            const valuation = valueAsset(record.data, asOf);
            return (
              <tr key={record.id}>
                <Cell>
                  {record.data.name}
                  {record.data.disposalDate && (
                    <div>
                      {t('Disposed {{date}}', {
                        date: record.data.disposalDate,
                      })}
                    </div>
                  )}
                </Cell>
                <Cell right>
                  <Money amount={valuation.value} />
                </Cell>
                <Cell>{t(valuation.source)}</Cell>
                <Cell>
                  {valuation.method === 'source-average'
                    ? t('Average of valuation sources')
                    : t(valuation.method)}
                </Cell>
                <Cell>{valuation.effectiveDate}</Cell>
                <Cell>
                  <Action onPress={() => edit(record)}>
                    <Trans>Edit policy</Trans>
                  </Action>
                </Cell>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
      <CfmAssetSources
        assets={assets}
        asOf={asOf}
        busy={busy}
        onError={onError}
        update={updateSource}
      />
      <Panel title={editing ? t('Revise asset policy') : t('Add asset policy')}>
        <p>
          <Trans>
            Select an existing manual off-budget account. Use Add account in the
            sidebar first if the asset has no ledger account.
          </Trans>
        </p>
        {editing && (
          <Field
            label={t('Historical model restatement reason')}
            hint={t(
              'Leave blank for a future policy revision. A reason explicitly allows changing a past modeled policy; posted ledger history remains unchanged until a separate dated adjustment.',
            )}
          >
            <input
              style={fieldStyle}
              value={restatementReason}
              onChange={event => setRestatementReason(event.target.value)}
            />
          </Field>
        )}
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
                label={t('Asset account')}
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                required
              />
              <Field label={t('Acquisition date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={acquisitionDate}
                  onChange={event => setAcquisitionDate(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Acquisition value')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={acquisitionValue}
                  onChange={event => setAcquisitionValue(event.target.value)}
                  required
                />
              </Field>
              <Choice
                label={t('Valuation method')}
                value={method}
                onChange={value => {
                  if (
                    value === 'manual' ||
                    value === 'straight-line' ||
                    value === 'fixed-rate' ||
                    value === 'schedule' ||
                    value === 'source-average'
                  ) {
                    setMethod(value);
                  }
                }}
                options={[
                  ['manual', t('Manual observations')],
                  ['source-average', t('Average of valuation sources')],
                  [
                    'straight-line',
                    t('Straight-line depreciation / amortization'),
                  ],
                  ['fixed-rate', t('Fixed annual percentage')],
                  ['schedule', t('Explicit valuation schedule')],
                ]}
              />
              <Field label={t('Policy effective date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={effectiveDate}
                  onChange={event => setEffectiveDate(event.target.value)}
                  required
                />
              </Field>
              {method !== 'source-average' && (
                <>
                  <Field label={t('Policy starting value')}>
                    <input
                      style={fieldStyle}
                      inputMode="decimal"
                      value={baseValue}
                      onChange={event => setBaseValue(event.target.value)}
                      placeholder={acquisitionValue}
                    />
                  </Field>
                  <Field label={t('Residual value')}>
                    <input
                      style={fieldStyle}
                      inputMode="decimal"
                      value={residual}
                      onChange={event => setResidual(event.target.value)}
                      required
                    />
                  </Field>
                </>
              )}
              {method === 'straight-line' && (
                <Field label={t('Useful life in months')}>
                  <input
                    style={fieldStyle}
                    type="number"
                    min={1}
                    value={life}
                    onChange={event => setLife(event.target.value)}
                    required
                  />
                </Field>
              )}
              {method === 'fixed-rate' && (
                <>
                  <Field
                    label={t('Annual change (%)')}
                    hint={t(
                      'Negative depreciates or amortizes; positive appreciates.',
                    )}
                  >
                    <input
                      style={fieldStyle}
                      type="number"
                      step="0.01"
                      value={rate}
                      onChange={event => setRate(event.target.value)}
                      required
                    />
                  </Field>
                  <label>
                    <input
                      type="checkbox"
                      checked={compound}
                      onChange={event => setCompound(event.target.checked)}
                    />{' '}
                    <Trans>Compound the annual rate</Trans>
                  </label>
                </>
              )}
              {method !== 'source-average' && (
                <Choice
                  label={t('Valuation posting frequency')}
                  value={frequency}
                  onChange={value => {
                    if (
                      value === 'daily' ||
                      value === 'monthly' ||
                      value === 'quarterly' ||
                      value === 'annually'
                    ) {
                      setFrequency(value);
                    }
                  }}
                  options={[
                    ['daily', t('Daily')],
                    ['monthly', t('Monthly')],
                    ['quarterly', t('Quarterly')],
                    ['annually', t('Annually')],
                  ]}
                />
              )}
              <Field
                label={t('Disposal date')}
                hint={t(
                  'Optional; stops future valuation events. Record actual sale proceeds in the ledger separately.',
                )}
              >
                <input
                  style={fieldStyle}
                  type="date"
                  value={disposal}
                  onChange={event => setDisposal(event.target.value)}
                />
              </Field>
              <Choice
                label={t('Linked debt account')}
                value={debt}
                onChange={setDebt}
                options={[
                  ['', t('No linked debt')],
                  ...state.accounts.map(
                    account =>
                      [account.id, account.name] satisfies [string, string],
                  ),
                ]}
              />
            </div>
            {method === 'schedule' && (
              <Field
                label={t('Dated values')}
                hint={t('One YYYY-MM-DD=value per line.')}
              >
                <textarea
                  style={fieldStyle}
                  value={schedule}
                  onChange={event => setSchedule(event.target.value)}
                  rows={4}
                  required
                />
              </Field>
            )}
            <p style={{ display: 'flex', gap: 10 }}>
              <Button
                type="submit"
                variant="primary"
                isDisabled={!accountId || !acquisitionValue}
              >
                {editing ? t('Save policy revision') : t('Save asset')}
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
      <Panel title={t('Record observed value')}>
        <form
          onSubmit={event => {
            event.preventDefault();
            void observe();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Choice
                label={t('Asset')}
                value={observationAsset}
                onChange={setObservationAsset}
                options={[
                  ['', t('Select asset')],
                  ...assets
                    .filter(
                      record =>
                        record.data.policy.method !== 'source-average' ||
                        Boolean(
                          record.data.disposalDate &&
                          record.data.disposalDate <= observationDate,
                        ),
                    )
                    .map(
                      record =>
                        [record.id, record.data.name] satisfies [
                          string,
                          string,
                        ],
                    ),
                ]}
                required
              />
              <Field label={t('Observation date')}>
                <input
                  style={fieldStyle}
                  type="date"
                  value={observationDate}
                  onChange={event => setObservationDate(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Observed value')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={observationValue}
                  onChange={event => setObservationValue(event.target.value)}
                  required
                />
              </Field>
              <Field label={t('Source / reason')}>
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
                isDisabled={!observationAsset || !observationValue}
              >
                <Trans>Record value and ledger adjustment</Trans>
              </Button>
            </p>
          </fieldset>
        </form>
        {assets.flatMap(record =>
          (record.data.observations ?? []).map(observation => (
            <p key={observation.id}>
              {record.data.name} · {observation.date} ·{' '}
              <Money amount={observation.value} /> · {observation.source}
            </p>
          )),
        )}
      </Panel>
    </>
  );
}
