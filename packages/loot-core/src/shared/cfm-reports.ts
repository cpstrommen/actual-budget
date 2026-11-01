export const CFM_REPORT_VERSION = 1;
export const CFM_CALCULATION_VERSION = 'cfm-1';

export type CfmReportPeriod =
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'ytd'
  | 'custom';
export type CfmReportSectionType =
  | 'balance-sheet'
  | 'annual-plan'
  | 'liquidity'
  | 'assets'
  | 'obligations'
  | 'table'
  | 'chart';
export type CfmReportCell = string | number | boolean | null;
export type CfmReportSectionDefinition = {
  id: string;
  type: CfmReportSectionType;
  title: string;
  source?:
    | 'accounts'
    | 'transactions'
    | 'categories'
    | 'assets'
    | 'obligations';
  accountIds?: string[];
  categoryIds?: string[];
  chartType?: 'bar' | 'line' | 'pie';
  xKey?: string;
  valueKeys?: string[];
};
export type CfmReportTemplate = {
  name: string;
  revision: number;
  period: CfmReportPeriod;
  sections: CfmReportSectionDefinition[];
  notes?: string;
  autoGenerate?: {
    enabled: boolean;
    cadence: 'monthly' | 'quarterly' | 'annual';
  };
};
export type CfmReportColumn = {
  key: string;
  label: string;
  format: 'text' | 'money' | 'number' | 'date' | 'percent';
};
export type CfmReportSection = {
  id: string;
  type: CfmReportSectionType;
  title: string;
  columns: CfmReportColumn[];
  rows: Record<string, CfmReportCell>[];
  totals?: Record<string, CfmReportCell>;
  chart?: { kind: 'bar' | 'line' | 'pie'; xKey: string; valueKeys: string[] };
  notes?: string[];
};
export type CfmResolvedReportPeriod = {
  kind: CfmReportPeriod;
  asOf: string;
  startDate: string;
  endDate: string;
};
export type CfmReportRun = {
  id: string;
  version: number;
  templateId: string;
  templateRevision: number;
  name: string;
  createdAt: string;
  asOf: string;
  startDate: string;
  endDate: string;
  period: CfmReportPeriod;
  timeZone: string;
  currency: string;
  calculationVersion: string;
  template: CfmReportTemplate;
  sections: CfmReportSection[];
  warnings: string[];
  assumptions: string[];
  sourceUpdatedAt?: string;
};
export type CreateCfmReportRunOptions = {
  id: string;
  templateId: string;
  template: CfmReportTemplate;
  asOf: string;
  startDate?: string;
  endDate?: string;
  timeZone: string;
  currency: string;
  createdAt: string;
  sourceUpdatedAt?: string;
  warnings?: string[];
  assumptions?: string[];
  resolveSection: (
    definition: CfmReportSectionDefinition,
    period: CfmResolvedReportPeriod,
  ) => CfmReportSection;
};

