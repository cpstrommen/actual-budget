import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  defaultAutomationConfig,
  validateAutomationConfig,
} from '@actual-app/core/shared/cfm-automation';
import type {
  CfmAutomationConfig,
  CfmAutomationJobState,
} from '@actual-app/core/shared/cfm-automation';
import type { CfmRecord, CfmState } from '@actual-app/core/types/models/cfm';

import {
  Cell,
  Choice,
  DataTable,
  Field,
  Panel,
  fieldStyle,
  gridStyle,
} from './ui';
import type { SaveRecord } from './ui';

type Props = {
  state: CfmState;
  save: SaveRecord;
  busy: boolean;
  onError: (error: unknown) => void;
  run: () => Promise<boolean>;
};
function isJob(record: CfmRecord): record is CfmRecord<CfmAutomationJobState> {
  return (
    record.kind === 'audit' &&
    typeof record.data.jobId === 'string' &&
    typeof record.data.status === 'string' &&
    typeof record.data.nextAttemptAt === 'string'
  );
}
export function CfmAutomation({ state, save, busy, onError, run }: Props) {
  const { t } = useTranslation();
  const existing = state.records.find(record => record.kind === 'automation');
  const [config, setConfig] = useState<CfmAutomationConfig>(() => {
    try {
      return existing
        ? validateAutomationConfig(existing.data)
        : {
            ...defaultAutomationConfig(
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
            schedulerId: state.deviceId,
          };
    } catch {
      return { ...defaultAutomationConfig(), schedulerId: state.deviceId };
    }
  });
  const [ownDevice, setOwnDevice] = useState(
    config.schedulerId === state.deviceId,
  );
  const jobs = state.records.filter(isJob);
  const connections = state.accounts.filter(
    account => account.account_sync_source && !account.closed,
  );
  function patch(change: Partial<CfmAutomationConfig>) {
    setConfig(current => ({ ...current, ...change }));
  }
  async function submit() {
    try {
      await save(
        'automation',
        validateAutomationConfig({
          ...config,
          schedulerId: ownDevice ? state.deviceId : config.schedulerId,
        }),
        existing?.id ?? 'automation-settings',
      );
    } catch (error) {
      onError(error);
    }
  }
  return (
    <>
      <Panel title={t('Automatic bank sync and financial jobs')}>
        <p>
          <Trans>
            One selected device or worker runs jobs for this budget. Application
            mode requires the app to remain running and unlocked; a closed or
            suspended browser cannot run background jobs.
          </Trans>
        </p>
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
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={event => patch({ enabled: event.target.checked })}
                />{' '}
                <Trans>Enable scheduled work</Trans>
              </label>
            </p>
            <div style={gridStyle}>
              <Choice
                label={t('Execution mode')}
                value={config.mode}
                onChange={value => {
                  if (value === 'application' || value === 'headless')
                    patch({ mode: value });
                }}
                options={[
                  ['application', t('Running application')],
                  ['headless', t('Separately configured headless worker')],
                ]}
              />
              <Field label={t('Budget timezone')}>
                <input
                  style={fieldStyle}
                  value={config.timeZone}
                  onChange={event => patch({ timeZone: event.target.value })}
                  required
                />
              </Field>
              <Field
                label={t('Bank refresh interval (minutes)')}
                hint={t(
                  'Provider-specific minimums and rate limits still apply.',
                )}
              >
                <input
                  style={fieldStyle}
                  type="number"
                  min={15}
                  max={10080}
                  value={config.bankSyncIntervalMinutes}
                  onChange={event =>
                    patch({
                      bankSyncIntervalMinutes: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <Field label={t('Scheduler device / worker ID')}>
                <input
                  style={fieldStyle}
                  value={ownDevice ? state.deviceId : config.schedulerId}
                  disabled={ownDevice}
                  onChange={event => patch({ schedulerId: event.target.value })}
                  required={config.enabled}
                />
              </Field>
            </div>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={ownDevice}
                  onChange={event => setOwnDevice(event.target.checked)}
                />{' '}
                <Trans>Use this device as the selected scheduler</Trans>
              </label>
            </p>
            <Field
              label={t('Bank connections to refresh')}
              hint={t(
                'Select linked accounts/connections. No selection makes no bank calls.',
              )}
            >
              <select
                multiple
                style={{ ...fieldStyle, minHeight: 95 }}
                value={config.bankConnectionIds}
                onChange={event =>
                  patch({
                    bankConnectionIds: Array.from(
                      event.target.selectedOptions,
                      option => option.value,
                    ),
                  })
                }
              >
                {connections.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.account_sync_source}
                  </option>
                ))}
              </select>
            </Field>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={config.postAssetValuations}
                  onChange={event =>
                    patch({ postAssetValuations: event.target.checked })
                  }
                />{' '}
                <Trans>Post scheduled realized asset valuations</Trans>
              </label>
            </p>
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={config.generateReports}
                  onChange={event =>
                    patch({ generateReports: event.target.checked })
                  }
                />{' '}
                <Trans>
                  Generate report packages using each template's cadence
                </Trans>
              </label>
            </p>
            {config.mode === 'headless' && (
              <p>
                <Trans>
                  Headless execution must be launched separately with access to
                  this budget and its encryption credentials. Merely selecting
                  this mode does not upload keys or start a server-side reader.
                </Trans>
              </p>
            )}
            <p style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary">
                <Trans>Save automation settings</Trans>
              </Button>
              <Button
                onPress={() => {
                  void run();
                }}
              >
                <Trans>Check and run due jobs now</Trans>
              </Button>
            </p>
          </fieldset>
        </form>
      </Panel>
      <Panel title={t('Job history and next attempts')}>
        <DataTable
          headers={[
            t('Job'),
            t('Status'),
            t('Last attempt'),
            t('Last success'),
            t('Next attempt'),
            t('Error / action'),
          ]}
        >
          {jobs.map(record => (
            <tr key={record.id}>
              <Cell>{record.data.jobId}</Cell>
              <Cell>{t(record.data.status)}</Cell>
              <Cell>{record.data.lastAttemptAt}</Cell>
              <Cell>{record.data.lastSuccessAt ?? t('No successful run')}</Cell>
              <Cell>{record.data.nextAttemptAt}</Cell>
              <Cell>
                {record.data.error}
                {record.data.needsReauthorization && (
                  <p>
                    <Trans>
                      Reconnect this bank connection before retrying.
                    </Trans>
                  </p>
                )}
              </Cell>
            </tr>
          ))}
        </DataTable>
        <p>
          <Trans>
            Retries use backoff and stable occurrence identifiers. Opening
            another client does not make it a second scheduler. Use Refresh to
            load the latest job status.
          </Trans>
        </p>
      </Panel>
    </>
  );
}
