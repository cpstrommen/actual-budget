import type {
  CfmAutomationConfig,
  CfmAutomationJob,
  CfmAutomationJobState,
  CfmAutomationMode,
  CfmAutomationOccurrence,
} from '#shared/cfm-automation';
import {
  resolveAutomationOccurrence,
  validateAutomationConfig,
} from '#shared/cfm-automation';

export type CfmAutomationStore = {
  load: (jobId: string) => Promise<CfmAutomationJobState | undefined>;
  /** Must be an atomic local compare-and-set, serialized across worker calls. */
  compareAndSet: (
    jobId: string,
    expectedRevision: number | undefined,
    state: CfmAutomationJobState,
  ) => Promise<boolean>;
};
export type CfmAutomationContext = {
  deviceId: string;
  ownerId: string;
  mode: CfmAutomationMode;
  now: string;
  isUnlocked: boolean;
};
export type CfmAutomationExecution = {
  job: CfmAutomationJob;
  occurrence: CfmAutomationOccurrence;
  /** Stable across retries, lease handovers, and scheduler restarts. */
  idempotencyKey: string;
  priorFailures: string[];
};
export type CfmAutomationTickResult = {
  status: 'ran' | 'paused';
  reason?: 'disabled' | 'different-device' | 'wrong-mode' | 'locked';
  jobs: Array<{
    jobId: string;
    status: 'succeeded' | 'failed' | 'skipped' | 'paused' | 'lease-lost';
    error?: string;
  }>;
};
export type RunCfmAutomationOptions = {
  config: CfmAutomationConfig;
  jobs: CfmAutomationJob[];
  context: CfmAutomationContext;
  store: CfmAutomationStore;
  execute: (execution: CfmAutomationExecution) => Promise<void>;
  leaseDurationSeconds?: number;
  retryBaseSeconds?: number;
  maxRetrySeconds?: number;
  resumePaused?: boolean;
  signal?: AbortSignal;
  clock?: () => string;
};

