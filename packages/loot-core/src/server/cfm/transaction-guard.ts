import * as db from '#server/db';
import type { TransactionEntity } from '#types/models';

/** Native undo and the dedicated CFM operations bypass this public-ledger edit guard. */
export async function assertCfmTransactionChanges(updated: Partial<TransactionEntity>[] = [], deleted: Partial<TransactionEntity>[] = []):Promise<void> {
  const financialKeys=['amount','account','date','payee','transfer_id','parent_id','is_parent','is_child','category'];
  const ids=[...deleted.map(row=>row.id),...updated.filter(row=>financialKeys.some(key=>Object.hasOwn(row,key))).map(row=>row.id)].filter((id):id is string=>Boolean(id));
  for(const id of ids) {
    const managed=/^cfm-(allocation|counterpart|control|noncash|recognition|payment|reverse-payment)-/.test(id);
    const children=await db.first<{id:string}>("SELECT id FROM transactions WHERE parent_id=? AND tombstone=0 AND id LIKE 'cfm-allocation-%' LIMIT 1",[id]);
    if(managed || children)throw new Error('This entry is managed by a CFM obligation. Use a settlement, write-off, or allocation reversal in Receivables / payables. Undo can reverse a mistaken operation.');
  }
}
