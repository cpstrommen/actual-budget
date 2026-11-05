import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { getAssetSourceAverage } from '@actual-app/core/shared/cfm';
import type {
  CfmAsset,
  CfmAssetSourceUpdate,
  CfmAssetValuationSource,
  CfmRecord,
} from '@actual-app/core/types/models/cfm';

import { Link } from '#components/common/Link';

import {
  Action,
  Cell,
  Choice,
  DataTable,
  Field,
  fieldStyle,
  gridStyle,
  Money,
  newId,
  Panel,
  parseMoney,
} from './ui';

type Props = {
  assets: CfmRecord<CfmAsset>[];
  asOf: string;
  busy: boolean;
  onError: (error: unknown) => void;
  update: (input: CfmAssetSourceUpdate) => Promise<boolean>;
};

export function CfmAssetSources({
  assets,
  asOf,
  busy,
  onError,
  update,
}: Props) {
  const { t } = useTranslation();
  const [assetId, setAssetId] = useState('');
  const [editing, setEditing] = useState<{
    id: string;
    revision: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(asOf);
  const [requestId, setRequestId] = useState(newId);
  const [sourceId, setSourceId] = useState(newId);
  const eligible = assets.filter(
    asset => asset.data.policy.method === 'source-average',
  );
  const asset = eligible.find(item => item.id === assetId) ?? eligible[0];
  const average = asset ? getAssetSourceAverage(asset.data, asOf) : null;
  function clear() {
    setEditing(null);
    setName('');
    setUrl('');
    setValue('');
    setDate(asOf);
    setRequestId(newId());
    setSourceId(newId());
  }
  function edit(source: CfmAssetValuationSource) {
    if (!asset) return;
    setEditing({ id: source.id, revision: asset.updatedAt });
    setName(source.name);
    setUrl(source.url ?? '');
    setValue('');
    setDate(asOf);
    setSourceId(source.id);
    setRequestId(newId());
  }
  async function submit() {
    if (!asset) return;
    try {
      if (
        await update({
          assetId: asset.id,
          sourceId,
          name,
          url,
          date,
          ...(value.trim() ? { value: parseMoney(value) } : {}),
          requestId,
          expectedUpdatedAt: editing?.revision ?? asset.updatedAt,
        })
      ) {
        clear();
      }
    } catch (error) {
      onError(error);
    }
  }
  return (
    <Panel title={t('Property and asset valuation sources')}>
      <p>
        <Trans>
          Use an average-of-sources asset policy for a home or another asset.
          Add any sources you trust, such as a tax assessment, Zillow, Redfin,
          or an appraisal. Links open the source so you can copy its current
          estimate here; CFM does not retrieve values automatically.
        </Trans>
      </p>
      {!asset ? (
        <p>
          <Trans>
            Save an asset with the Average of valuation sources policy below to
            add its sources.
          </Trans>
        </p>
      ) : (
        <>
          <Choice
            label={t('Asset for valuation sources')}
            value={asset.id}
            onChange={id => {
              setAssetId(id);
              clear();
            }}
            options={eligible.map(item => [item.id, item.data.name])}
          />
          <p>
            <Trans>Average at selected date:</Trans>{' '}
            <strong>
              {average?.value === null ? (
                t('No active source estimates')
              ) : (
                <Money amount={average?.value ?? 0} />
              )}
            </strong>{' '}
            (
            {t('Sources included: {{count}}', {
              count: average?.inputs.length ?? 0,
            })}
            )
          </p>
          <p style={{ color: theme.pageTextLight }}>
            <Trans>
              Each source contributes its latest dated estimate once, with equal
              weight. Sources without an estimate are excluded; zero is a valid
              estimate. Saving a new estimate recalculates the average and posts
              a dated non-cash balance adjustment. Old estimates and source
              links remain in history. If no estimates remain, the last recorded
              asset balance is retained.
            </Trans>
          </p>
          <DataTable
            headers={[
              t('Source'),
              t('Source URL'),
              t('Latest estimate'),
              t('Estimate date'),
              t('Status'),
              t('Actions'),
            ]}
          >
            {(asset.data.valuationSources ?? []).map(source => {
              const latest = [...source.readings]
                .filter(item => item.date <= asOf)
                .sort(
                  (a, b) =>
                    a.date.localeCompare(b.date) ||
                    a.recordedAt.localeCompare(b.recordedAt),
                )
                .at(-1);
              const included = average?.inputs.some(
                item => item.sourceId === source.id,
              );
              return (
                <tr key={source.id}>
                  <Cell>{source.name}</Cell>
                  <Cell>
                    {source.url ? (
                      <Link variant="external" to={source.url}>
                        {t('Open {{source}}', { source: source.name })}
                      </Link>
                    ) : (
                      t('No URL')
                    )}
                  </Cell>
                  <Cell right>
                    {latest ? <Money amount={latest.value} /> : '—'}
                  </Cell>
                  <Cell>{latest?.date ?? '—'}</Cell>
                  <Cell>
                    {source.retiredDate
                      ? t('Retired {{date}}', { date: source.retiredDate })
                      : included
                        ? t('Included')
                        : t('No estimate at selected date')}
                  </Cell>
                  <Cell>
                    {!source.retiredDate && (
                      <>
                        <Action disabled={busy} onPress={() => edit(source)}>
                          <Trans>Update source</Trans>
                        </Action>
                        <Action
                          disabled={busy}
                          onPress={() => {
                            void update({
                              assetId: asset.id,
                              sourceId: source.id,
                              name: source.name,
                              url: source.url,
                              date,
                              retire: true,
                              requestId: newId(),
                              expectedUpdatedAt: asset.updatedAt,
                            })
                              .then(success => {
                                if (success) clear();
                              })
                              .catch(onError);
                          }}
                        >
                          <Trans>Retire source</Trans>
                        </Action>
                      </>
                    )}
                  </Cell>
                </tr>
              );
            })}
          </DataTable>
          <form
            onSubmit={event => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset
              disabled={busy}
              style={{ border: 0, margin: 0, padding: 0 }}
            >
              <h3>
                {editing
                  ? t('Update valuation source')
                  : t('Add valuation source')}
              </h3>
              <div style={gridStyle}>
                <Field label={t('Valuation source name')}>
                  <input
                    style={fieldStyle}
                    value={name}
                    list="cfm-valuation-source-suggestions"
                    onChange={event => setName(event.target.value)}
                    required
                  />
                </Field>
                <datalist
                  id="cfm-valuation-source-suggestions"
                  aria-label={t('Suggested valuation source names')}
                >
                  <option value={t('Tax assessment')}>
                    <Trans>Tax assessment</Trans>
                  </option>
                  <option value={t('Zillow estimate')}>
                    <Trans>Zillow estimate</Trans>
                  </option>
                  <option value={t('Redfin estimate')}>
                    <Trans>Redfin estimate</Trans>
                  </option>
                </datalist>
                <Field
                  label={t('Valuation source URL')}
                  hint={t(
                    'Optional complete https:// or http:// link to the property valuation.',
                  )}
                >
                  <input
                    style={fieldStyle}
                    type="url"
                    value={url}
                    onChange={event => setUrl(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('Source estimate')}
                  hint={t(
                    'Optional. Leave blank to update only source details.',
                  )}
                >
                  <input
                    style={fieldStyle}
                    inputMode="decimal"
                    value={value}
                    onChange={event => setValue(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('Source update date')}
                  hint={t(
                    'Also used as the effective retirement date. Updates cannot predate later recorded valuations.',
                  )}
                >
                  <input
                    style={fieldStyle}
                    type="date"
                    value={date}
                    onChange={event => setDate(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <p style={{ display: 'flex', gap: 10 }}>
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={!name.trim()}
                >
                  <Trans>Save source</Trans>
                </Button>
                {editing && (
                  <Button onPress={clear}>
                    <Trans>Cancel source update</Trans>
                  </Button>
                )}
              </p>
            </fieldset>
          </form>
          <details>
            <summary>
              <Trans>Source estimate history</Trans>
            </summary>
            <DataTable
              headers={[
                t('Source'),
                t('Estimate date'),
                t('Estimate'),
                t('Recorded'),
                t('Source URL'),
              ]}
            >
              {(asset.data.valuationSources ?? []).flatMap(source =>
                source.readings.map(reading => (
                  <tr key={reading.id}>
                    <Cell>{reading.name}</Cell>
                    <Cell>{reading.date}</Cell>
                    <Cell right>
                      <Money amount={reading.value} />
                    </Cell>
                    <Cell>{reading.recordedAt}</Cell>
                    <Cell>
                      {reading.url ? (
                        <Link variant="external" to={reading.url}>
                          <Trans>Open recorded source</Trans>
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Cell>
                  </tr>
                )),
              )}
            </DataTable>
          </details>
        </>
      )}
    </Panel>
  );
}
