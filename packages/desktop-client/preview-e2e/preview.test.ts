import { expect, test } from '@playwright/test';

test('sample preview supports the financial navigation, shared categories, themes, persistence, and safe reset', async ({
  page,
}, testInfo) => {
  await page.goto('/__cfm-preview');
  const app = page.frameLocator('#app');
  await expect(page.getByRole('status')).toContainText('Sample ready', {
    timeout: 60000,
  });
  const workspace = app.locator('[data-cfm-workspace]');
  await expect(workspace).toBeVisible();
  await expect(app.getByLabel('As of date')).toHaveValue('2026-10-31');
  await expect(
    app.getByRole('row').filter({ hasText: 'Property' }).first(),
  ).toBeVisible();
  await expect(
    app.getByRole('heading', { name: 'Actual CFM', exact: true }),
  ).toHaveCount(0);
  for (const name of [
    'Refresh',
    'Export for Actual Budget',
    'Monthly budget and ledger',
  ]) {
    await expect(
      workspace.getByRole('button', { name, exact: true }),
    ).toHaveCount(0);
  }
  await expect(app.getByLabel('Manual account', { exact: true })).toHaveCount(
    0,
  );
  const sidebar = app.getByTestId('sidebar-primary-buttons');
  await expect(sidebar.getByRole('link')).toHaveText([
    'Summary',
    'Financial position',
    'Liquidity',
    'Reports',
    'Balances',
    'Planning',
    'Settings',
  ]);
  const frame = page.frames()[1];
  await frame.evaluate(() => document.fonts.load('400 14px Geologica'));
  expect(
    await frame.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain('Geologica');
  await page.screenshot({ path: testInfo.outputPath('preview-desktop.png') });

  await sidebar.getByRole('link', { name: 'Liquidity', exact: true }).click();
  await expect(
    app.getByRole('button', { name: 'Calculate projection', exact: true }),
  ).toBeVisible();
  await sidebar.getByRole('link', { name: 'Balances', exact: true }).click();
  await expect(app.getByLabel('Manual account', { exact: true })).toBeVisible();
  await expect(
    app.getByRole('button', { name: 'Create tracking account' }),
  ).toBeVisible();
  await sidebar.getByRole('link', { name: 'Assets', exact: true }).click();
  await expect(
    app.getByRole('option', {
      name: 'Straight-line depreciation / amortization',
      exact: true,
    }),
  ).toHaveCount(1);
  await sidebar
    .getByRole('link', { name: 'Accounts receivable', exact: true })
    .click();
  await expect(app.getByLabel('Counterparty', { exact: true })).toBeVisible();
  await expect(app.getByLabel('Direction', { exact: true })).toHaveCount(0);
  await sidebar
    .getByRole('link', { name: 'Accounts payable', exact: true })
    .click();
  await expect(
    app.getByRole('heading', { name: 'Accounts payable', exact: true }),
  ).toBeVisible();

  await sidebar.getByRole('link', { name: 'Planning', exact: true }).click();
  await expect(
    app.getByRole('cell', { name: /Annual insurance/ }).first(),
  ).toBeVisible();
  const categoryId = await frame.evaluate(async () => {
    const groups = await window.$send('api/category-groups-get', {});
    const group = groups.find(group => !group.is_income);
    if (!group) throw new Error('Missing expense category group');
    return window.$send('api/category-create', {
      category: { name: 'Shared category preview', group_id: group.id },
    });
  });
  // Re-enter to load the same category IDs used by the native monthly budget.
  await sidebar.getByRole('link', { name: 'Summary', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Planning', exact: true }).click();
  await app.getByLabel('Category', { exact: true }).selectOption(categoryId);
  await app.getByLabel('Annual amount', { exact: true }).fill('1200');
  await app
    .getByRole('button', { name: 'Save annual plan', exact: true })
    .click();
  await expect(
    app.getByRole('row').filter({ hasText: 'Shared category preview' }),
  ).toContainText('1,200.00');
  const savedId = await frame.evaluate(async id => {
    const state = await window.$send('cfm-get-state');
    return state.records.find(
      record => record.kind === 'annual-plan' && record.data.categoryId === id,
    )?.data.categoryId;
  }, categoryId);
  expect(savedId).toBe(categoryId);
  // A compatible export must leave the open browser ledger editable.
  await frame.evaluate(async () => {
    await window.$send('cfm-export-upstream', {});
  });
  await frame.evaluate(
    id =>
      window.$send('api/category-update', {
        id,
        fields: { name: 'Renamed shared category' },
      }),
    categoryId,
  );
  await sidebar
    .getByRole('link', { name: 'Monthly budget', exact: true })
    .click();
  await expect(
    app.getByText('Renamed shared category', { exact: true }).first(),
  ).toBeVisible();
  await sidebar
    .getByRole('link', { name: 'Annual budget', exact: true })
    .click();
  await expect(
    app.getByRole('row').filter({ hasText: 'Renamed shared category' }),
  ).toContainText('1,200.00');
  await expect(
    app.getByLabel('Category', { exact: true }).locator('option:checked'),
  ).not.toHaveText('Shared category preview');

  await sidebar.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(app.locator('[data-cfm-workspace]')).toHaveCount(0);
  await sidebar
    .getByRole('link', { name: 'Report packages', exact: true })
    .click();
  await expect(
    app.getByRole('button', { name: 'Print / save PDF' }),
  ).toBeVisible();
  await sidebar.getByRole('link', { name: 'Settings', exact: true }).click();
  const settings = app.getByRole('navigation', {
    name: 'Settings',
    exact: true,
  });
  await expect(settings.getByRole('link')).toHaveText([
    'General',
    'Automation',
    'Schedules',
    'Payees',
    'Tags',
    'Rules',
    'Bank Sync',
    'Advanced',
    'Experimental',
  ]);
  await expect(
    app.getByRole('button', { name: 'Export for Actual Budget', exact: true }),
  ).toBeVisible();
  await settings.getByRole('link', { name: 'Automation', exact: true }).click();
  await expect(
    app.getByLabel('Scheduler device / worker ID', { exact: true }),
  ).toBeVisible();
  await settings.getByRole('link', { name: 'Schedules', exact: true }).click();
  await expect(
    app.getByRole('button', { name: 'Add new schedule', exact: true }),
  ).toBeVisible();
  await sidebar.getByRole('link', { name: 'Summary', exact: true }).click();

  for (const theme of ['dark', 'midnight']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await expect(app.locator('[data-theme]')).toHaveAttribute(
      'data-theme',
      theme,
    );
  }
  await page.getByLabel('Screen size').selectOption('390');
  await expect.poll(() => frame.evaluate(() => window.innerWidth)).toBe(390);
  await expect(sidebar).toBeHidden();
  await expect(app.getByLabel('Section', { exact: true })).toBeVisible();
  await app
    .getByLabel('Section', { exact: true })
    .selectOption('/summary/liquidity');
  await expect(
    app.getByRole('button', { name: 'Calculate projection', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('preview-phone-midnight.png'),
  });
  await page.getByLabel('Screen size').selectOption('full');
  await expect(sidebar).toBeVisible();

  const original = await frame.evaluate(async () => {
    const prefs = await window.$send('load-prefs');
    await window.$send('save-prefs', {
      budgetName: 'Renamed preview test sample',
    });
    return prefs.id;
  });
  // A renamed file must never be deleted by resetting the synthetic sample.
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await expect(page.getByRole('status')).toContainText('Sample ready', {
    timeout: 30000,
  });
  const files = await page
    .frames()[1]
    .evaluate(() => window.$send('get-budgets'));
  expect(
    files.some(
      file =>
        file.id === original && file.name === 'Renamed preview test sample',
    ),
  ).toBe(true);
  const sample = files.find(file => file.name === 'Actual CFM example — 2026');
  expect(sample).toBeDefined();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Sample ready', {
    timeout: 30000,
  });
  const loaded = await page.frames()[1].evaluate(async () => ({
    prefs: await window.$send('load-prefs'),
    server: await window.$send('get-server-url'),
  }));
  expect(loaded.prefs.id).toBe(sample?.id);
  expect(loaded.prefs.cloudFileId).toBeFalsy();
  expect(loaded.server).toBeNull();
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await expect(page.getByRole('status')).toContainText('Sample ready', {
    timeout: 30000,
  });
  const resetFiles = await page
    .frames()[1]
    .evaluate(() => window.$send('get-budgets'));
  expect(resetFiles.some(file => file.id === sample?.id)).toBe(false);
  expect(resetFiles.some(file => file.id === original)).toBe(true);
});
