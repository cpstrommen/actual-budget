import { send } from '@actual-app/core/platform/client/connection';

import { loadBudget } from '#budgetfiles/budgetfilesSlice';
import { loadPrefs } from '#prefs/prefsSlice';
import type { AppDispatch } from '#redux/store';

const storageKey = 'actual-cfm-ui-preview-budget-v1';
const sampleName = 'Actual CFM example — 2026';

/** Only called by the explicitly enabled local preview; uses the normal native importer. */
export async function initializeCfmPreview(dispatch: AppDispatch) {
  await send('set-server-url', { url: null, validate: false });
  const stored = localStorage.getItem(storageKey);
  const budgets = await send('get-budgets');
  const existing = budgets.find(
    budget => budget.id === stored && budget.name === sampleName,
  );
  const reset =
    new URLSearchParams(window.location.search).get('resetSample') === '1';
  if (existing && !reset) {
    await dispatch(loadBudget({ id: existing.id })).unwrap();
    return;
  }
  if (existing && reset) {
    // Only remove the sample we imported, locally. Never pass a cloud file ID.
    await send('delete-budget', { id: existing.id });
  }
  const response = await fetch('/__cfm-preview/sample.zip', {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Could not load the synthetic preview budget');
  }
  const result = await send('import-budget', {
    type: 'actual',
    buffer: await response.arrayBuffer(),
    filename: 'Actual CFM UI sample.zip',
  });
  if (result.error || !result.id) {
    throw new Error(
      'Could not import the preview budget: ' +
        (result.error || 'no budget ID'),
    );
  }
  localStorage.setItem(storageKey, result.id);
  await dispatch(loadPrefs()).unwrap();
}
