import { v4 as uuidv4 } from 'uuid';

import * as asyncStorage from '#platform/server/asyncStorage';
import { app as accountsApp } from '#server/accounts/app';
import { runMutator } from '#server/mutators';
import * as prefs from '#server/prefs';
import { batchMessages } from '#server/sync';
import { getCfmRecords, valueAsset } from '#shared/cfm';
import {
  defaultAutomationConfig,
  validateAutomationConfig,
} from '#shared/cfm-automation';
import type {
  CfmAutomationJob,
  CfmAutomationJobState,
} from '#shared/cfm-automation';

import { getState, valueAssetAccount } from './app';
import {
  CfmAutomationError,
  createBankSyncJobs,
  runCfmAutomation,
} from './automation';
import { getDeviceId, readRecords } from './store';
import { runReport } from './views';

let running = false;
export async function runAutomation({
  now = new Date().toISOString(),
  deviceId,
  mode = 'application',
}: {
  now?: string;
  deviceId?: string;
  mode?: 'application' | 'headless';
} = {}) {
  if (running) return { status: 'paused', reason: 'already-running', jobs: [] };
  running = true;
  try {
    const state = await getState();
    const raw = state.records.find(record => record.kind === 'automation');
    const config = raw
      ? validateAutomationConfig(raw.data)
      : defaultAutomationConfig();
    const providerMinimums: Record<string, number> = {};
    for (const account of state.accounts)
      providerMinimums[account.id] =
        account.account_sync_source === 'goCardless'
          ? 360
          : account.account_sync_source === 'simpleFin'
            ? 60
            : 15;
    const jobs: CfmAutomationJob[] = createBankSyncJobs(
      config,
      providerMinimums,
    );
    if (config.postAssetValuations)
      for (const asset of getCfmRecords(state.records, 'asset'))
        if (asset.data.policy.method !== 'manual')
          jobs.push({
            id: `asset:${asset.id}`,
            kind: 'asset-valuation',
            schedule:
              asset.data.policy.postingFrequency === 'annually'
                ? 'annual'
                : asset.data.policy.postingFrequency === 'quarterly'
                  ? 'quarterly'
                  : asset.data.policy.postingFrequency === 'monthly'
                    ? 'monthly'
                    : 'daily',
            payload: { assetId: asset.id },
          });
    if (config.generateReports)
      for (const template of state.records.filter(
        record => record.kind === 'report-template',
      )) {
        const auto = template.data.autoGenerate;
        if (
          typeof auto === 'object' &&
          auto &&
          'enabled' in auto &&
          auto.enabled &&
          'cadence' in auto &&
          (auto.cadence === 'monthly' ||
            auto.cadence === 'quarterly' ||
            auto.cadence === 'annual')
        )
          jobs.push({
            id: `report:${template.id}`,
            kind: 'report',
            schedule: auto.cadence,
            payload: { templateId: template.id },
          });
      }
    const key = `${prefs.getPrefs()?.id || ''}`;
    const load = async (
      jobId: string,
    ): Promise<CfmAutomationJobState | undefined> => {
      const states = (await asyncStorage.getItem('cfm-job-states')) || {};
      return states[`${key}:${jobId}`];
    };
    return await runCfmAutomation({
      config,
      jobs,
      context: {
        deviceId: deviceId || (await getDeviceId()),
        ownerId: uuidv4(),
        mode,
        now,
        isUnlocked: Boolean(prefs.getPrefs()?.id),
      },
      store: {
        load,
        compareAndSet: (jobId, expectedRevision, next) =>
          runMutator(async () => {
            const states = (await asyncStorage.getItem('cfm-job-states')) || {};
            if (states[`${key}:${jobId}`]?.revision !== expectedRevision)
              return false;
            await asyncStorage.setItem('cfm-job-states', {
              ...states,
              [`${key}:${jobId}`]: next,
            });
            return true;
          }),
      },
      execute: async ({ job, occurrence, idempotencyKey, priorFailures }) => {
        const operationId = idempotencyKey.replace(/[^A-Za-z0-9:_-]/g, '_');
        if (job.kind === 'bank-sync') {
          const account = state.accounts.find(
            item => item.id === job.payload.connectionId,
          );
          if (!account?.account_sync_source)
            throw new CfmAutomationError('Bank connection is unavailable', {
              retryable: false,
              needsReauthorization: true,
            });
          const result = await accountsApp.handlers['accounts-bank-sync']({
            ids: [account.id],
          });
          if ('errors' in result && result.errors?.length)
            throw new CfmAutomationError(JSON.stringify(result.errors), {
              needsReauthorization: JSON.stringify(result.errors).includes(
                'reauth',
              ),
              retryAfterSeconds: 60,
            });
        } else if (job.kind === 'asset-valuation') {
          const current = await getState();
          const asset = getCfmRecords(current.records, 'asset').find(
            item => item.id === job.payload.assetId,
          );
          if (!asset)
            throw new CfmAutomationError('Asset no longer exists', {
              retryable: false,
            });
          const value = valueAsset(asset.data, occurrence.effectiveDate).value;
          await runMutator(() =>
            valueAssetAccount({
              assetId: asset.id,
              date: occurrence.effectiveDate,
              value,
              reason: 'Scheduled non-cash asset valuation',
            modeled: true,
              requestId: operationId,
            }),
          );
        } else {
          await runMutator(() =>
            runReport({
              templateId: String(job.payload.templateId),
              asOf: occurrence.endDate,
              startDate: occurrence.startDate,
              endDate: occurrence.endDate,
              requestId: operationId,
            }),
          );
        }
      },
    });
  } finally {
    running = false;
  }
}

export async function getAutomationStates(): Promise<CfmAutomationJobState[]> {
  const states = (await asyncStorage.getItem('cfm-job-states')) || {};
  const prefix = `${prefs.getPrefs()?.id}:`;
  return Object.entries(states)
    .filter(([id]) => id.startsWith(prefix))
    .map(([, value]) => value);
}