export function isReportDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function assertDate(value: string): void {
  if (!isReportDate(value)) {
    throw new Error(`Invalid report date: ${String(value)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validStrings(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every(item => typeof item === 'string'))
  );
}

export function validateReportTemplate(value: unknown): CfmReportTemplate {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    !value.name.trim()
  ) {
    throw new Error('A report template needs a name');
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1) {
    throw new Error('A report template needs a positive revision');
  }
  const periods: string[] = ['monthly', 'quarterly', 'annual', 'ytd', 'custom'];
  if (typeof value.period !== 'string' || !periods.includes(value.period)) {
    throw new Error('Invalid report period');
  }
  if (
    !Array.isArray(value.sections) ||
    value.sections.length === 0 ||
    value.sections.length > 100
  ) {
    throw new Error('A report needs between 1 and 100 sections');
  }
  const seen = new Set<string>();
  const sectionTypes: string[] = [
    'balance-sheet',
    'annual-plan',
    'liquidity',
    'assets',
    'obligations',
    'table',
    'chart',
  ];
  const sources: string[] = [
    'accounts',
    'transactions',
    'categories',
    'assets',
    'obligations',
  ];
  const sections: CfmReportSectionDefinition[] = value.sections.map(section => {
    if (
      !isRecord(section) ||
      typeof section.id !== 'string' ||
      !section.id ||
      seen.has(section.id)
    ) {
      throw new Error('Report section IDs must be present and unique');
    }
    seen.add(section.id);
    if (
      typeof section.type !== 'string' ||
      !sectionTypes.includes(section.type)
    ) {
      throw new Error('Invalid report section type');
    }
    if (typeof section.title !== 'string' || !section.title.trim()) {
      throw new Error('A report section needs a title');
    }
    if (
      section.source !== undefined &&
      (typeof section.source !== 'string' || !sources.includes(section.source))
    ) {
      throw new Error('Invalid report data source');
    }
    if (
      section.chartType !== undefined &&
      !['bar', 'line', 'pie'].includes(String(section.chartType))
    ) {
      throw new Error('Invalid chart type');
    }
    if (section.xKey !== undefined && typeof section.xKey !== 'string') {
      throw new Error('Invalid chart x-axis key');
    }
    if (
      ![section.accountIds, section.categoryIds, section.valueKeys].every(
        validStrings,
      )
    ) {
      throw new Error('Invalid report filter or chart series');
    }
    // Validation above restricts all supplied values; keep the public typed shape.
    return {
      id: section.id,
      type: section.type as CfmReportSectionType,
      title: section.title,
      ...(typeof section.source === 'string'
        ? { source: section.source as CfmReportSectionDefinition['source'] }
        : {}),
      ...(Array.isArray(section.accountIds)
        ? {
            accountIds: section.accountIds.filter(
              (id): id is string => typeof id === 'string',
            ),
          }
        : {}),
      ...(Array.isArray(section.categoryIds)
        ? {
            categoryIds: section.categoryIds.filter(
              (id): id is string => typeof id === 'string',
            ),
          }
        : {}),
      ...(typeof section.chartType === 'string'
        ? { chartType: section.chartType as 'bar' | 'line' | 'pie' }
        : {}),
      ...(typeof section.xKey === 'string' ? { xKey: section.xKey } : {}),
      ...(Array.isArray(section.valueKeys)
        ? {
            valueKeys: section.valueKeys.filter(
              (id): id is string => typeof id === 'string',
            ),
          }
        : {}),
    };
  });
  let autoGenerate: CfmReportTemplate['autoGenerate'];
  if (value.autoGenerate !== undefined) {
    const auto = value.autoGenerate;
    if (
      !isRecord(auto) ||
      typeof auto.enabled !== 'boolean' ||
      !['monthly', 'quarterly', 'annual'].includes(String(auto.cadence))
    ) {
      throw new Error('Invalid report generation schedule');
    }
    autoGenerate = {
      enabled: auto.enabled,
      cadence: auto.cadence as 'monthly' | 'quarterly' | 'annual',
    };
  }
  if (value.notes !== undefined && typeof value.notes !== 'string') {
    throw new Error('Invalid report notes');
  }
  return {
    name: value.name.trim(),
    revision: Number(value.revision),
    period: value.period as CfmReportPeriod,
    sections,
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    ...(autoGenerate ? { autoGenerate } : {}),
  };
}

export function resolveReportPeriod(
  kind: CfmReportPeriod,
  asOf: string,
  startDate?: string,
  endDate?: string,
): CfmResolvedReportPeriod {
  assertDate(asOf);
  const year = asOf.slice(0, 4);
  const month = Number(asOf.slice(5, 7));
  let start: string;
  if (kind === 'custom') {
    if (!startDate || !endDate) {
      throw new Error('A custom report requires a start and end date');
    }
    start = startDate;
  } else if (kind === 'monthly') {
    start = `${year}-${String(month).padStart(2, '0')}-01`;
  } else if (kind === 'quarterly') {
    start = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  } else {
    start = `${year}-01-01`;
  }
  const end = endDate ?? asOf;
  if (startDate) start = startDate;
  assertDate(start);
  assertDate(end);
  if (start > end) {
    throw new Error('The report start date must not be after its end date');
  }
  if (end > asOf) {
    throw new Error(
      'Posted financial reports cannot end after their as-of date; use a forecast section for projections',
    );
  }
  return { kind, asOf, startDate: start, endDate: end };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function validateMaterializedSection(
  section: CfmReportSection,
  definition: CfmReportSectionDefinition,
): void {
  if (section.id !== definition.id || section.type !== definition.type) {
    throw new Error('Report section resolver returned the wrong section');
  }
  if (
    !Array.isArray(section.columns) ||
    section.columns.length === 0 ||
    !Array.isArray(section.rows)
  ) {
    throw new Error('A materialized report section needs columns and rows');
  }
  const keys = new Set<string>();
  for (const column of section.columns) {
    if (
      !column.key ||
      keys.has(column.key) ||
      typeof column.label !== 'string' ||
      !['text', 'money', 'number', 'date', 'percent'].includes(column.format)
    ) {
      throw new Error('Invalid materialized report column');
    }
    keys.add(column.key);
  }
  for (const row of [
    ...section.rows,
    ...(section.totals ? [section.totals] : []),
  ]) {
    for (const [key, cell] of Object.entries(row)) {
      if (!keys.has(key)) {
        throw new Error(`Report result contains an undeclared column: ${key}`);
      }
      if (
        cell !== null &&
        !['string', 'number', 'boolean'].includes(typeof cell)
      ) {
        throw new Error('Invalid report cell');
      }
      if (typeof cell === 'number' && !Number.isFinite(cell)) {
        throw new Error('Report cells must contain finite numbers');
      }
      const column = section.columns.find(item => item.key === key);
      if (
        typeof cell === 'number' &&
        column?.format === 'money' &&
        !Number.isSafeInteger(cell)
      ) {
        throw new Error('Report money must use integer minor units');
      }
    }
  }
  if (section.chart) {
    if (
      !keys.has(section.chart.xKey) ||
      section.chart.valueKeys.some(key => !keys.has(key))
    ) {
      throw new Error('Report chart refers to missing columns');
    }
    for (const row of section.rows) {
      for (const key of section.chart.valueKeys) {
        if (typeof row[key] !== 'number') {
          throw new Error('Report chart values must be numeric');
        }
      }
    }
  }
}

export function createReportRun(
  options: CreateCfmReportRunOptions,
): CfmReportRun {
  if (!options.id || !options.templateId) {
    throw new Error('Report run and template IDs are required');
  }
  if (!Number.isFinite(new Date(options.createdAt).getTime())) {
    throw new Error('Invalid report creation timestamp');
  }
  new Intl.DateTimeFormat('en-US', { timeZone: options.timeZone });
  if (!/^[A-Z]{3}$/.test(options.currency)) {
    throw new Error('A report needs one ISO currency');
  }
  const template = validateReportTemplate(options.template);
  const period = resolveReportPeriod(
    template.period,
    options.asOf,
    options.startDate,
    options.endDate,
  );
  const sections = template.sections.map(definition => {
    const section = options.resolveSection(
      cloneJson(definition),
      cloneJson(period),
    );
    validateMaterializedSection(section, definition);
    return cloneJson({ ...section, title: definition.title });
  });
  return freezeDeep({
    id: options.id,
    version: CFM_REPORT_VERSION,
    templateId: options.templateId,
    templateRevision: template.revision,
    name: template.name,
    createdAt: options.createdAt,
    ...period,
    period: period.kind,
    timeZone: options.timeZone,
    currency: options.currency,
    calculationVersion: CFM_CALCULATION_VERSION,
    template: cloneJson(template),
    sections,
    warnings: [...(options.warnings ?? [])],
    assumptions: [...(options.assumptions ?? [])],
    ...(options.sourceUpdatedAt
      ? { sourceUpdatedAt: options.sourceUpdatedAt }
      : {}),
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCell(
  value: CfmReportCell | undefined,
  column: CfmReportColumn,
  currency: string,
): string {
  if (value === null || value === undefined) return '';
  if (column.key === 'group' && typeof value === 'string') {
    const labels: Record<string, string> = {
      liquidity: 'Liquidity',
      equities: 'Equities / investments',
      'other-assets': 'Other assets',
      'current-liabilities': 'Current liabilities',
      'long-term-liabilities': 'Long-term liabilities',
    };
    return labels[value] || value;
  }
  if (typeof value !== 'number') return String(value);
  if (column.format === 'money') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value / 100);
  }
  if (column.format === 'percent') {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(
    value,
  );
}

const CHART_COLORS = [
  '#444444',
  '#147d64',
  '#1980d4',
  '#b88115',
  '#ab091e',
  '#747474',
];

function renderChart(section: CfmReportSection, currency: string): string {
  const chart = section.chart;
  if (!chart || !section.rows.length || !chart.valueKeys.length) return '';
  const rows = section.rows;
  const values = rows.flatMap(row =>
    chart.valueKeys.map(key => Number(row[key] ?? 0)),
  );
  const maximum = Math.max(0, ...values);
  const minimum = Math.min(0, ...values);
  const range = maximum - minimum || 1;
  const y = (value: number) => 230 - ((value - minimum) / range) * 200;
  const zero = y(0);
  const series: string[] = [];
  if (chart.kind === 'pie') {
    const key = chart.valueKeys[0];
    if (!key) return '';
    const total = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row[key] ?? 0)),
      0,
    );
    if (!total || rows.some(row => Number(row[key] ?? 0) < 0)) {
      return '<p>Pie chart unavailable: values must be nonnegative and total more than zero. Use the table below.</p>';
    }
    let angle = -Math.PI / 2;
    rows.forEach((row, index) => {
      const value = Math.max(0, Number(row[key] ?? 0));
      if (value === 0) return;
      const next = angle + (value / total) * Math.PI * 2;
      if (value === total) {
        series.push(
          `<circle cx="200" cy="135" r="95" fill="${CHART_COLORS[index % CHART_COLORS.length]}"/>`,
        );
      } else {
        series.push(
          `<path d="M200 135 L${200 + Math.cos(angle) * 95} ${135 + Math.sin(angle) * 95} A95 95 0 ${next - angle > Math.PI ? 1 : 0} 1 ${200 + Math.cos(next) * 95} ${135 + Math.sin(next) * 95} Z" fill="${CHART_COLORS[index % CHART_COLORS.length]}"/>`,
        );
      }
      angle = next;
    });
  } else {
    const width = 500 / rows.length;
    chart.valueKeys.forEach((key, seriesIndex) => {
      const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
      if (chart.kind === 'line') {
        const points = rows
          .map(
            (row, index) =>
              `${55 + (index + 0.5) * width},${y(Number(row[key] ?? 0))}`,
          )
          .join(' ');
        series.push(
          `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"/>`,
        );
      } else {
        rows.forEach((row, index) => {
          const value = Number(row[key] ?? 0);
          const barWidth = width / chart.valueKeys.length;
          series.push(
            `<rect x="${55 + index * width + seriesIndex * barWidth}" y="${Math.min(zero, y(value))}" width="${Math.max(1, barWidth - 3)}" height="${Math.abs(zero - y(value))}" fill="${color}"/>`,
          );
        });
      }
    });
    series.push(
      `<line x1="50" y1="${zero}" x2="560" y2="${zero}" stroke="#808080"/>`,
    );
    const money =
      section.columns.find(column => column.key === chart.valueKeys[0])
        ?.format === 'money';
    const formatter = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(money ? { style: 'currency', currency } : {}),
    });
    for (let index = 0; index <= 4; index++) {
      const value = minimum + (range * index) / 4;
      series.push(
        `<text x="46" y="${y(value) + 3}" text-anchor="end" font-size="9">${escapeHtml(formatter.format(value / (money ? 100 : 1)))}</text>`,
      );
    }
    const stride = Math.max(1, Math.ceil(rows.length / 10));
    rows.forEach((row, index) => {
      if (index % stride !== 0) return;
      const label = String(row[chart.xKey] ?? '');
      series.push(
        `<text transform="translate(${55 + (index + 0.5) * width},250) rotate(30)" font-size="9"><title>${escapeHtml(label)}</title>${escapeHtml(label.length > 16 ? label.slice(0, 15) + '…' : label)}</text>`,
      );
    });
  }
  const legend =
    chart.kind === 'pie'
      ? rows
          .map(
            (row, index) =>
              `<span><i style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></i>${escapeHtml(row[chart.xKey])}</span>`,
          )
          .join(' ')
      : chart.valueKeys
          .map(
            (key, index) =>
              `<span><i style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></i>${escapeHtml(section.columns.find(column => column.key === key)?.label ?? key)}</span>`,
          )
          .join(' ');
  return `<figure><svg viewBox="0 0 600 320" role="img" aria-label="${escapeHtml(section.title)} chart; complete values in the following table">${series.join('')}</svg><figcaption>${legend}</figcaption></figure>`;
}

