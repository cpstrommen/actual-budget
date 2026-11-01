import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { send } from '@actual-app/core/platform/client/connection';
import type {
  CfmAccountKind,
  CfmRecord,
  CfmState,
} from '@actual-app/core/types/models/cfm';

import { CfmAnnualPlanning } from './CfmAnnualPlanning';
import { CfmAssets } from './CfmAssets';
import { CfmAutomation } from './CfmAutomation';
import { CfmLiquidity } from './CfmLiquidity';
import { CfmObligations } from './CfmObligations';
import { CfmOverview } from './CfmOverview';
import { CfmReports } from './CfmReports';
import {
  Choice,
  Field,
  Panel,
  fieldStyle,
  gridStyle,
  newId,
  parseMoney,
  today,
} from './ui';
import type { SaveRecord } from './ui';

type Tab =
  | 'overview'
  | 'annual'
  | 'assets'
  | 'obligations'
  | 'liquidity'
  | 'reports'
  | 'automation';
export function CfmWorkspace() {
  const { t } = useTranslation();
  const [state, setState] = useState<CfmState | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [asOf, setAsOf] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CfmAccountKind>('asset');
  const [opening, setOpening] = useState('0');
  const reportError = (value: unknown) =>
    setError(value instanceof Error ? value.message : String(value));
  async function refresh() {
    setState(await send('cfm-get-state'));
  }
  useEffect(() => {
    void refresh().catch(reportError);
  }, []);
  async function mutate(operation: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
      return true;
    } catch (value) {
      reportError(value);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const save: SaveRecord = (recordKind, data, id) =>
    mutate(async () => {
      const previous = state?.records.find(item => item.id === id);
      const record: CfmRecord = {
        id: id || newId(),
        kind: recordKind,
        data,
        updatedAt: previous?.updatedAt || new Date().toISOString(),
      };
      await send('cfm-save-record', { record });
    });
  async function exportCompatible() {
    await mutate(async () => {
      const result = await send('cfm-export-upstream', {});
      await window.Actual.saveFile(
        result.data,
        `Actual-CFM-${asOf}-for-Actual-Budget.zip`,
        t('Save upstream-compatible budget'),
      );
      await window.Actual.saveFile(
        result.archive,
        `Actual-CFM-${asOf}-audit-and-recovery.zip`,
        t('Save CFM recovery archive'),
      );
    });
  }
  const tabs: Array<[Tab, string]> = [
    ['overview', t('Financial position')],
    ['annual', t('Annual plan')],
    ['assets', t('Assets')],
    ['obligations', t('Receivables / payables')],
    ['liquidity', t('Liquidity')],
    ['reports', t('Report packages')],
    ['automation', t('Automation')],
  ];
  return (
    <main
      style={{
        height: '100%',
        overflow: 'auto',
        background: theme.pageBackground,
        color: theme.pageText,
        padding: 24,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 20,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Link to="/budget">
            <Trans>Monthly budget and ledger</Trans>
          </Link>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>
            <Trans>Actual CFM</Trans>
          </h1>
          <p>
            <Trans>Annual planning, liquidity, and financial position.</Trans>
          </p>
        </div>
        <Field label={t('As of date')}>
          <input
            style={fieldStyle}
            type="date"
            value={asOf}
            onChange={event => setAsOf(event.target.value)}
          />
        </Field>
      </header>
      <nav
        aria-label={t('Cash flow management')}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}
      >
        {tabs.map(([id, label]) => (
          <Button
            key={id}
            variant={id === tab ? 'primary' : 'normal'}
            onPress={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {error && (
        <p role="alert" style={{ color: theme.errorText }}>
          {error}
        </p>
      )}
      {!state ? (
        <p>
          <Trans>Loading financial records…</Trans>
        </p>
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <CfmOverview
                state={state}
                asOf={asOf}
                save={save}
                busy={busy}
                onError={reportError}
                setBalance={input =>
                  mutate(() => send('cfm-post-adjustment', input))
                }
              />
              <Panel title={t('Add a tracking account')}>
                <p>
                  <Trans>
                    Create asset, investment, debt, or AR/AP control accounts
                    here. Ordinary bank accounts can still be created in
                    Accounts.
                  </Trans>
                </p>
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    void mutate(async () => {
                      await send('cfm-create-account', {
                        name,
                        kind,
                        initialBalance: parseMoney(opening),
                        date: asOf,
                        currency: state.currency,
                        requestId: newId(),
                      });
                      setName('');
                      setOpening('0');
                    });
                  }}
                >
                  <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
                    <div style={gridStyle}>
                      <Field label={t('Account name')}>
                        <input
                          style={fieldStyle}
                          value={name}
                          onChange={event => setName(event.target.value)}
                          required
                        />
                      </Field>
                      <Choice
                        label={t('Account type')}
                        value={kind}
                        onChange={value => setKind(value as CfmAccountKind)}
                        options={[
                          ['cash', t('Cash')],
                          ['investment', t('Equities / investments')],
                          ['asset', t('Other asset')],
                          ['credit-card', t('Credit card')],
                          ['loan', t('Loan')],
                          ['receivable', t('Accounts receivable')],
                          ['payable', t('Accounts payable')],
                        ]}
                      />
                      <Field label={t('Opening balance')}>
                        <input
                          style={fieldStyle}
                          inputMode="decimal"
                          value={opening}
                          onChange={event => setOpening(event.target.value)}
                          required
                        />
                      </Field>
                    </div>
                    <p>
                      <Button type="submit" variant="primary">
                        <Trans>Create tracking account</Trans>
                      </Button>
                    </p>
                  </fieldset>
                </form>
              </Panel>
              <Panel title={t('Your records stay portable')}>
                <p>
                  <Trans>
                    Export a separate Actual Budget file and keep the CFM
                    audit/recovery archive. Exports are unencrypted. Check the
                    receipt before importing into a separate upstream
                    installation.
                  </Trans>
                </p>
                <Button
                  onPress={() => void exportCompatible()}
                  isDisabled={busy}
                >
                  <Trans>Export for Actual Budget</Trans>
                </Button>
              </Panel>
            </>
          )}
          {tab === 'annual' && (
            <CfmAnnualPlanning
              state={state}
              asOf={asOf}
              save={save}
              remove={record =>
                mutate(() => send('cfm-delete-record', { id: record.id }))
              }
              busy={busy}
              onError={reportError}
            />
          )}
          {tab === 'assets' && (
            <CfmAssets
              state={state}
              asOf={asOf}
              save={save}
              busy={busy}
              onError={reportError}
              valueAssetAccount={input =>
                mutate(() => send('cfm-value-asset', input))
              }
            />
          )}
          {tab === 'obligations' && (
            <CfmObligations
              state={state}
              asOf={asOf}
              save={save}
              settle={input =>
                mutate(() => send('cfm-settle-obligation', input))
              }
              busy={busy}
              onError={reportError}
            />
          )}
          {tab === 'liquidity' && (
            <CfmLiquidity
              state={state}
              asOf={asOf}
              busy={busy}
              onError={reportError}
              project={async input => {
                setBusy(true);
                try {
                  return await send('cfm-project-liquidity', input);
                } catch (value) {
                  reportError(value);
                  return null;
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {tab === 'reports' && (
            <CfmReports
              state={state}
              asOf={asOf}
              save={save}
              remove={record =>
                mutate(() => send('cfm-delete-record', { id: record.id }))
              }
              busy={busy}
              onError={reportError}
              run={input => mutate(() => send('cfm-run-report', input))}
            />
          )}
          {tab === 'automation' && (
            <CfmAutomation
              state={state}
              save={save}
              busy={busy}
              onError={reportError}
              run={() => mutate(() => send('cfm-run-automation', {}))}
            />
          )}
        </>
      )}
    </main>
  );
}