export class CfmAutomationError extends Error {
  retryable: boolean;
  needsReauthorization: boolean;
  retryAfterSeconds?: number;
  constructor(
    message: string,
    options: {
      retryable?: boolean;
      needsReauthorization?: boolean;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = 'CfmAutomationError';
    this.retryable = options.retryable ?? true;
    this.needsReauthorization = options.needsReauthorization ?? false;
    if (options.retryAfterSeconds !== undefined) {
      if (
        !Number.isFinite(options.retryAfterSeconds) ||
        options.retryAfterSeconds < 0
      )
        throw new Error('Invalid retry delay');
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

/**
 * One bounded catch-up per job. Financial executors MUST persist the idempotency
 * key beside the resulting ledger/report record, because a crash can occur after
 * that write but before this local job state records success.
 */
export async function runCfmAutomation(
  options: RunCfmAutomationOptions,
): Promise<CfmAutomationTickResult> {
  const config = validateAutomationConfig(options.config);
  const { context, store } = options;
  if (!config.enabled)
    return { status: 'paused', reason: 'disabled', jobs: [] };
  if (config.schedulerId !== context.deviceId)
    return { status: 'paused', reason: 'different-device', jobs: [] };
  if (config.mode !== context.mode)
    return { status: 'paused', reason: 'wrong-mode', jobs: [] };
  if (!context.isUnlocked)
    return { status: 'paused', reason: 'locked', jobs: [] };
  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) throw new Error('Invalid automation timestamp');
  if (!context.ownerId)
    throw new Error('An automation lease owner is required');
  const lease = (options.leaseDurationSeconds ?? 900) * 1000;
  const retryBase = (options.retryBaseSeconds ?? 60) * 1000;
  const maxRetry = (options.maxRetrySeconds ?? 3600) * 1000;
  if (
    !Number.isSafeInteger(lease) ||
    lease <= 0 ||
    retryBase <= 0 ||
    maxRetry < retryBase
  )
    throw new Error('Invalid automation lease or retry configuration');
  const results: CfmAutomationTickResult['jobs'] = [];
  const failures: string[] = [];
  const seen = new Set<string>();
  const rank = { 'bank-sync': 0, 'asset-valuation': 1, report: 2 };
  const jobs = [...options.jobs].sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.id.localeCompare(b.id, 'en'),
  );
  for (const job of jobs) {
    if (!job.id || seen.has(job.id))
      throw new Error('Automation job IDs must be present and unique');
    seen.add(job.id);
    if (options.signal?.aborted) break;
    const previous = await store.load(job.id);
    const planned = resolveAutomationOccurrence(
      job,
      context.now,
      config.timeZone,
    );
    if (previous?.status === 'paused' && !options.resumePaused) {
      results.push({ jobId: job.id, status: 'paused', error: previous.error });
      if (previous.error) failures.push(`${job.id}: ${previous.error}`);
      continue;
    }
    if (
      (previous?.status === 'running' &&
        Date.parse(previous.leaseExpiresAt ?? '') > now) ||
      (previous?.status === 'succeeded' &&
        previous.occurrence.id === planned.id) ||
      (previous && Date.parse(previous.lastAttemptAt) > now) ||
      (previous?.status === 'failed' &&
        Date.parse(previous.nextAttemptAt) > now)
    ) {
      results.push({ jobId: job.id, status: 'skipped' });
      continue;
    }
    // Retrying the original failed occurrence prevents an interval rollover from
    // abandoning work whose write may have succeeded immediately before a crash.
    const retrying =
      previous &&
      (previous.status === 'failed' ||
        previous.status === 'running' ||
        (previous.status === 'paused' && options.resumePaused));
    const occurrence = retrying ? previous.occurrence : planned;
    const attempts =
      previous?.occurrence.id === occurrence.id ? previous.attempts + 1 : 1;
    const claimed: CfmAutomationJobState = {
      jobId: job.id,
      revision: (previous?.revision ?? 0) + 1,
      occurrence,
      status: 'running',
      attempts,
      leaseOwner: context.ownerId,
      leaseExpiresAt: new Date(now + lease).toISOString(),
      lastAttemptAt: context.now,
      nextAttemptAt: context.now,
      ...(previous?.lastSuccessAt
        ? { lastSuccessAt: previous.lastSuccessAt }
        : {}),
    };
    if (!(await store.compareAndSet(job.id, previous?.revision, claimed))) {
      results.push({ jobId: job.id, status: 'skipped' });
      continue;
    }
    let error: unknown;
    try {
      if (options.signal?.aborted)
        throw new CfmAutomationError('Automation was cancelled');
      await options.execute({
        job,
        occurrence,
        idempotencyKey: occurrence.id,
        priorFailures: [...failures],
      });
    } catch (caught) {
      error = caught;
    }
    const latest = await store.load(job.id);
    if (
      latest?.revision !== claimed.revision ||
      latest.leaseOwner !== context.ownerId
    ) {
      results.push({
        jobId: job.id,
        status: 'lease-lost',
        error: 'The job lease was replaced before completion',
      });
      continue;
    }
    const completedAt = options.clock?.() ?? context.now;
    if (!Number.isFinite(Date.parse(completedAt)))
      throw new Error('Invalid automation completion timestamp');
    let next: CfmAutomationJobState;
    if (error !== undefined) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        error instanceof CfmAutomationError &&
        (!error.retryable || error.needsReauthorization);
      const retryAfter =
        error instanceof CfmAutomationError &&
        error.retryAfterSeconds !== undefined
          ? error.retryAfterSeconds * 1000
          : 0;
      const delay = Math.max(
        retryAfter,
        Math.min(maxRetry, retryBase * 2 ** Math.min(attempts - 1, 20)),
      );
      next = {
        jobId: job.id,
        revision: claimed.revision + 1,
        occurrence,
        status: permanent ? 'paused' : 'failed',
        attempts,
        lastAttemptAt: claimed.lastAttemptAt,
        nextAttemptAt: new Date(Date.parse(completedAt) + delay).toISOString(),
        error: message,
        ...(claimed.lastSuccessAt
          ? { lastSuccessAt: claimed.lastSuccessAt }
          : {}),
        ...(error instanceof CfmAutomationError && error.needsReauthorization
          ? { needsReauthorization: true }
          : {}),
      };
      failures.push(`${job.id}: ${message}`);
    } else
      next = {
        jobId: job.id,
        revision: claimed.revision + 1,
        occurrence,
        status: 'succeeded',
        attempts,
        lastAttemptAt: claimed.lastAttemptAt,
        lastSuccessAt: completedAt,
        nextAttemptAt: occurrence.nextDueAt,
      };
    if (!(await store.compareAndSet(job.id, claimed.revision, next))) {
      results.push({
        jobId: job.id,
        status: 'lease-lost',
        error: 'The job lease changed while saving its result',
      });
      continue;
    }
    results.push({
      jobId: job.id,
      status: next.status === 'running' ? 'lease-lost' : next.status,
      ...(next.error ? { error: next.error } : {}),
    });
  }
  return { status: 'ran', jobs: results };
}

/** Enforce provider-specific limits even when a user's interval is shorter. */
export function createBankSyncJobs(
  config: CfmAutomationConfig,
  providerMinimumIntervals: Record<string, number> = {},
): CfmAutomationJob[] {
  return config.bankConnectionIds.map(id => {
    const minimum = providerMinimumIntervals[id] ?? 15;
    if (!Number.isFinite(minimum) || minimum <= 0)
      throw new Error('Invalid provider refresh interval');
    return {
      id: `bank-sync:${id}`,
      kind: 'bank-sync',
      schedule: 'interval',
      intervalMinutes: Math.ceil(
        Math.max(config.bankSyncIntervalMinutes, minimum),
      ),
      payload: { connectionId: id },
    };
  });
}
