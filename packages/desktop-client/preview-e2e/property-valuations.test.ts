import { expect, test } from '@playwright/test';

test('property source links and manual estimates determine a persistent averaged asset balance', async ({
  page,
  context,
}, testInfo) => {
  await context.route('https://tax.example/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Synthetic valuation source</h1>',
    }),
  );
  await page.goto('/__cfm-preview');
  await expect(page.getByRole('status')).toContainText('Sample ready', {
    timeout: 60000,
  });
  const app = page.frameLocator('#app');
  const sidebar = app.getByTestId('sidebar-primary-buttons');
  await sidebar.getByRole('link', { name: 'Balances', exact: true }).click();
  await app
    .getByLabel('Account name', { exact: true })
    .fill('Source-valued home');
  await app.getByLabel('Account type', { exact: true }).selectOption('asset');
  await app.getByLabel('Opening balance', { exact: true }).fill('300000');
  await app
    .getByRole('button', { name: 'Create tracking account', exact: true })
    .click();
  await sidebar.getByRole('link', { name: 'Assets', exact: true }).click();
  await app
    .getByLabel('Asset account', { exact: true })
    .selectOption({ label: 'Source-valued home' });
  await app.getByLabel('Acquisition date', { exact: true }).fill('2026-10-31');
  await app.getByLabel('Acquisition value', { exact: true }).fill('300000');
  await app
    .getByLabel('Policy effective date', { exact: true })
    .fill('2026-10-31');
  await app
    .getByLabel('Valuation method', { exact: true })
    .selectOption('source-average');
  await app.getByRole('button', { name: 'Save asset', exact: true }).click();
  const sources = app
    .getByRole('heading', {
      name: 'Property and asset valuation sources',
      exact: true,
    })
    .locator('..');
  await sources
    .getByLabel('Asset for valuation sources', { exact: true })
    .selectOption({ label: 'Source-valued home' });
  for (const [name, value, url] of [
    ['Tax assessment', '280000', 'https://tax.example/home'],
    ['Zillow estimate', '330000', 'https://zillow.example/home'],
    ['Redfin estimate', '320000', 'https://redfin.example/home'],
  ]) {
    await sources
      .getByLabel('Valuation source name', { exact: true })
      .fill(name);
    await sources.getByLabel('Valuation source URL').fill(url);
    await sources.getByLabel('Source estimate').fill(value);
    await sources
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    await expect(
      sources.getByRole('row').filter({ hasText: name }).first(),
    ).toContainText('Included');
  }
  await expect(
    sources.getByText('310,000.00', { exact: true }).first(),
  ).toBeVisible();
  const link = sources.getByRole('link', {
    name: 'Open Tax assessment',
    exact: true,
  });
  await expect(link).toHaveAttribute('href', 'https://tax.example/home');
  await expect(link).toHaveAttribute('rel', /noopener/);
  const popupEvent = page.waitForEvent('popup');
  await link.click();
  const popup = await popupEvent;
  await expect(
    popup.getByRole('heading', { name: 'Synthetic valuation source' }),
  ).toBeVisible();
  await popup.close();
  await sources
    .getByRole('row')
    .filter({ hasText: 'Tax assessment' })
    .first()
    .getByRole('button', { name: 'Update source', exact: true })
    .click();
  await sources.getByLabel('Source estimate').fill('310000');
  await sources
    .getByRole('button', { name: 'Save source', exact: true })
    .click();
  await expect(
    sources.getByText('320,000.00', { exact: true }).first(),
  ).toBeVisible();
  await sources.getByText('Source estimate history', { exact: true }).click();
  await expect(sources.getByText('280,000.00', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('property-valuation-sources.png'),
    fullPage: true,
  });
  const stored = await page.frames()[1].evaluate(async () => {
    const state = await window.$send('cfm-get-state');
    const asset = state.records.find(
      record =>
        record.kind === 'asset' && record.data.name === 'Source-valued home',
    )!;
    return {
      balance: state.transactions
        .filter(row => row.account === asset.data.accountId && !row.is_parent)
        .reduce((total, row) => total + row.amount, 0),
      asset,
    };
  });
  expect(stored.balance).toBe(32000000);
  expect(stored.asset.data.valuationSources).toHaveLength(3);
  const frame = page.frames()[1];
  await frame.goto(frame.url());
  await sources
    .getByLabel('Asset for valuation sources', { exact: true })
    .selectOption({ label: 'Source-valued home' });
  await expect(
    sources.getByText('320,000.00', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    sources.getByRole('link', { name: 'Open Tax assessment', exact: true }),
  ).toHaveAttribute('href', 'https://tax.example/home');
});
