import { stat, utimes } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.getByRole('status')).toContainText('Sample ready', {
    timeout: 60000,
  });
  await expect(
    page.frameLocator('#app').locator('[data-cfm-workspace]'),
  ).toBeVisible();
}

test('repeated reloads and a second preview tab retain the same editable sample', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/__cfm-preview');
  await ready(page);
  const id = await page
    .frames()[1]
    .evaluate(async () => (await window.$send('load-prefs')).id);
  for (let index = 0; index < 3; index++) {
    await page.reload();
    await ready(page);
    expect(
      await page
        .frames()[1]
        .evaluate(async () => (await window.$send('load-prefs')).id),
    ).toBe(id);
  }
  const second = await context.newPage();
  second.on('pageerror', error => errors.push(error.message));
  await second.goto('/__cfm-preview');
  await ready(second);
  expect(
    await second
      .frames()[1]
      .evaluate(async () => (await window.$send('load-prefs')).id),
  ).toBe(id);
  await second.close();
  // The remaining tab must still be able to reach its ledger after takeover.
  expect(
    await page
      .frames()[1]
      .evaluate(
        async () => (await window.$send('cfm-get-state')).accounts.length,
      ),
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a completed backend rebuild reloads only the app and retains its page and sample', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const key =
      window === window.top
        ? 'cfm-preview-shell-loads'
        : 'cfm-preview-app-loads';
    sessionStorage.setItem(
      key,
      String(Number(sessionStorage.getItem(key) || 0) + 1),
    );
  });
  await page.goto('/__cfm-preview');
  await ready(page);
  const app = page.frameLocator('#app');
  await app
    .getByTestId('sidebar-primary-buttons')
    .getByRole('link', { name: 'Balances', exact: true })
    .click();
  await expect(app.getByLabel('Manual account', { exact: true })).toBeVisible();
  const id = await page
    .frames()[1]
    .evaluate(async () => (await window.$send('load-prefs')).id);
  const loads = await page.evaluate(() => ({
    shell: Number(sessionStorage.getItem('cfm-preview-shell-loads')),
    app: Number(sessionStorage.getItem('cfm-preview-app-loads')),
  }));
  const source = path.resolve(
    __dirname,
    '../../loot-core/src/server/cfm/store.ts',
  );
  const original = await stat(source);
  try {
    // Trigger the real watcher without changing source contents.
    await utimes(source, original.atime, new Date());
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(sessionStorage.getItem('cfm-preview-app-loads')),
          ),
        { timeout: 30000 },
      )
      .toBe(loads.app + 1);
    await ready(page);
    await expect(
      app.getByLabel('Manual account', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        Number(sessionStorage.getItem('cfm-preview-shell-loads')),
      ),
    ).toBe(loads.shell);
    expect(
      await page
        .frames()[1]
        .evaluate(async () => (await window.$send('load-prefs')).id),
    ).toBe(id);
  } finally {
    await utimes(source, original.atime, original.mtime);
    // Let the restoration rebuild settle before the next browser check starts.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Number(sessionStorage.getItem('cfm-preview-app-loads')),
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThanOrEqual(loads.app + 2);
    await ready(page);
  }
});
