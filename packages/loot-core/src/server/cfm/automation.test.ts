import { describe, expect, it } from 'vitest';

import {
  automationDayStart,
  defaultAutomationConfig,
  resolveAutomationOccurrence,
  validateAutomationConfig,
} from '#shared/cfm-automation';
import type {
  CfmAutomationJob,
  CfmAutomationJobState,
} from '#shared/cfm-automation';

import {
  CfmAutomationError,
  createBankSyncJobs,
  runCfmAutomation,
} from './automation';
import type { CfmAutomationStore } from './automation';

function fixture() {
  const states = new Map<string, CfmAutomationJobState>();
  const store: CfmAutomationStore = {
    load: async id => states.get(id),
    compareAndSet: async (id, expected, next) => {
      if (states.get(id)?.revision !== expected) return false;
      states.set(id, structuredClone(next));
      return true;
    },
  };
  const config = {
    ...defaultAutomationConfig('America/Chicago'),
    enabled: true,
    schedulerId: 'device-1',
    bankConnectionIds: ['connection-1'],
    bankSyncIntervalMinutes: 60,
  };
  const context = {
    deviceId: 'device-1',
    ownerId: 'owner-1',
    mode: 'application' as const,
    isUnlocked: true,
    now: '2026-10-31T18:05:00.000Z',
  };
  const job: CfmAutomationJob = {
    id: 'bank-1',
    kind: 'bank-sync',
    schedule: 'interval',
    intervalMinutes: 60,
    payload: {},
  };
  return { states, store, config, context, job };
}

