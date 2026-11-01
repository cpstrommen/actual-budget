import { isReportDate } from './cfm-reports';

export type CfmAutomationMode = 'application' | 'headless';
export type CfmAutomationConfig = {
  enabled: boolean;
  mode: CfmAutomationMode;
  schedulerId: string;
  timeZone: string;
  bankSyncIntervalMinutes: number;
  bankConnectionIds: string[];
  postAssetValuations: boolean;
  generateReports: boolean;
};
export type CfmAutomationJob = {
  id: string;
  kind: 'bank-sync' | 'asset-valuation' | 'report';
  schedule: 'interval' | 'daily' | 'monthly' | 'quarterly' | 'annual';
  intervalMinutes?: number;
  payload: Record<string, string | number | boolean | string[]>;
};
export type CfmAutomationOccurrence = {
  id: string;
  dueAt: string;
  nextDueAt: string;
  effectiveDate: string;
  startDate: string;
  endDate: string;
};
export type CfmAutomationJobState = {
  jobId: string;
  revision: number;
  occurrence: CfmAutomationOccurrence;
  status: 'running' | 'succeeded' | 'failed' | 'paused';
  attempts: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastAttemptAt: string;
  lastSuccessAt?: string;
  nextAttemptAt: string;
  error?: string;
  needsReauthorization?: boolean;
};

export function defaultAutomationConfig(timeZone = 'UTC'): CfmAutomationConfig {
  return {
    enabled: false,
    mode: 'application',
    schedulerId: '',
    timeZone,
    bankSyncIntervalMinutes: 360,
    bankConnectionIds: [],
    postAssetValuations: false,
    generateReports: false,
  };
}

export function validateAutomationConfig(value: unknown): CfmAutomationConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid automation configuration');
  }
  const input: Record<string, unknown> = value as Record<string, unknown>;
  const config = { ...defaultAutomationConfig(), ...input };
  if (
    typeof config.enabled !== 'boolean' ||
    typeof config.generateReports !== 'boolean' ||
    typeof config.postAssetValuations !== 'boolean'
  ) {
    throw new Error('Automation switches must be boolean');
  }
  if (config.mode !== 'application' && config.mode !== 'headless') {
    throw new Error('Automation mode must be application or headless');
  }
  if (
    typeof config.schedulerId !== 'string' ||
    (config.enabled && !config.schedulerId.trim())
  ) {
    throw new Error('Select one scheduler device before enabling automation');
  }
  if (typeof config.timeZone !== 'string') {
    throw new Error('Automation needs a timezone');
  }
  new Intl.DateTimeFormat('en-US', { timeZone: config.timeZone });
  if (
    !Number.isSafeInteger(config.bankSyncIntervalMinutes) ||
    Number(config.bankSyncIntervalMinutes) < 15 ||
    Number(config.bankSyncIntervalMinutes) > 10080
  ) {
    throw new Error(
      'Bank sync interval must be between 15 minutes and one week',
    );
  }
  if (
    !Array.isArray(config.bankConnectionIds) ||
    config.bankConnectionIds.some(id => typeof id !== 'string' || !id)
  ) {
    throw new Error('Invalid bank connections');
  }
  return {
    enabled: config.enabled,
    mode: config.mode,
    schedulerId: config.schedulerId.trim(),
    timeZone: config.timeZone,
    bankSyncIntervalMinutes: Number(config.bankSyncIntervalMinutes),
    bankConnectionIds: [...new Set(config.bankConnectionIds)],
    postAssetValuations: config.postAssetValuations,
    generateReports: config.generateReports,
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
export function getAutomationDay(
  now: string | number | Date,
  timeZone: string,
): string {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid automation timestamp');
  }
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  return ['year', 'month', 'day']
    .map(type => parts.find(part => part.type === type)?.value)
    .join('-');
}

function addDay(day: string, amount: number): string {
  if (!isReportDate(day)) throw new Error('Invalid automation day');
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function monthStart(day: string, delta = 0): string {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 10);
}

/** First instant of a calendar day, including zones whose midnight is skipped. */
export function automationDayStart(day: string, timeZone: string): string {
  if (!isReportDate(day)) throw new Error('Invalid automation day');
  const utc = Date.parse(`${day}T00:00:00.000Z`);
  let low = utc - 36 * 3600000;
  let high = utc + 36 * 3600000;
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (getAutomationDay(middle, timeZone) < day) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}

export function resolveAutomationOccurrence(
  job: CfmAutomationJob,
  now: string,
  timeZone: string,
): CfmAutomationOccurrence {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) {
    throw new Error('Invalid automation timestamp');
  }
  const today = getAutomationDay(timestamp, timeZone);
  if (job.schedule === 'interval') {
    if (
      !Number.isSafeInteger(job.intervalMinutes) ||
      Number(job.intervalMinutes) < 1
    ) {
      throw new Error('Interval jobs require a positive interval');
    }
    const interval = Number(job.intervalMinutes) * 60000;
    const slot = Math.floor(timestamp / interval);
    return {
      id: `${job.id}:${slot}`,
      dueAt: new Date(slot * interval).toISOString(),
      nextDueAt: new Date((slot + 1) * interval).toISOString(),
      effectiveDate: today,
      startDate: today,
      endDate: today,
    };
  }
  let boundary = today;
  let nextBoundary = addDay(today, 1);
  let startDate = addDay(today, -1);
  if (job.schedule === 'monthly') {
    boundary = monthStart(today);
    nextBoundary = monthStart(today, 1);
    startDate = monthStart(today, -1);
  } else if (job.schedule === 'quarterly') {
    const month = Number(today.slice(5, 7));
    boundary = `${today.slice(0, 4)}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    nextBoundary = monthStart(boundary, 3);
    startDate = monthStart(boundary, -3);
  } else if (job.schedule === 'annual') {
    boundary = `${today.slice(0, 4)}-01-01`;
    nextBoundary = `${Number(today.slice(0, 4)) + 1}-01-01`;
    startDate = `${Number(today.slice(0, 4)) - 1}-01-01`;
  }
  const endDate = addDay(boundary, -1);
  return {
    id: `${job.id}:${startDate}:${endDate}`,
    dueAt: automationDayStart(boundary, timeZone),
    nextDueAt: automationDayStart(nextBoundary, timeZone),
    effectiveDate: endDate,
    startDate,
    endDate,
  };
}
