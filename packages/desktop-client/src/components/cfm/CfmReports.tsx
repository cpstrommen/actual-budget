import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Buffer } from 'buffer';

import { Button } from '@actual-app/components/button';
import {
  getReportDocuments,
  validateReportTemplate,
} from '@actual-app/core/shared/cfm-reports';
import type {
  CfmReportPeriod,
  CfmReportRun,
  CfmReportSectionDefinition,
  CfmReportSectionType,
  CfmReportTemplate,
} from '@actual-app/core/shared/cfm-reports';
import type { CfmRecord, CfmState } from '@actual-app/core/types/models/cfm';

import {
  Action,
  Cell,
  Choice,
  DataTable,
  Field,
  fieldStyle,
  gridStyle,
  newId,
  Panel,
} from './ui';
import type { DeleteRecord, SaveRecord } from './ui';

type Props = {
  state: CfmState;
  asOf: string;
  save: SaveRecord;
  remove: DeleteRecord;
  busy: boolean;
  onError: (error: unknown) => void;
  run: (input: {
    templateId: string;
    asOf: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<boolean>;
};
function isRun(record: CfmRecord): record is CfmRecord<CfmReportRun> {
  return (
    record.kind === 'report-run' &&
    typeof record.data.id === 'string' &&
    typeof record.data.name === 'string' &&
    Array.isArray(record.data.sections) &&
    typeof record.data.createdAt === 'string'
  );
}
export function CfmReports({
  state,
  asOf,
  save,
  remove,
  busy,
  onError,
  run,
}: Props) {
  const { t } = useTranslation();
  const templates = state.records
    .filter(record => record.kind === 'report-template')
    .flatMap(record => {
      try {
        return [{ record, template: validateReportTemplate(record.data) }];
      } catch {
        return [];
      }
    });
  const runs = state.records
    .filter(isRun)
    .sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt));
  const types: Array<[CfmReportSectionType, string]> = [
    ['balance-sheet', t('Balance sheet')],
    ['annual-plan', t('Annual category performance')],
    ['liquidity', t('Liquidity forecast')],
    ['assets', t('Asset valuations')],
    ['obligations', t('AR/AP aging')],
    ['table', t('Custom table')],
    ['chart', t('Custom chart')],
  ];
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<CfmReportPeriod>('annual');
  const [sections, setSections] = useState<CfmReportSectionDefinition[]>([]);
  const [notes, setNotes] = useState('');
  const [auto, setAuto] = useState(false);
  const [cadence, setCadence] = useState<'monthly' | 'quarterly' | 'annual'>(
    'annual',
  );
  const [editing, setEditing] = useState<{
    record: CfmRecord;
    template: CfmReportTemplate;
  } | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selectedRun, setSelectedRun] = useState('');
  const preview = runs.find(record => record.id === selectedRun)?.data;
  function edit(item: { record: CfmRecord; template: CfmReportTemplate }) {
    setEditing(item);
    setName(item.template.name);
    setPeriod(item.template.period);
    setSections(item.template.sections);
    setNotes(item.template.notes ?? '');
    setAuto(item.template.autoGenerate?.enabled ?? false);
    setCadence(item.template.autoGenerate?.cadence ?? 'annual');
  }
  function updateSection(
    id: string,
    patch: Partial<CfmReportSectionDefinition>,
  ) {
    setSections(current =>
      current.map(section =>
        section.id === id ? { ...section, ...patch } : section,
      ),
    );
  }
  async function submit() {
    try {
      const template: CfmReportTemplate = {
        name,
        period,
        revision: (editing?.template.revision ?? 0) + 1,
        sections,
        notes,
        autoGenerate: { enabled: auto, cadence },
      };
      if (
        await save(
          'report-template',
          template,
          editing?.record.id,
          editing?.record.updatedAt,
        )
      ) {
        setEditing(null);
        setName('');
        setSections([]);
      }
    } catch (error) {
      onError(error);
    }
  }
  async function download(
    report: CfmReportRun,
    format: 'html' | 'csv' | 'json',
  ) {
    try {
      const documents = getReportDocuments(report);
      const bytes = new TextEncoder().encode(documents[format]);
      const filename = `${report.asOf}-${report.name.replace(/[^a-zA-Z0-9_-]+/g, '-')}.${format}`;
      await window.Actual.saveFile(
        Buffer.from(bytes),
        filename,
        t('Export report'),
      );
    } catch (error) {
      onError(error);
    }
  }
  function print(report: CfmReportRun) {
    try {
      const popup = window.open('', '_blank');
      if (!popup) {
        throw new Error(
          t(
            'Allow a new window to print this report, or export HTML and print it from your browser.',
          ),
        );
      }
      popup.document.open();
      popup.document.write(getReportDocuments(report).html);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (error) {
      onError(error);
    }
  }
  return (
    <>
      <Panel title={t('Report packages')}>
        <p>
          <Trans>
            Templates define reusable sections. Every generated run retains its
            resolved dates, materialized figures, template revision, and
            assumptions; later ledger edits do not rewrite the archive.
          </Trans>
        </p>
        <div style={gridStyle}>
          <Field label={t('Custom report start')}>
            <input
              style={fieldStyle}
              type="date"
              value={start}
              onChange={event => setStart(event.target.value)}
            />
          </Field>
          <Field label={t('Custom report end')}>
            <input
              style={fieldStyle}
              type="date"
              value={end}
              onChange={event => setEnd(event.target.value)}
            />
          </Field>
        </div>
        <DataTable
          headers={[
            t('Template'),
            t('Period'),
            t('Sections'),
            t('Schedule'),
            t('Actions'),
          ]}
        >
          {templates.map(item => (
            <tr key={item.record.id}>
              <Cell>
                {item.template.name}
                <div>
                  {t('Revision {{revision}}', {
                    revision: item.template.revision,
                  })}
                </div>
              </Cell>
              <Cell>{t(item.template.period)}</Cell>
              <Cell>
                {item.template.sections
                  .map(section => section.title)
                  .join(', ')}
              </Cell>
              <Cell>
                {item.template.autoGenerate?.enabled
                  ? t(item.template.autoGenerate.cadence)
                  : t('Manual')}
              </Cell>
              <Cell>
                <Action
                  disabled={busy}
                  onPress={() => {
                    void run({
                      templateId: item.record.id,
                      asOf,
                      ...(item.template.period === 'custom'
                        ? { startDate: start, endDate: end }
                        : {}),
                    });
                  }}
                >
                  <Trans>Generate and archive</Trans>
                </Action>
                <Action onPress={() => edit(item)}>
                  <Trans>Edit</Trans>
                </Action>
                <Action
                  disabled={busy}
                  onPress={() => {
                    void remove(item.record);
                  }}
                >
                  <Trans>Delete template</Trans>
                </Action>
              </Cell>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel
        title={
          editing ? t('Revise report template') : t('Create report template')
        }
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div style={gridStyle}>
              <Field label={t('Name')}>
                <input
                  style={fieldStyle}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                />
              </Field>
              <Choice
                label={t('Period')}
                value={period}
                onChange={value => {
                  if (
                    value === 'monthly' ||
                    value === 'quarterly' ||
                    value === 'annual' ||
                    value === 'ytd' ||
                    value === 'custom'
                  ) {
                    setPeriod(value);
                  }
                }}
                options={[
                  ['monthly', t('Monthly')],
                  ['quarterly', t('Quarterly')],
                  ['annual', t('Annual')],
                  ['ytd', t('Year to date')],
                  ['custom', t('Custom dates')],
                ]}
              />
              <Choice
                label={t('Automatic cadence')}
                value={cadence}
                onChange={value => {
                  if (
                    value === 'monthly' ||
                    value === 'quarterly' ||
                    value === 'annual'
                  ) {
                    setCadence(value);
                  }
                }}
                options={[
                  ['monthly', t('Monthly')],
                  ['quarterly', t('Quarterly')],
                  ['annual', t('Annual')],
                ]}
              />
              <label>
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={event => setAuto(event.target.checked)}
                />{' '}
                <Trans>Generate automatically after completed periods</Trans>
              </label>
            </div>
            <p>
              <Trans>
                Add, configure, and reorder sections. Automatic generation also
                requires an enabled scheduler in Automation.
              </Trans>
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 16,
              }}
            >
              {types.map(([type, title]) => (
                <Button
                  key={type}
                  onPress={() =>
                    setSections(current => [
                      ...current,
                      {
                        id: newId(),
                        type,
                        title,
                        ...(type === 'table' || type === 'chart'
                          ? {
                              source: 'accounts',
                              chartType: 'bar',
                              xKey: 'name',
                              valueKeys: ['amount'],
                            }
                          : {}),
                      },
                    ])
                  }
                >
                  {t('Add {{section}}', { section: title })}
                </Button>
              ))}
            </div>
            {sections.map((section, index) => (
              <div
                key={section.id}
                style={{
                  padding: 12,
                  border: '1px solid currentColor',
                  borderRadius: 4,
                  marginBottom: 12,
                }}
              >
                <div style={gridStyle}>
                  <Field label={t('Section title')}>
                    <input
                      style={fieldStyle}
                      value={section.title}
                      onChange={event =>
                        updateSection(section.id, { title: event.target.value })
                      }
                      required
                    />
                  </Field>
                  {(section.type === 'table' || section.type === 'chart') && (
                    <Choice
                      label={t('Data source')}
                      value={section.source ?? 'accounts'}
                      onChange={value => {
                        if (
                          value === 'accounts' ||
                          value === 'transactions' ||
                          value === 'categories' ||
                          value === 'assets' ||
                          value === 'obligations'
                        ) {
                          updateSection(section.id, {
                            source: value,
                            xKey: value === 'transactions' ? 'date' : 'name',
                            valueKeys: ['amount'],
                          });
                        }
                      }}
                      options={[
                        ['accounts', t('Accounts')],
                        ['transactions', t('Transactions')],
                        ['categories', t('Categories')],
                        ['assets', t('Assets')],
                        ['obligations', t('Obligations')],
                      ]}
                    />
                  )}
                  {section.type === 'chart' && (
                    <>
                      <Choice
                        label={t('Chart type')}
                        value={section.chartType ?? 'bar'}
                        onChange={value => {
                          if (
                            value === 'bar' ||
                            value === 'line' ||
                            value === 'pie'
                          ) {
                            updateSection(section.id, { chartType: value });
                          }
                        }}
                        options={[
                          ['bar', t('Bar')],
                          ['line', t('Line')],
                          ['pie', t('Pie')],
                        ]}
                      />
                      <Field label={t('Label column')}>
                        <input
                          style={fieldStyle}
                          value={section.xKey ?? 'name'}
                          onChange={event =>
                            updateSection(section.id, {
                              xKey: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        label={t('Value columns')}
                        hint={t('Comma-separated numeric column keys.')}
                      >
                        <input
                          style={fieldStyle}
                          value={section.valueKeys?.join(', ') ?? 'amount'}
                          onChange={event =>
                            updateSection(section.id, {
                              valueKeys: event.target.value
                                .split(',')
                                .map(value => value.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </Field>
                    </>
                  )}
                  <Field
                    label={t('Filter accounts')}
                    hint={t('No selection includes all accounts.')}
                  >
                    <select
                      multiple
                      style={fieldStyle}
                      value={section.accountIds ?? []}
                      onChange={event =>
                        updateSection(section.id, {
                          accountIds: Array.from(
                            event.target.selectedOptions,
                            option => option.value,
                          ),
                        })
                      }
                    >
                      {state.accounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={t('Filter categories')}
                    hint={t('No selection includes all categories.')}
                  >
                    <select
                      multiple
                      style={fieldStyle}
                      value={section.categoryIds ?? []}
                      onChange={event =>
                        updateSection(section.id, {
                          categoryIds: Array.from(
                            event.target.selectedOptions,
                            option => option.value,
                          ),
                        })
                      }
                    >
                      {state.categories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p style={{ display: 'flex', gap: 8 }}>
                  <Button
                    isDisabled={index === 0}
                    onPress={() =>
                      setSections(current => {
                        const next = [...current];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        return next;
                      })
                    }
                  >
                    <Trans>Move up</Trans>
                  </Button>
                  <Button
                    isDisabled={index === sections.length - 1}
                    onPress={() =>
                      setSections(current => {
                        const next = [...current];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        return next;
                      })
                    }
                  >
                    <Trans>Move down</Trans>
                  </Button>
                  <Button
                    onPress={() =>
                      setSections(current =>
                        current.filter(item => item.id !== section.id),
                      )
                    }
                  >
                    <Trans>Remove section</Trans>
                  </Button>
                </p>
              </div>
            ))}
            <Field label={t('Notes')}>
              <textarea
                style={fieldStyle}
                rows={3}
                value={notes}
                onChange={event => setNotes(event.target.value)}
              />
            </Field>
            <p style={{ display: 'flex', gap: 8 }}>
              <Button
                type="submit"
                variant="primary"
                isDisabled={!name || !sections.length}
              >
                <Trans>Save template</Trans>
              </Button>
              {editing && (
                <Button onPress={() => setEditing(null)}>
                  <Trans>Cancel editing</Trans>
                </Button>
              )}
            </p>
          </fieldset>
        </form>
      </Panel>
      <Panel title={t('Archived report runs')}>
        <DataTable
          headers={[
            t('Report'),
            t('Covered period'),
            t('Generated'),
            t('Exports'),
          ]}
        >
          {runs.map(record => (
            <tr key={record.id}>
              <Cell>
                <Action onPress={() => setSelectedRun(record.id)}>
                  {record.data.name}
                </Action>
                <div>
                  {t('Template revision {{revision}}', {
                    revision: record.data.templateRevision,
                  })}
                </div>
              </Cell>
              <Cell>
                {record.data.startDate} – {record.data.endDate}
              </Cell>
              <Cell>{record.data.createdAt}</Cell>
              <Cell>
                {(
                  ['html', 'csv', 'json'] satisfies Array<
                    'html' | 'csv' | 'json'
                  >
                ).map(format => (
                  <Action
                    key={format}
                    onPress={() => {
                      void download(record.data, format);
                    }}
                  >
                    {format.toUpperCase()}
                  </Action>
                ))}
                <Action onPress={() => print(record.data)}>
                  {t('Print / save PDF')}
                </Action>
              </Cell>
            </tr>
          ))}
        </DataTable>
        {preview && (
          <>
            <p>
              {preview.warnings.map(warning => (
                <span key={warning}>{t(warning)} </span>
              ))}
            </p>
            <iframe
              title={preview.name}
              srcDoc={getReportDocuments(preview).html}
              sandbox=""
              style={{ border: 0, width: '100%', height: 700 }}
            />
          </>
        )}
      </Panel>
    </>
  );
}