describe('CFM durable automation', () => {
  it('does no work when disabled, locked, on another device, or in the wrong mode', async () => {
    const { config, context, store, job } = fixture();
    let called = 0;
    const execute = async () => {
      called++;
    };
    expect(
      (
        await runCfmAutomation({
          config: { ...config, enabled: false },
          context,
          store,
          jobs: [job],
          execute,
        })
      ).reason,
    ).toBe('disabled');
    expect(
      (
        await runCfmAutomation({
          config,
          context: { ...context, isUnlocked: false },
          store,
          jobs: [job],
          execute,
        })
      ).reason,
    ).toBe('locked');
    expect(
      (
        await runCfmAutomation({
          config,
          context: { ...context, deviceId: 'other' },
          store,
          jobs: [job],
          execute,
        })
      ).reason,
    ).toBe('different-device');
    expect(
      (
        await runCfmAutomation({
          config,
          context: { ...context, mode: 'headless' },
          store,
          jobs: [job],
          execute,
        })
      ).reason,
    ).toBe('wrong-mode');
    expect(called).toBe(0);
  });

  it('atomically permits only one overlapping runner and preserves a stable operation key', async () => {
    const { config, context, store, job } = fixture();
    let release: (() => void) | undefined;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    const operations: string[] = [];
    const first = runCfmAutomation({
      config,
      context,
      store,
      jobs: [job],
      execute: async e => {
        operations.push(e.idempotencyKey);
        await blocked;
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    const second = await runCfmAutomation({
      config,
      context: { ...context, ownerId: 'owner-2' },
      store,
      jobs: [job],
      execute: async () => {
        operations.push('duplicate');
      },
    });
    release?.();
    await first;
    expect(second.jobs[0]?.status).toBe('skipped');
    expect(operations).toHaveLength(1);
    const restarted = await runCfmAutomation({
      config,
      context: { ...context, ownerId: 'owner-3' },
      store,
      jobs: [job],
      execute: async () => {
        operations.push('restarted');
      },
    });
    expect(restarted.jobs[0]?.status).toBe('skipped');
    expect(operations).toHaveLength(1);
  });

  it('backs off rate limits and retries the same occurrence even across interval boundaries', async () => {
    const { config, context, store, states, job } = fixture();
    const keys: string[] = [];
    await runCfmAutomation({
      config,
      context,
      store,
      jobs: [job],
      execute: async e => {
        keys.push(e.idempotencyKey);
        throw new CfmAutomationError('Rate limited', {
          retryAfterSeconds: 7200,
        });
      },
    });
    expect(states.get(job.id)?.nextAttemptAt).toBe('2026-10-31T20:05:00.000Z');
    await runCfmAutomation({
      config,
      context: { ...context, now: '2026-10-31T19:00:00.000Z' },
      store,
      jobs: [job],
      execute: async () => {
        keys.push('too early');
      },
    });
    await runCfmAutomation({
      config,
      context: { ...context, now: '2026-10-31T20:06:00.000Z' },
      store,
      jobs: [job],
      execute: async e => {
        keys.push(e.idempotencyKey);
      },
    });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(states.get(job.id)?.status).toBe('succeeded');
  });

  it('recovers an expired lease after a crash without changing the idempotency key', async () => {
    const { config, context, store, states, job } = fixture();
    const occurrence = resolveAutomationOccurrence(
      job,
      context.now,
      config.timeZone,
    );
    states.set(job.id, {
      jobId: job.id,
      revision: 1,
      occurrence,
      status: 'running',
      attempts: 1,
      leaseOwner: 'dead-process',
      leaseExpiresAt: '2026-10-31T18:00:00Z',
      lastAttemptAt: '2026-10-31T17:55:00Z',
      nextAttemptAt: '2026-10-31T17:55:00Z',
    });
    let key = '';
    await runCfmAutomation({
      config,
      context,
      store,
      jobs: [job],
      execute: async e => {
        key = e.idempotencyKey;
      },
    });
    expect(key).toBe(occurrence.id);
    expect(states.get(job.id)?.attempts).toBe(2);
  });

  it('pauses authorization failures and reports stale bank inputs only after attempting sync', async () => {
    const { config, context, store, states, job } = fixture();
    const order: string[] = [];
    let failures: string[] = [];
    const report: CfmAutomationJob = {
      id: 'report-1',
      kind: 'report',
      schedule: 'monthly',
      payload: {},
    };
    await runCfmAutomation({
      config,
      context,
      store,
      jobs: [report, job],
      execute: async e => {
        order.push(e.job.kind);
        if (e.job.kind === 'bank-sync')
          throw new CfmAutomationError('Reconnect bank', {
            needsReauthorization: true,
          });
        failures = e.priorFailures;
      },
    });
    expect(order).toEqual(['bank-sync', 'report']);
    expect(failures).toEqual(['bank-1: Reconnect bank']);
    expect(states.get(job.id)?.needsReauthorization).toBe(true);
    const paused = await runCfmAutomation({
      config,
      context: { ...context, now: '2026-11-01T18:05:00Z' },
      store,
      jobs: [job],
      execute: async () => {
        throw new Error('must not retry');
      },
    });
    expect(paused.jobs[0]?.status).toBe('paused');
  });

  it('catches up once to the latest completed local period and respects DST day lengths', () => {
    const monthly: CfmAutomationJob = {
      id: 'report',
      kind: 'report',
      schedule: 'monthly',
      payload: {},
    };
    const occurrence = resolveAutomationOccurrence(
      monthly,
      '2026-11-15T18:00:00Z',
      'America/Chicago',
    );
    expect(occurrence.startDate).toBe('2026-10-01');
    expect(occurrence.endDate).toBe('2026-10-31');
    expect(automationDayStart('2026-11-01', 'America/Chicago')).toBe(
      '2026-11-01T05:00:00.000Z',
    );
    expect(automationDayStart('2026-11-02', 'America/Chicago')).toBe(
      '2026-11-02T06:00:00.000Z',
    );
    expect(automationDayStart('2026-03-09', 'America/Chicago')).toBe(
      '2026-03-09T05:00:00.000Z',
    );
  });

  it('enforces provider minimum intervals independently of the user setting', () => {
    const { config } = fixture();
    expect(
      createBankSyncJobs(config, { 'connection-1': 1440 })[0]?.intervalMinutes,
    ).toBe(1440);
    expect(() =>
      validateAutomationConfig({ ...config, enabled: true, schedulerId: '' }),
    ).toThrow('Select one');
    expect(() =>
      validateAutomationConfig({ ...config, timeZone: 'Imaginary/Zone' }),
    ).toThrow();
  });
});
