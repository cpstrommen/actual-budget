import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { send } from '@actual-app/core/platform/client/connection';
import { format } from 'date-fns';

import { useMetadataPref } from '#hooks/useMetadataPref';

import { SettingsRow } from './SettingsRow';

export function ExportBudget() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [budgetName] = useMetadataPref('budgetName');
  const [encryptKeyId] = useMetadataPref('encryptKeyId');

  async function onExportUpstream() {
    setIsLoading(true);setError(null);
    try {
      const result=await send('cfm-export-upstream',{});
      await window.Actual.saveFile(result.data,`${format(new Date(),'yyyy-MM-dd')}-for-Actual-Budget.zip`,t('Save Actual Budget file'));
      await window.Actual.saveFile(result.archive,`${format(new Date(),'yyyy-MM-dd')}-CFM-recovery.zip`,t('Save CFM recovery archive'));
    } catch { setError('export-error'); }
    finally {setIsLoading(false);}
  }

  async function onExport() {
    setIsLoading(true);
    setError(null);
    setWarnings([]);

    const response = await send('export-budget');

    if ('error' in response && response.error) {
      setError(response.error);
      setIsLoading(false);
      console.log('Export error code:', response.error);
      return;
    }

    if (response.data) {
      setWarnings(response.warnings ?? []);
      try {
        await window.Actual.saveFile(
          response.data,
          `${format(new Date(), 'yyyy-MM-dd')}-${budgetName}.zip`,
          t('Export budget'),
        );
      } catch {
        setError('export-error');
      }
    }
    setIsLoading(false);
  }

  return (
    <SettingsRow
      title={t('Export')}
      description={
        <>
          <Trans>
            <span>Export</span> your data as a zip file containing{' '}
            <code>db.sqlite</code> and <code>metadata.json</code> files. It can
            be imported into another compatible Actual CFM instance by closing
            an open file (if any), then clicking the "Import file" button, then
            choosing "Actual CFM / Actual Budget".
          </Trans>{' '}
          <Trans>
            This is a native backup. Returning to upstream Actual Budget
            requires a verified compatible export; future CFM data extensions
            may need conversion. Keep the original backup until imported history
            is checked.
          </Trans>
          {encryptKeyId ? (
            <>
              {' '}
              <Trans>
                Even though encryption is enabled, the exported zip file will
                not have any encryption.
              </Trans>
            </>
          ) : null}
        </>
      }
      control={
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <ButtonWithLoading onPress={onExport} isLoading={isLoading}><Trans>Export CFM backup</Trans></ButtonWithLoading>
          <ButtonWithLoading onPress={onExportUpstream} isLoading={isLoading}><Trans>Export for Actual Budget</Trans></ButtonWithLoading>
        </div>
      }
    >
      {error && (
        <Text style={{ color: theme.errorText }}>
          <Trans>
            An unknown error occurred while exporting. Please report this as a
            new issue on GitHub.
          </Trans>
        </Text>
      )}
      {warnings.includes('exceeds-import-size-limit') && (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            This export is larger than Actual CFM can safely re-import. You may
            not be able to restore this backup.
          </Trans>
        </Text>
      )}
      {warnings.includes('may-exceed-available-memory') && (
        <Text style={{ color: theme.warningText }}>
          <Trans>
            This export is larger than the memory available on this device.
            Restoring it here may fail.
          </Trans>
        </Text>
      )}
    </SettingsRow>
  );
}
