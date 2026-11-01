import { describe, expect, it } from 'vitest';

import {
  createReportRun,
  exportReportCsv,
  getReportDocuments,
  renderReportHtml,
  resolveReportPeriod,
  serializeReportRun,
  validateReportTemplate,
} from './cfm-reports';
import type { CfmReportSection, CfmReportTemplate } from './cfm-reports';

function fixture() {
  const template: CfmReportTemplate = {
    name: 'Annual position',
    revision: 1,
    period: 'annual',
    sections: [
      { id: 'balance', type: 'balance-sheet', title: 'Assets & liabilities' },
    ],
  };
  const section: CfmReportSection = {
    id: 'balance',
    type: 'balance-sheet',
    title: 'unused resolver title',
    columns: [
      { key: 'name', label: 'Account', format: 'text' },
      { key: 'amount', label: 'Balance', format: 'money' },
    ],
    rows: [{ name: 'Checking', amount: 123456 }],
    totals: { name: 'Total', amount: 123456 },
  };
  const run = createReportRun({
    id: 'run-1',
    templateId: 'template-1',
    template,
    asOf: '2026-10-31',
    timeZone: 'America/Chicago',
    currency: 'USD',
    createdAt: '2026-10-31T18:00:00.000Z',
    resolveSection: () => section,
  });
  return { template, section, run };
}

describe('CFM report archives', () => {
  it('freezes the selected template and materialized figures rather than retaining live references', () => {
    const { template, section, run } = fixture();
    template.name = 'Changed';
    template.revision = 2;
    section.rows[0] = { name: 'Changed', amount: 999999 };
    expect(run.name).toBe('Annual position');
    expect(run.templateRevision).toBe(1);
    expect(run.sections[0]?.rows).toEqual([
      { name: 'Checking', amount: 123456 },
    ]);
    expect(Object.isFrozen(run.sections[0]?.rows)).toBe(true);
    expect(serializeReportRun(run)).toContain('123456');
  });

  it('resolves seasonal partial periods and rejects impossible/future actual cutoffs', () => {
    expect(resolveReportPeriod('quarterly', '2026-08-14')).toEqual({
      kind: 'quarterly',
      asOf: '2026-08-14',
      startDate: '2026-07-01',
      endDate: '2026-08-14',
    });
    expect(resolveReportPeriod('monthly', '2024-02-29').startDate).toBe(
      '2024-02-01',
    );
    expect(() => resolveReportPeriod('monthly', '2023-02-29')).toThrow(
      'Invalid report date',
    );
    expect(() =>
      resolveReportPeriod('custom', '2026-10-31', '2026-10-01', '2026-11-01'),
    ).toThrow('cannot end after');
    expect(() => resolveReportPeriod('custom', '2026-10-31')).toThrow(
      'requires a start',
    );
  });

  it('rejects invalid section definitions and duplicate IDs', () => {
    const { template } = fixture();
    expect(() =>
      validateReportTemplate({
        ...template,
        sections: [template.sections[0], template.sections[0]],
      }),
    ).toThrow('unique');
    expect(() =>
      validateReportTemplate({
        ...template,
        sections: [{ id: 's', title: 's', type: 'script' }],
      }),
    ).toThrow('Invalid report section');
  });

  it('escapes user-controlled text and prints all table rows with explicit date/currency metadata', () => {
    const { template, section } = fixture();
    template.name = '<script>alert(1)</script>';
    section.rows = [{ name: '<img src=x onerror=alert(1)>', amount: -12345 }];
    const run = createReportRun({
      id: 'run-2',
      templateId: 'template-1',
      template,
      asOf: '2026-10-31',
      timeZone: 'UTC',
      currency: 'USD',
      createdAt: '2026-10-31T00:00:00Z',
      warnings: ['Stale <bank>'],
      resolveSection: () => section,
    });
    const html = renderReportHtml(run);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Stale &lt;bank&gt;');
    expect(html).toContain('-$123.45');
    expect(html).toContain('2026-10-31');
    expect(html).toContain('@page');
    expect(html).toContain('table-header-group');
  });

  it('exports raw decimal monetary values and quotes CSV text while blocking formulas', () => {
    const { run } = fixture();
    const copy = JSON.parse(serializeReportRun(run));
    copy.sections[0].rows = [
      { name: '=HYPERLINK("bad")', amount: -12345 },
      { name: 'One, two\nthree', amount: 0 },
    ];
    const csv = exportReportCsv(copy);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('-123.45');
    expect(csv).toContain('"One, two\nthree",0.00');
    expect(() => exportReportCsv(run, 'missing')).toThrow('not found');
  });

  it('keeps archives deterministic and rejects non-finite or fractional money', () => {
    const { run, template, section } = fixture();
    expect(getReportDocuments(run)).toEqual(getReportDocuments(run));
    section.rows = [{ name: 'Invalid', amount: 0.2 }];
    expect(() =>
      createReportRun({
        id: 'invalid',
        templateId: 't',
        template,
        asOf: '2026-10-31',
        timeZone: 'UTC',
        currency: 'USD',
        createdAt: '2026-10-31',
        resolveSection: () => section,
      }),
    ).toThrow('integer minor units');
  });

  it('renders accessible bar/line/pie charts with tables retaining all values', () => {
    for (const kind of ['bar', 'line', 'pie'] as const) {
      const template: CfmReportTemplate = {
        name: 'Chart',
        revision: 1,
        period: 'monthly',
        sections: [{ id: 'chart', type: 'chart', title: 'By category' }],
      };
      const run = createReportRun({
        id: 'chart-run',
        templateId: 'chart-template',
        template,
        asOf: '2026-10-31',
        timeZone: 'UTC',
        currency: 'USD',
        createdAt: '2026-10-31',
        resolveSection: () => ({
          id: 'chart',
          type: 'chart',
          title: 'By category',
          columns: [
            { key: 'name', label: 'Name', format: 'text' },
            { key: 'value', label: 'Amount', format: 'money' },
          ],
          rows: [
            { name: 'Food', value: 12000 },
            { name: 'Insurance', value: 24000 },
          ],
          chart: { kind, xKey: 'name', valueKeys: ['value'] },
        }),
      });
      const html = renderReportHtml(run);
      expect(html).toContain('<svg');
      expect(html).toContain('role="img"');
      expect(html).toContain('Insurance');
      expect(html).toContain('$240.00');
    }
  });
});
