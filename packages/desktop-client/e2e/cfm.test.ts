import { readFile } from 'node:fs/promises';

import { safeUnzip } from '@actual-app/core/server/util/zip';
import type { Download } from '@playwright/test';

import { expect, test } from './fixtures';

test('CFM workspace posts an observed balance, retains annual plans, and archives a report', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.waitForURL(/\/(budget|cfm|summary)/);
  await page.goto('/balances');
  await expect(page.getByLabel('Account name', { exact: true })).toBeVisible();
  await page
    .getByLabel('Account name', { exact: true })
    .fill('CFM test property');
  await page.getByLabel('Account type', { exact: true }).selectOption('asset');
  await page.getByLabel('Opening balance', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create tracking account' }).click();
  await page
    .getByLabel('Manual account', { exact: true })
    .selectOption({ label: 'CFM test property' });
  await page.getByLabel('Target balance', { exact: true }).fill('1200');
  await page.getByLabel('Reason', { exact: true }).fill('Appraisal');
  await page.getByRole('button', { name: 'Record balance adjustment' }).click();
  await page.getByRole('link', { name: 'Summary', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'CFM test property' }).first(),
  ).toContainText('1,200.00');
  await page.getByRole('link', { name: 'Planning', exact: true }).click();
  const category = page.getByLabel('Category', { exact: true });
  await category.selectOption({ index: 1 });
  await page.getByLabel('Annual amount', { exact: true }).fill('1200');
  await page
    .getByRole('button', { name: 'Save annual plan', exact: true })
    .click();
  await expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await page
    .getByRole('link', { name: 'Report packages', exact: true })
    .click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Annual acceptance report');
  await page
    .getByRole('button', { name: 'Add Balance sheet', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Save template', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Generate and archive', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Print / save PDF', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Print / save PDF', exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  const file = await (await download).path();
  if (!file) throw new Error('Report download was not created');
  const html = await readFile(file, 'utf8');
  expect(html).toContain('CFM test property');
  expect(html).toContain('font-family:Geologica');
  expect(html).toContain('SIL OPEN FONT LICENSE');
  expect(html).toContain('data:font/ttf;base64,');
  const printPage = await page.context().newPage();
  await printPage.setContent(html);
  await printPage.evaluate(() => document.fonts.ready);
  await printPage.pdf({
    path: testInfo.outputPath('report-preview.pdf'),
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  await printPage.screenshot({
    path: testInfo.outputPath('report-preview.png'),
    fullPage: true,
  });
  await printPage.close();
  await page.getByRole('link', { name: 'Summary', exact: true }).click();
  for (const theme of ['auto', 'dark', 'midnight'] as const) {
    await page.evaluate(theme => window.Actual.setTheme(theme), theme);
    await expect(page.locator('[data-theme]')).toHaveAttribute(
      'data-theme',
      theme,
    );
    await page.screenshot({
      path: testInfo.outputPath(`cfm-${theme}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const downloads: Download[] = [];
  const collect = (download: Download) => downloads.push(download);
  page.on('download', collect);
  await page
    .getByRole('button', { name: 'Export for Actual Budget', exact: true })
    .click();
  await expect.poll(() => downloads.length, { timeout: 20000 }).toBe(2);
  page.off('download', collect);
  const upstreamDownload = downloads.find(download =>
    download.suggestedFilename().includes('for-Actual-Budget'),
  );
  const archiveDownload = downloads.find(download =>
    download.suggestedFilename().includes('CFM-recovery'),
  );
  const upstreamPath = await upstreamDownload?.path(),
    archivePath = await archiveDownload?.path();
  if (!upstreamPath || !archivePath) {
    throw new Error('Both portability files must be downloaded');
  }
  expect(safeUnzip(await readFile(upstreamPath))['db.sqlite']).toBeDefined();
  const recovery = safeUnzip(await readFile(archivePath));
  const receipt = JSON.parse(
    new TextDecoder().decode(recovery['receipt.json']),
  );
  expect(receipt.targetVersion).toBe('26.10.0');
  expect(
    receipt.accounts.some(
      (account: { balance: number }) => account.balance === 120000,
    ),
  ).toBe(true);
  expect(recovery['full-cfm-backup.zip']).toBeDefined();
});

test('receivables can be updated, partially settled, and written off from the workspace', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.waitForURL(/\/(budget|cfm|summary)/);
  await page.goto('/balances');
  await page
    .getByLabel('Account name', { exact: true })
    .fill('CFM receivables');
  await page
    .getByLabel('Account type', { exact: true })
    .selectOption('receivable');
  await page.getByRole('button', { name: 'Create tracking account' }).click();
  await page
    .getByRole('link', { name: 'Accounts receivable', exact: true })
    .click();
  await page.getByLabel('Counterparty', { exact: true }).fill('Test friend');
  await page
    .getByLabel('Control account', { exact: true })
    .selectOption({ label: 'CFM receivables' });
  await page.getByLabel('Original amount', { exact: true }).fill('100');
  await page.getByLabel('Effective date', { exact: true }).fill('2026-10-31');
  await page
    .getByLabel('Expense / loss category', { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole('button', { name: 'Create obligation', exact: true })
    .click();
  const row = page.getByRole('row').filter({ hasText: 'Test friend' }).first();
  await expect(row).toContainText('100.00');
  await row
    .getByRole('button', { name: 'Update details', exact: true })
    .click();
  await page
    .getByLabel('Expected collection date', { exact: true })
    .fill('2026-11-05');
  await page
    .getByRole('button', { name: 'Save obligation details', exact: true })
    .click();
  await expect(row).toContainText('2026-11-05');
  await row
    .getByRole('button', { name: 'Settle / write off', exact: true })
    .click();
  await page.getByLabel('Amount', { exact: true }).fill('30');
  await page.getByLabel('Date', { exact: true }).fill('2026-10-31');
  await page
    .getByLabel('Payment / adjustment account', { exact: true })
    .selectOption({ label: 'Bank of America' });
  await page
    .getByRole('button', { name: 'Record settlement', exact: true })
    .click();
  await expect(row).toContainText('70.00');
  await page.getByLabel('Action', { exact: true }).selectOption('writeoff');
  await page.getByLabel('Amount', { exact: true }).fill('20');
  await page
    .getByLabel('Reason / notes', { exact: true })
    .fill('Uncollectible portion');
  await page
    .getByRole('button', { name: 'Record settlement', exact: true })
    .click();
  await expect(row).toContainText('50.00');
});
