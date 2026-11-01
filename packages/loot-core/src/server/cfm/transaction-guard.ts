import * as db from '#server/db';
import type { TransactionEntity } from '#types/models';

/** Native undo and the dedicated CFM operations bypass this public-ledger edit guard. */
export async function assertCfmTransactionChanges(
  updated: Partial<TransactionEntity>[] = [],
  deleted: Partial<TransactionEntity>[] = [],
): Promise<void> {
  const financialKeys = [
    'amount',
    'account',
    'date',
    'payee',
    'transfer_id',
    'parent_id',
    'is_parent',
    'is_child',
    'category',
  ];
  const parents = new Set(
    (
      await db.all<{ parent_id: string }>(
        "SELECT DISTINCT parent_id FROM transactions WHERE tombstone=0 AND id LIKE 'cfm-allocation-%' AND parent_id IS NOT NULL",
      )
    ).map(row => row.parent_id),
  );
  const protectedId = (id: string) =>
    parents.has(id) ||
    /^cfm-(allocation|counterpart|control|noncash|recognition|payment|reverse-payment)-/.test(
      id,
    );
  const ids = deleted
    .map(row => row.id)
    .filter((id): id is string => Boolean(id));
  for (const change of updated) {
    if (!change.id || !protectedId(change.id)) continue;
    const current = await db.getTransaction(change.id);
    const old = Object.fromEntries(Object.entries(current || {}));
    const next = Object.fromEntries(Object.entries(change));
    const changed = financialKeys.some(
      key =>
        !(key === 'category' && Boolean(old.is_parent)) &&
        next[key] !== undefined &&
        (key === 'is_parent' || key === 'is_child'
          ? Boolean(old[key]) !== Boolean(next[key])
          : (old[key] ?? null) !== (next[key] ?? null)),
    );
    if (changed) ids.push(change.id);
  }
  for (const id of ids) {
    if (protectedId(id)) {
      throw new Error(
        'This entry is managed by a CFM obligation. Use a settlement, write-off, or allocation reversal in Receivables / payables. Undo can reverse a mistaken operation.',
      );
    }
  }
}