export function renderReportHtml(run: CfmReportRun): string {
  const sections = run.sections
    .map(section => {
      const head = section.columns
        .map(column => `<th scope="col">${escapeHtml(column.label)}</th>`)
        .join('');
      const rowHtml = (row: Record<string, CfmReportCell>) =>
        `<tr>${section.columns.map(column => `<td class="${column.format === 'money' || column.format === 'number' || column.format === 'percent' ? 'number' : ''}">${escapeHtml(formatCell(row[column.key], column, run.currency))}</td>`).join('')}</tr>`;
      const foot = section.totals
        ? `<tfoot>${rowHtml(section.totals)}</tfoot>`
        : '';
      const notes =
        section.notes
          ?.filter(note => !run.warnings.includes(note))
          .map(note => `<p class="note">${escapeHtml(note)}</p>`)
          .join('') ?? '';
      const table = (
        rows: Record<string, CfmReportCell>[],
        includeFoot: boolean,
      ) =>
        `<table><thead><tr>${head}</tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody>${includeFoot ? foot : ''}</table>`;
      const splitStatement =
        section.type === 'balance-sheet' &&
        section.columns.some(column => column.key === 'group');
      const content = splitStatement
        ? `<div class="balance-sheet"><div><h3>Assets</h3>${table(
            section.rows.filter(
              row => !String(row.group).endsWith('liabilities'),
            ),
            false,
          )}</div><div><h3>Liabilities and net equity</h3>${table(
            section.rows.filter(row =>
              String(row.group).endsWith('liabilities'),
            ),
            true,
          )}</div></div>`
        : table(section.rows, true);
      return `<section${section.columns.length > 6 ? ' class="wide"' : ''}><h2>${escapeHtml(section.title)}</h2>${renderChart(section, run.currency)}${content}${notes}</section>`;
    })
    .join('');
  const warnings = run.warnings.length
    ? `<aside><h2>Data notices</h2><ul>${run.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></aside>`
    : '';
  const assumptions = run.assumptions.length
    ? `<section><h2>Assumptions</h2><ul>${run.assumptions.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(run.name)} — Actual CFM</title><style>
.balance-sheet{display:grid;grid-template-columns:1fr 1fr;gap:20px}@media screen and (max-width:700px){.balance-sheet{display:block}}@page{size:A4;margin:16mm}@page wide{size:A4 landscape;margin:16mm}.wide{page:wide}*{box-sizing:border-box}body{font:13px/1.5 Arial,sans-serif;color:#242424;margin:24px auto;max-width:1000px;padding:0 16px}h1{font-size:28px;margin-bottom:4px}h2{font-size:18px;margin:24px 0 8px}p{margin:6px 0}header{border-bottom:2px solid #444;padding-bottom:12px}table{border-collapse:collapse;width:100%;margin:12px 0;font-variant-numeric:tabular-nums}thead{display:table-header-group}tfoot{font-weight:bold}th,td{text-align:left;vertical-align:top;padding:7px;border-bottom:1px solid #e0e0e0;overflow-wrap:anywhere}th{background:#f2f2f2}.number{text-align:right;white-space:nowrap}tr{break-inside:avoid}h2{break-after:avoid}aside{padding:8px 16px;border:1px solid #b88115}.note,.metadata{color:#444;font-size:12px}figure{margin:12px 0;break-inside:avoid}svg{width:100%;max-height:320px}figcaption span{display:inline-block;margin-right:16px}figcaption i{display:inline-block;width:12px;height:12px;margin-right:5px}.print{margin:16px 0}@media print{body{margin:0;padding:0;max-width:none}.print{display:none}a{color:inherit;text-decoration:none}}
</style></head><body><header><p>Actual CFM · Financial report</p><h1>${escapeHtml(run.name)}</h1><p>${escapeHtml(run.startDate)} through ${escapeHtml(run.endDate)} · As of ${escapeHtml(run.asOf)} · ${escapeHtml(run.currency)}</p><p class="metadata">Generated ${escapeHtml(run.createdAt)} · Timezone ${escapeHtml(run.timeZone)} · Template revision ${run.templateRevision} · Calculation ${escapeHtml(run.calculationVersion)}</p>${run.sourceUpdatedAt ? `<p class="metadata">Snapshot captured ${escapeHtml(run.sourceUpdatedAt)}</p>` : ''}</header><p class="print">Use your browser's Print command and choose Save as PDF to retain this report.</p>${run.template.notes ? `<p>${escapeHtml(run.template.notes)}</p>` : ''}${warnings}${sections}${assumptions}<footer><p class="metadata">Archived report ${escapeHtml(run.id)} · Document schema ${run.version}. Figures are a dated snapshot; later source changes do not update this archive.</p></footer></body></html>`;
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Spreadsheet formulas in account names/notes must remain plain text on opening CSV.
  if (
    /^[=+@\t\r]/.test(text) ||
    (/^-/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text))
  ) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportReportCsv(run: CfmReportRun, sectionId?: string): string {
  const sections = sectionId
    ? run.sections.filter(section => section.id === sectionId)
    : run.sections;
  if (sectionId && sections.length === 0) {
    throw new Error('Report section not found');
  }
  const rows: string[] = [];
  for (const section of sections) {
    if (rows.length) rows.push('');
    rows.push(csvCell(section.title));
    rows.push(section.columns.map(column => csvCell(column.label)).join(','));
    for (const row of [
      ...section.rows,
      ...(section.totals ? [section.totals] : []),
    ]) {
      rows.push(
        section.columns
          .map(column => {
            const value = row[column.key];
            return csvCell(
              typeof value === 'number' && column.format === 'money'
                ? (value / 100).toFixed(2)
                : value,
            );
          })
          .join(','),
      );
    }
  }
  return `${rows.join('\r\n')}\r\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

export function serializeReportRun(run: CfmReportRun): string {
  return `${JSON.stringify(sortJson(run), null, 2)}\n`;
}

export function getReportDocuments(run: CfmReportRun): {
  html: string;
  csv: string;
  json: string;
} {
  return {
    html: renderReportHtml(run),
    csv: exportReportCsv(run),
    json: serializeReportRun(run),
  };
}

/** Revalidate archived materialized data without re-querying or changing its figures. */
export function validateReportRun(value: unknown): CfmReportRun {
  if (
    !isRecord(value) ||
    value.version !== CFM_REPORT_VERSION ||
    value.calculationVersion !== CFM_CALCULATION_VERSION ||
    !Array.isArray(value.sections)
  ) {
    throw new Error('Unsupported archived report version');
  }
  const run = value as unknown as CfmReportRun;
  if (
    !run.warnings?.every(item => typeof item === 'string') ||
    !run.assumptions?.every(item => typeof item === 'string')
  ) {
    throw new Error('Invalid archived report assumptions');
  }
  return createReportRun({
    ...run,
    template: validateReportTemplate(run.template),
    resolveSection: definition => {
      const section = run.sections.find(item => item.id === definition.id);
      if (!section) throw new Error('Archived report section is missing');
      return section;
    },
  });
}
