import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { theme } from '@actual-app/components/theme';
import { listen, send } from '@actual-app/core/platform/client/connection';
import type { CfmRecord, CfmState } from '@actual-app/core/types/models/cfm';

import { MOBILE_NAV_HEIGHT } from '#components/mobile/MobileNavTabs';

import { CfmAccounts } from './CfmAccounts';
import { CfmAnnualPlanning } from './CfmAnnualPlanning';
import { CfmAssets } from './CfmAssets';
import { CfmAutomation } from './CfmAutomation';
import { CfmLiquidity } from './CfmLiquidity';
import { CfmObligations } from './CfmObligations';
import { CfmOverview } from './CfmOverview';
import { CfmReports } from './CfmReports';
import { Field, fieldStyle, newId, today } from './ui';
import type { SaveRecord } from './ui';

export type CfmSection =
  | 'summary'
  | 'liquidity'
  | 'accounts'
  | 'annual'
  | 'assets'
  | 'receivables'
  | 'payables'
  | 'reports'
  | 'automation';

export function CfmWorkspace({ section }: { section: CfmSection }) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CfmState | null>(null);
  const [asOf, setAsOf] = useState(
    import.meta.env.DEV && import.meta.env.REACT_APP_CFM_PREVIEW === 'true'
      ? '2026-10-31'
      : today(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reportError = (value: unknown) =>
    setError(
      value instanceof Error
        ? value.message
        : typeof value === 'object' && value && 'message' in value
          ? String(value.message)
          : JSON.stringify(value),
    );
  async function refresh() {
    setState(await send('cfm-get-state'));
  }
  useEffect(() => {
    void refresh().catch(reportError);
    return listen('sync-event', event => {
      if (event.type === 'applied' || event.type === 'success') {
        void refresh().catch(reportError);
      }
    });
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
  const save: SaveRecord = (kind, data, id, expectedUpdatedAt) =>
    mutate(async () => {
      const previous = state?.records.find(item => item.id === id);
      const record: CfmRecord = {
        id: id || newId(),
        kind,
        data,
        updatedAt:
          expectedUpdatedAt || previous?.updatedAt || new Date().toISOString(),
      };
      await send('cfm-save-record', { record });
    });
  const overviewProps = state
    ? {
        state,
        asOf,
        save,
        busy,
        onError: reportError,
        initialAccountId: searchParams.get('account') || undefined,
        setBalance: (
          input: Parameters<typeof send<'cfm-post-adjustment'>>[1],
        ) => mutate(() => send('cfm-post-adjustment', input)),
      }
    : null;
  return (
    <main
      data-cfm-workspace
      style={{
        height: section === 'automation' ? 'auto' : '100%',
        overflow: 'auto',
        background: theme.pageBackground,
        color: theme.pageText,
        padding: section === 'automation' ? 0 : 24,
        paddingTop: section === 'automation' ? 0 : isNarrowWidth ? 12 : 48,
        paddingBottom: isNarrowWidth ? MOBILE_NAV_HEIGHT + 24 : 24,
      }}
    >
      <style>{`[data-cfm-workspace]{color-scheme:light}[data-theme="dark"] [data-cfm-workspace],[data-theme="midnight"] [data-cfm-workspace]{color-scheme:dark}@media(prefers-color-scheme:dark){[data-theme="auto"] [data-cfm-workspace]{color-scheme:dark}}`}</style>
      {section !== 'automation' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 18,
          }}
        >
          <Field label={t('As of date')}>
            <input
              style={fieldStyle}
              type="date"
              value={asOf}
              onChange={event => {
                if (event.target.value) setAsOf(event.target.value);
              }}
            />
          </Field>
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: theme.errorText }}>
          {error}
        </p>
      )}
      {!state || !overviewProps ? (
        <p>
          <Trans>Loading financial records…</Trans>
        </p>
      ) : (
        <>
          {section === 'summary' && (
            <CfmOverview {...overviewProps} mode="summary" />
          )}
          {section === 'accounts' && (
            <CfmAccounts
              {...overviewProps}
              createAccount={input =>
                mutate(() => send('cfm-create-account', input))
              }
            />
          )}
          {section === 'annual' && (
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
          {section === 'assets' && (
            <CfmAssets
              state={state}
              asOf={asOf}
              save={save}
              busy={busy}
              onError={reportError}
              updateSource={input =>
                mutate(() => send('cfm-update-asset-source', input))
              }
              valueAssetAccount={input =>
                mutate(() => send('cfm-value-asset', input))
              }
            />
          )}
          {(section === 'receivables' || section === 'payables') && (
            <CfmObligations
              key={section}
              directionFilter={
                section === 'receivables' ? 'receivable' : 'payable'
              }
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
          {section === 'liquidity' && (
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
          {section === 'reports' && (
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
          {section === 'automation' && (
            <CfmAutomation
              state={state}
              save={save}
              busy={busy}
              onError={reportError}
              run={resumePaused =>
                mutate(() => send('cfm-run-automation', { resumePaused }))
              }
            />
          )}
        </>
      )}
    </main>
  );
}
