/** Shared by manual refresh and automation. Identical overlapping requests share a result. */
let tail: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<unknown>>();
export function runBankSyncLocked<T>(
  provider: string,
  ids: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([provider, [...ids].sort()]);
  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const result = tail.catch(() => undefined).then(operation);
  tail = result;
  pending.set(key, result);
  const clear = () => {
    if (pending.get(key) === result) pending.delete(key);
  };
  void result.then(clear, clear);
  return result;
}
