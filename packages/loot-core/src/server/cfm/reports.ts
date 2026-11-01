// Report documents are platform-independent so the UI, API and headless worker
// render precisely the same archived figures.
export {
  CFM_CALCULATION_VERSION,
  CFM_REPORT_VERSION,
  createReportRun,
  exportReportCsv,
  getReportDocuments,
  renderReportHtml,
  resolveReportPeriod,
  serializeReportRun,
  validateReportTemplate,
} from '#shared/cfm-reports';
export type {
  CfmReportColumn,
  CfmReportRun,
  CfmReportSection,
  CfmReportSectionDefinition,
  CfmReportTemplate,
  CfmResolvedReportPeriod,
  CreateCfmReportRunOptions,
} from '#shared/cfm-reports';
