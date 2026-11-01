import type {
  CfmAccountClassification,
  CfmAnnualPlan,
  CfmAsset,
  CfmObligation,
  CfmRecord,
  CfmSettlement,
} from '@actual-app/core/types/models/cfm';

export function isClassification(
  record: CfmRecord,
): record is CfmRecord<CfmAccountClassification> {
  return (
    record.kind === 'classification' &&
    typeof record.data.accountId === 'string' &&
    typeof record.data.kind === 'string' &&
    typeof record.data.effectiveDate === 'string'
  );
}
export function isAnnualPlan(
  record: CfmRecord,
): record is CfmRecord<CfmAnnualPlan> {
  return (
    record.kind === 'annual-plan' &&
    typeof record.data.categoryId === 'string' &&
    typeof record.data.amount === 'number' &&
    typeof record.data.year === 'number'
  );
}
export function isAsset(record: CfmRecord): record is CfmRecord<CfmAsset> {
  return (
    record.kind === 'asset' &&
    typeof record.data.accountId === 'string' &&
    typeof record.data.acquisitionValue === 'number' &&
    typeof record.data.policy === 'object' &&
    record.data.policy !== null
  );
}
export function isObligation(
  record: CfmRecord,
): record is CfmRecord<CfmObligation> {
  return (
    record.kind === 'obligation' &&
    typeof record.data.counterparty === 'string' &&
    typeof record.data.accountId === 'string' &&
    typeof record.data.amount === 'number'
  );
}
export function isSettlement(
  record: CfmRecord,
): record is CfmRecord<CfmSettlement> {
  return (
    record.kind === 'settlement' &&
    typeof record.data.obligationId === 'string' &&
    typeof record.data.amount === 'number' &&
    typeof record.data.date === 'string'
  );
}
