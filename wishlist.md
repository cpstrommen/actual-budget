# Actual CFM Wishlist and Implementation Plan

Actual CFM is a personal fork of Actual Budget focused on annual planning, liquidity, asset valuation, and net equity. The ledger and transaction workflows remain the foundation; the main view should help explain the year ahead and the overall financial position.

This document records the implemented CFM workflows and their acceptance criteria. The workspace, shared financial calculations, ledger commands, report archives, application/headless scheduling, and upstream return path are implemented. The detailed requirements below remain the regression and release checklist.

## Implementation Status — 2026-11-01

| Area               | Delivered implementation                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Financial position | Effective-dated classifications, separate asset/liability statement columns, residual net equity, liquidity eligibility, and manual account creation                                                 |
| Manual balances    | Core-calculated dated adjustments, preview/stale-write check, stable request IDs, audit observations, undo, and register actions                                                                     |
| Annual plans       | Exact equal/custom/weighted allocations, dated items, prorated/full-month YTD, revisions, independent year copies, and explicit monthly funding                                                      |
| Assets             | Manual/straight-line/rate/schedule policies, effective-date history, explicit modeled-history restatement, linked debt, disposal, observed versus modeled values, and scheduled ledger realization   |
| AR/AP              | Purchase/split allocation, partial/import-matched settlements, shared deposits, existing-balance itemization, explicit payable credits, non-cash write-offs/reversals, and managed-entry edit guards |
| Liquidity          | Daily/monthly scenarios, cards, native schedules/transfers, annual residuals, AR delay, exclusions, shortfalls, coverage, and stale-data warnings                                                    |
| Reports            | Reusable ordered packages, periods/filters/charts/tables, valuation roll-forward, AR/AP aging, immutable runs, printable HTML/PDF, CSV, and JSON                                                     |
| Automation         | Selected writer, timezone/period keys, local leases, retry/backoff, bank refresh grouping/overlap lock, valuation/report jobs, application-open mode, and opt-in credentialed worker                 |
| Portability        | Clean pinned upstream schema, row/checkpoint comparisons, JSON/CSV audit archive, report artifacts, native snapshot, automatic recovery copies, offline converter, and packaged runtime              |
| Identity           | Actual CFM display identity, icons, documentation, own native IDs, and neutral light/dark/midnight themes                                                                                            |

Implementation entry points are `shared/cfm.ts`, `shared/cfm-reports.ts`, `shared/cfm-automation.ts`, `server/cfm/`, and `components/cfm/`. New financial metadata uses per-record envelopes in the existing synced `notes` table, with native ledger entries for realized balances. No CFM SQL migrations are required. [Using Actual CFM](packages/docs/docs/actual-cfm.md), the [format specification](packages/docs/docs/migration/cfm-format.md), and the [return guide](packages/docs/docs/migration/return-to-actual-budget.md) describe operation and recovery.

Validation includes the full core and UI suites, focused financial/automation regressions, browser balance/report/AR workflows, browser compatibility export, and a 2,145-record unmodified upstream round trip with native and packaged offline recovery. A complete annual package renders to a paginated PDF with landscape pages for wide tables. Checks use Node 24.22.1. Live provider-authenticated calls need the user's own connections; tests exercise scheduling, retries, encrypted-access credentials, and leases without real bank data. Docker visual baselines remain a release check when Docker is available; host screenshots do not replace them.

## Requested Features

1. **Set balance:** For manual off-budget accounts without bank sync, enter the current balance and automatically post the debit or credit needed to reach it.
2. **Report packages and balance sheet:** Customize monthly, quarterly, annual, YTD, and arbitrary-period reports with charts and tables. Save reusable formats, automatically generate and archive reports, and present accounts in a balance sheet with assets on the left and liabilities on the right, grouped into Equities, Liquidity, and Assets as appropriate. Consider a standardized export format, potentially LaTeX.
3. **Asset accounts and valuation:** Track assets with manually assigned values, depreciation/appreciation schedules, or a fixed rate of change.
4. **Annual category plans:** Set an annual budget per category and compare YTD actual spending against YTD expected spending, allowing expenses to vary throughout the year.
5. **Grey visual identity:** Replace the navy-heavy palette with the greys used on `strommen.ch`, using the local site repository as the reference.
6. **Automatic bank sync:** Configure bank synchronization at user-selected intervals.
7. **Accounts receivable and payable:** Track amounts owed by or to other people, including reimbursements such as three friends repaying their shares of four sports tickets. Support settlement and write-offs for both AR and AP.
8. **Liquidity projection:** Show whether liquid accounts can cover short-term liabilities, especially checking balances versus credit cards, and project that coverage forward.

## Existing Foundations

Reuse the existing implementation rather than introducing a separate financial database:

| Area                | Starting Points                                                                                             | Extension Needed                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Accounts and ledger | `packages/loot-core/src/types/models/account.ts`, `src/server/accounts/app.ts`, `src/server/transactions/`  | CFM classification, adjustment metadata, asset valuations, and obligation links           |
| Reconciliation      | `packages/desktop-client/src/accounts/reconciliation.ts`, `src/components/accounts/`                        | A separate target-balance command; reconciliation currently compares cleared transactions |
| Budgets and goals   | `packages/loot-core/src/server/budget/`, `packages/desktop-client/src/components/budget/`                   | Explicit annual plans and seasonal expectations, independent of monthly envelope funding  |
| Reports             | `packages/loot-core/src/server/reports/`, `packages/desktop-client/src/components/reports/`                 | Shared financial statement queries, report documents, exports, and historical archives    |
| Forecasts           | Existing balance-forecast report and schedule occurrences in `packages/loot-core/src/server/schedules/`     | Aggregate liquidity coverage, obligation timing, and scenario assumptions                 |
| Bank sync           | `packages/loot-core/src/server/accounts/app.ts`, `src/server/accounts/sync.ts`, `packages/sync-server/src/` | Scheduling around existing provider calls, with limits, retries, and durable job state    |
| Themes              | `packages/component-library/src/themes/`, `src/theme.ts`                                                    | Grey palette mappings through existing semantic tokens                                    |
| Persistence         | `packages/loot-core/migrations/`, shared schemas, sync, and backup/export paths                             | Per-record synced note envelopes, native ledger postings, undo, and round-trip support    |

`src/...` paths in a table row are relative to the package named in that row. The core should own calculations used by the UI, API, reports, and jobs.

## Portability Is a Release Requirement

Users must be able to return to **upstream Actual Budget** without losing transaction history or dated account balances, even if Actual CFM stops being maintained. This requirement takes priority over the implementation choices below.

### Current Capability

**Export for Actual Budget** is available in Settings and Financial position. The supported target is **26.10.0**, commit `5897cfa65afec3d0252d7467e5b7a033fb66900b`. The isolated compatibility harness builds and imports through that unmodified upstream implementation. Recovery also runs from a packaged local runtime without a maintained CFM server or dependency installation.

The native ledger format is retained. CFM records use reserved `cfm:v1:` note envelopes, and all realized balances use ordinary transactions. The dedicated converter builds a clean pinned schema, removes reserved notes into an audit/recovery archive, resets sync identities and derived view/cache state, compares rows and dated balance checkpoints, and refuses unsupported schemas. Native backups alone remain insufficient as a future downgrade guarantee.

### Required Design

1. **Deliver the return path before shipping CFM financial extensions.** Add a clearly labeled “Export for Actual Budget” action and a documented, offline command-line equivalent. Export from a consistent snapshot without modifying the source budget. Each CFM release names the upstream release(s) it has actually been tested against. Freeze a known-good target rather than requiring the latest upstream version or internet access.
2. **Build a clean target database.** Create a fresh budget using the supported upstream schema and its real migration history, then project supported records into it. Do not rename migration IDs, strip arbitrary migration rows, or offer in-place schema downgrade. Reset device/sync identities using the native import conventions; never connect both products to the same live budget sync group.
3. **Preserve the complete financial ledger.** Carry account identities and names, open/closed and on/off-budget state, every posted transaction and its date/amount, starting balances, splits, transfer pairs, payees, categories, notes, cleared/reconciled state, and supported schedules/rules/monthly budgets. Preserve supported history rather than collapsing accounts to a single current balance. Preserve user-entered notes; use an auxiliary provenance manifest for mappings and additional CFM metadata.
4. **Make all realized balances upstream-readable.** Set-balance corrections, booked asset revaluations, AR/AP control movements, settlements, reversals, and write-offs must already have ordinary account/transaction representations or be materialized exactly once in the export with stable IDs. Preserve their original effective dates and signs. AR/AP items become normal tracking accounts/transactions; their detailed item status also remains in the sidecar. No CFM-only calculator may be required to reproduce a posted account balance.
5. **Preserve valuation and balance logs.** Keep append-only recorded valuation observations, balance observations, and adjustment/reversal history in a versioned JSON and CSV audit archive, including source, effective date, recorded timestamp, and links to ledger entries. Preserve transaction edit/deletion history, tombstones, and reconciliation history in the audit archive and full CFM backup where present; do not resurrect deleted ledger entries in the upstream working budget. Persist observations before replacing current-value fields, so a later export does not have to reconstruct lost observations. Ledger-affecting observations must be reflected in dated native transactions so account running balances are available upstream. Observations that do not change the ledger (for example, an informational bank available-balance snapshot) remain clearly identified audit observations; do not turn them into invented cash movements. Future projected values remain forecasts, never historical transactions.
6. **Keep CFM-only information portable.** Export annual plans, classifications, valuation policies, obligation detail, forecast assumptions, report templates/runs, and attachments into documented JSON/CSV/PDF files alongside a full CFM backup. Upstream does not have these features; preserve their records without claiming it can run their interfaces. Mark any field upstream cannot represent and provide its archive location. Unmapped financial records or an unreconciled balance must fail export, not be silently dropped.
7. **Provide a validation receipt.** Include export version, supported upstream version, snapshot cutoff, per-account transaction counts and signed balances, dated balance checkpoints, transfer/split checks, mappings, hashes of output files, and all intentional representation changes. Compare source versus imported target balances at every ledger event date, not just today or month-end. Validate metadata/notes/flags separately, including zero-value entries and same-date ordering where supported. If exact intraday ordering cannot be expressed upstream, preserve it in the audit archive and state the limitation.
8. **Keep the exit available after maintenance ends.** Package the offline exporter, target schema/import adapter, human-readable format specification, and example data with tagged source releases. Provide reproducible build/run instructions and dependency versions. Automatic backups should include a full CFM archive plus the most recent successfully validated upstream export; expose its timestamp and refresh it after financial mutations, with a final fresh export on request. Do not rely solely on an earlier compatible backup that omits later transactions.
9. **Keep installations separate.** Give CFM its own desktop/mobile app IDs, display names, update source, and default data directory. Never rename or delete an existing upstream data directory automatically. Import a copy through export/import, and preserve the original until comparison is complete. Retain internal API/file-format identifiers where changing them would impede compatibility.

### Compatibility Gate

Before releasing any CFM data feature, create a fixture with opening balances, closed and off-budget accounts, positive/negative/zero transactions, same-day entries, splits, transfers, refunds, reconciled entries, backdated corrections, asset observations/reversals, AR/AP partial settlements and write-offs. Add fixtures as each feature ships.

Run the exporter, import the resulting ZIP into the **unmodified, pinned upstream Actual Budget application**, and compare every supported record plus signed running balances at every transaction date. Verify transfer links, splits, categories, notes and reconciliation flags; export again upstream and compare. Cover CFM backup/restore, encrypted source budgets, large files, unsupported targets, interrupted exports, and execution using only a downloaded release plus a local backup. Check audit-archive records and hashes, and prove that no future forecast is posted accidentally. A converter-only round-trip or matching ending balances is insufficient.

The exporter and unmodified upstream test harness implement this gate. Every later format or financial change must extend the same fixtures and compatibility checks. See [Returning to Actual Budget](packages/docs/docs/migration/return-to-actual-budget.md) for the user-facing procedure and current implementation status.

## Shared Financial Model

Build these foundations before combining the features into dashboards and automated reports.

- **Keep budget participation separate from financial classification.** Existing `offbudget` means whether an account participates in the budget. Add independent classification for cash, investment/equity holding, other asset, credit card, loan, receivable, and payable. Also capture liquidity eligibility, restrictions, and relevant due dates. A bank provider's account type can suggest a classification; the user can correct it.
- **Preserve signed ledger balances.** Assets normally have positive balances and liabilities negative balances. Reports can display liabilities as positive amounts, while retaining the underlying sign. Flag unusual balances instead of silently changing classification.
- **Separate equity holdings from net equity.** The requested “Equities” group means investment holdings. Net equity is the residual `total assets - total liabilities`; do not add it again as another asset. Use distinct labels in the interface.
- **Keep a historical record.** Balance changes and valuation adjustments are dated, attributable records. Statements use balances and valuations effective at the selected date, rather than today's values applied to prior years. Classification and valuation-policy changes need effective dates or version history too.
- **Distinguish cash and non-cash activity.** Valuation gains/losses and non-cash write-offs must affect the appropriate asset/liability and net-worth views without appearing as cash receipts or payments. Make the reporting treatment explicit in adjustment metadata.
- **Use integer minor units.** Follow the existing amount convention, perform rates with defined precision, and round once at posting/allocation boundaries. Allocate rounding remainders deterministically so monthly amounts sum exactly to the annual total.
- **Use one currency per financial view initially.** Work in the budget's base currency. Exclude or flag unsupported foreign-currency values until dated exchange rates and conversion rules are deliberately implemented; never total unlike currencies silently.
- **Integrate persistence fully.** New entities need migrations, types, AQL schema/query support where applicable, sync registration, tombstones, undo behavior, backup/export/import, and API validation. Financial tables belong with the budget; server credentials and job leases do not belong in synced financial data.
- **Make generated work repeatable.** Scheduled jobs and generated adjustments need deterministic occurrence identifiers and a single authorized writer for each budget. Database uniqueness within one client alone does not prevent duplicates when two devices operate offline.

Implemented extension records: effective-dated account classifications, adjustment records linked to transactions, asset valuation policies/observations, annual plans and monthly allocations, obligations and settlement links, report templates and immutable report runs. Derive totals from source records rather than maintaining competing balance fields.

## Implementation Sequence

| Phase    | Deliverable                                                     | Depends On                                     | Completion Evidence                                                                                                |
| -------- | --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 0        | Fork identity and documentation cleanup                         | None                                           | Actual CFM positioning, no upstream contribution enforcement, technical guides retained — completed in this change |
| 1        | Tested upstream export, account classification, and set balance | Existing ledger                                | Pinned upstream import preserves records and dated balances; manual adjustment round-trip                          |
| 2        | Annual category planning and YTD comparison                     | Shared date/amount rules                       | Seasonal plan matches category actuals and exact annual totals                                                     |
| 3        | Asset valuations and balance sheet                              | Phase 1                                        | Historical valuations and statements reconcile without cash-flow inflation                                         |
| 4        | AR/AP and settlements                                           | Phase 1                                        | Ticket reimbursement example works through partial repayment and write-off                                         |
| 5        | Liquidity overview and projections                              | Phases 1–4 and existing schedules              | Cash coverage fixture handles card payments, transfers, AR/AP, and seasonal spending once each                     |
| 6        | Reusable report packages and archives                           | Shared queries from phases 2–5                 | A saved report reproduces its original figures after later ledger edits                                            |
| 7        | Durable automation, bank-sync scheduling, and scheduled reports | Existing sync plus report/valuation operations | Restart, retry, overlapping-job, and encrypted-budget cases behave predictably                                     |
| Parallel | Grey theme and separate application identity                    | Fork identity; existing semantic tokens        | Accessible light/dark/midnight views and scoped visual checks                                                      |

Implement each phase as a usable vertical slice: persistence and calculation, API/command surface, interface, then validation. Start with Phase 1’s compatibility exporter and upstream test harness, then the manual set-balance flow; it provides immediate utility while establishing the accounting distinctions needed later. A basic manual balance sheet can ship before advanced asset schedules, and manual reports can ship before background automation.

## 1. Set Balance for Manual Off-Budget Accounts

**Behavior:** An account action opens a small form with target balance, effective date (default today), and an optional note. Show the current ledger balance and proposed adjustment before saving. Availability requires an open off-budget account without a linked bank-sync source.

Calculate `adjustment = target balance - ledger balance as of effective date`. Include both cleared and uncleared posted transactions; exclude future-dated transactions beyond that date. This is deliberately separate from reconciliation, which uses cleared balances and may lock transactions.

Implement a validated core command that calculates the difference and writes the adjustment atomically through existing transaction machinery. The UI should not supply a trusted precomputed difference. Mark the entry as a balance adjustment and record the reason so reports can distinguish revaluation, correction, and actual cash movement. Avoid transaction rules silently changing the amount, account, or date. Do not lock unrelated transactions. A zero difference creates no transaction.

**Acceptance:** Positive, negative, liability, zero-change, and backdated targets produce the exact signed balance at the selected date. Later transactions remain intact. Repeated submission does not duplicate the entry. Undo, sync, and export/import preserve the change. Bank-linked and on-budget accounts reject the command even when called through the API. Detect intervening writes or recompute before confirmation if the displayed adjustment became stale.

## 2. Annual Category Planning

Store a plan by year and category, with annual amount and twelve monthly allocations. Support equal distribution, custom monthly amounts/weights, and one-off expenses. Calendar years are the first version; leave room for fiscal-year starts later.

Annual planning should not automatically move envelope money. Existing monthly allocation remains available, with an explicit action to apply plan amounts to monthly budgets if desired. Keep planned spending, budget funding, and actual spending visibly distinct.

For a selected cutoff date, show annual plan, expected YTD, actual YTD, remaining annual allowance, and variance. Define expense variance as `actual - expected`, with a positive amount labeled over plan. Default to completed months plus a prorated current-month allocation; allow the full current-month expectation as a clearly labeled alternative. Use an actual due date for dated one-off items instead of prorating them. Refunds reduce expense actuals, transfers are excluded, and split parents must not be counted alongside their children.

**Acceptance:** A large insurance payment expected in November does not make earlier months look artificially under budget. Leap years, partial months, refunds, category changes, deleted/archived categories, and integer rounding have defined results. Monthly allocations always sum to the annual amount. Copying a year creates an independent plan. Historical reporting can identify which plan revision it used.

## 3. Assets, Valuations, and Balance Sheet

Introduce asset accounts backed by the existing ledger, with additional fields for acquisition date/value, valuation method, effective dates, residual value where relevant, and optional disposal date. Initial methods:

- Manual dated observations.
- Straight-line depreciation over a useful life, bounded by residual value.
- Fixed annual percentage depreciation or appreciation, with compounding and posting frequency explicitly selected.
- Explicit dated valuation schedules for irregular changes.

Store the original valuation policy and its revisions. Manual overrides establish a new value from their effective date. Schedule edits affect future calculations by default; historical restatement is an explicit operation. Distinguish modeled valuations from observed values and show their age/source. Support linked debt without subtracting it from the asset's gross value and then counting it again as a liability.

Use one valuation calculation to power previews and as-of statements. Every realized valuation affecting an account balance must have a dated ordinary ledger adjustment with a stable occurrence ID and non-cash classification. Purely modeled future valuations remain projections. This ensures upstream can reproduce realized balance history without CFM code. A statement must use either the valuation-derived value or the corresponding ledger adjustment, never both. Disposal ends future valuation events and records any cash proceeds separately.

Build the balance sheet on shared as-of queries: assets on the left; liabilities and residual net equity on the right. Present the requested Liquidity, Equities (investment holdings), and Other Assets sections on the asset side, and current/long-term liability sections on the other side. Offer a matching liquidity view without forcing loans or payables into asset categories.

**Acceptance:** Historical statements remain explainable after a new valuation. Appreciation does not increase cash-flow income. Depreciation respects the floor and stops at disposal. Mortgaged property shows gross asset value, debt, and net equity correctly. The statement reconciles `assets = liabilities + net equity` and supports zero or negative net equity.

## 4. Accounts Receivable and Payable

Model obligations as individual items with counterparty, direction (owed to me / owed by me), original amount, dates, optional due date, notes, source transaction/split, and settlement history. Display open, partially settled, settled, overdue, and written-off items. Derive outstanding amounts from allocations and write-offs rather than editing a free-form balance.

Expose AR/AP as dedicated workspace views backed by managed off-budget control accounts. This keeps them visible in the balance sheet while replacing the current practice of maintaining one opaque manual account. Prevent unrelated edits to generated control entries unless the linked obligation is updated in the same operation.

**Ticket example:** Buy four tickets for $400 on a card. Allocate $100 to personal entertainment and three $100 portions to receivables, each linked to a friend. The imported card charge stays $400; personal expense is $100 and AR is $300. A friend's $100 bank deposit settles their receivable instead of becoming new income. The existing transfer/split machinery should connect these entries without counting the original purchase or repayment twice.

Allow one payment to settle several items and one item to be settled through several payments. Unallocated overpayments need an explicit credit/refund treatment. AP mirrors the flow: recognize the obligation and associated expense/asset once, then clear the liability on payment. Writing off AR reduces the receivable and records the selected loss/expense treatment without moving cash. Releasing AP reduces the liability with a separately labeled non-cash adjustment. Preserve reasons and allow reversal.

**Acceptance:** The ticket example, partial payments, one payment covering several debts, import matching, disputed/undated items, overpayments, write-offs, and reversals reconcile with cash and net worth. Deleting or changing a linked transaction prompts a deliberate repair of its allocation. Existing manual AR/AP accounts can be migrated with a reconciliation preview and without adding their balances twice.

## 5. Liquidity Overview and Projection

Start with a current-position card: eligible liquid balances, current short-term liabilities, cash remaining after coverage, and coverage ratio. Let users choose which accounts count as available liquidity. Exclude investments, restricted cash, and receivables by default; list exclusions. Do not treat unused credit limits as cash. Flag negative cash positions and handle zero liabilities without displaying an infinite ratio.

Then project daily cash for a near-term horizon, with a monthly view across the annual plan. Reuse schedule occurrence expansion and combine known bills, income, card payment dates, AP due dates, and optional AR collections. Default proposed horizons are 30/60/90 days plus a 12-month view.

Use an explicit precedence/matching rule between posted transactions, linked schedules, obligations, and annual-plan residual estimates. Once an expected event posts, it replaces its forecast occurrence. Transfers between selected liquid accounts net to zero in the aggregate; transfers out to excluded accounts reduce available liquidity. A card purchase creates expense and liability, while its later payment creates the cash outflow; include existing card debt and new forecast charges in the correct statement cycle without charging cash twice.

Show minimum projected cash, its date, shortfall periods, and assumptions. AR is uncertain until collected: allow excluding it, including dated expected collections, or delaying them in a scenario. Undated obligations appear separately rather than receiving invented due dates. Data freshness must be visible. Forecasts are scenarios and do not post transactions.

**Acceptance:** Fixtures cover checking versus cards, savings eligibility, transfers, annual insurance, delayed reimbursements, undated AP, missing card due dates, and stale bank data. Opening balances plus projected net cash movements equal closing balances for every period. No receipt, charge, or payment is counted more than once.

## 6. Report Packages, Exports, and Archives

Separate a report template (layout and query options), a run (resolved period and inputs), and an artifact (rendered/exported result). Let a package combine balance sheet, annual/YTD category comparison, liquidity projection, asset valuation roll-forward, AR/AP aging, existing report charts, and tables. Support monthly, quarterly, annual, YTD, and custom periods, with explicit as-of dates for stock measures and start/end dates for flows.

Reuse existing report calculations and chart/table components. Define a versioned report document model with sections, filters, titles, chart configurations, ordering, and display preferences. Store template revisions, resolved dates, calculation version, data freshness, forecast assumptions, and materialized result data with each completed run. Later ledger corrections can produce a new run, but must not silently rewrite an archived one.

Start with deterministic printable HTML/PDF and CSV exports for tables, plus a structured JSON report document for portability. These are proposed formats: validate pagination and chart rendering with a sample annual package before choosing the renderer. LaTeX can be a later export adapter if its typography is worth the extra runtime dependency; keep it outside the financial calculation layer.

Archive report metadata and snapshots with the budget. Store larger artifacts in a defined attachment/archive location, include them in backup/export, and clearly state whether they sync between devices. Manual generation comes first; scheduled generation uses the shared job runner in Phase 7.

**Acceptance:** A saved package regenerates the same section definitions for different periods. Archived output stays unchanged after source edits or template changes. Tables reconcile with source queries, PDF pages remain readable, and missing/stale inputs are labeled. Export/import retains the archive or explicitly identifies any missing artifacts.

## 7. Automatic Bank Sync and Shared Automation

Keep provider logic in the existing bank-sync path. Add enable/disable controls, interval, selected connections, last success, next attempt, and actionable failure status. Respect each provider's refresh limits, authentication expiry, and rate limits. Group calls by connection where supported, avoid overlapping manual and scheduled runs, and preserve existing transaction deduplication.

**First delivery:** An application-open scheduler in the core worker, explicitly labeled as requiring a running, unlocked application. Persist last/next run state, perform one catch-up after suspension, and avoid replaying every missed interval. Use one selected scheduler device/session per budget.

**Unattended delivery:** An opt-in headless worker using the existing core/API against a selected budget, with an exclusive lease and a defined credential lifecycle. The sync server stores encrypted budget data and cannot simply run ledger operations on it. Specify how the worker obtains authorized access and unlocks the budget; never upload encryption keys into ordinary synced settings. Make “app open” versus “background worker” capability explicit in settings.

Share durable scheduling primitives with asset valuation posting and report generation: operation/period keys, lease expiry, retry/backoff, cancellation, safe restart, and bounded catch-up. Report jobs should finish a requested bank-sync attempt before collecting their snapshot and record any stale inputs if sync fails. Use the budget timezone for period boundaries and define daylight-saving behavior. Keep bank-provider sync distinct from device-to-device data sync.

**Acceptance:** Disabled means no scheduled calls. Restarting, sleeping, reconnecting, or opening two clients does not produce duplicate imports, valuation entries, or report archives. Rate limits back off; expired authorization prompts action. Locked/encrypted budgets pause with a clear status. The UI accurately states whether work continues when all clients are closed.

## 8. Grey Theme and Display Branding

Use the local Strømmen site sources as the starting reference: `../strommen.github.io/styles/strommen-colors.css` and `../strommen.github.io/styles/strommen-theme.css`. The inspected palette includes `#1f1f1f`, `#242424`, `#444444`, and `#f2f2f2`. These values now underpin the neutral theme; each surface keeps its appropriate contrast and theme mapping.

Map neutral greys to semantic sidebar, surface, border, text, hover, and selection roles in `packages/component-library/src/themes/`. Retain meaningful positive/negative/warning states and accessible focus indicators. Coordinate light, dark, and midnight mappings. The branding change updates `DESIGN.md`, the palette mappings, app icons, and display identities. Keep validating the theme as CFM screens are implemented.

Application identity and display branding are implemented in the branding change: browser title/manifest, setup copy, navigation/about text, desktop display name, and local documentation imagery. Keep package namespaces, database identifiers, CLI commands, and environment variables stable unless a specific migration is needed. Historical upstream release notes and legal attribution remain attributed to Actual Budget.

**Acceptance:** Dense financial tables, charts, forms, menus, disabled states, and keyboard focus are legible in each theme. Verify contrast and scoped Docker-generated visual snapshots. Existing backups and API scripts still work after display-name changes.

## Validation and Regression Coverage

Use a shared deterministic example budget for all phases: checking and savings, a credit card, a property with debt, an investment holding, seasonal annual expenses, and the ticket reimbursements. It should demonstrate the links between annual plans, cash timing, valuations, and statements.

For financial features, add calculation tests for dates, signs, rounding, and duplicate events; database tests for migrations and sync/export round-trips; and focused interface tests for the main workflow. Run type checking and linting for implementation changes. Use the existing VRT environment for actual UI changes. The financial behavior is implemented in the linked core, UI, API, and tool files; this document records its contract.

The shared example in `scripts/create-cfm-example.mjs` can be exported for manual exploration and is used by `packages/loot-core/scripts/test-cfm-upstream.mjs`. The harness adds a larger historical ledger, closed/zero accounts, and deletion records, then checks native and packaged offline recovery. Core tests cover financial calculations, database commands, undo, report immutability, scheduling, and unsupported-schema refusal.

## Implemented Defaults

- Calendar-year planning, with exact monthly allocations and prorated current-month YTD expectations unless an item has a due date.
- “Equities” means investment holdings; net equity remains the residual on the statement.
- Manual, straight-line, fixed-rate, and explicit-schedule valuations; modeled values remain distinct from observations.
- Liquidity includes explicitly selected cash accounts; uncertain AR collections are excluded until enabled in a scenario.
- Printable HTML/PDF plus CSV and structured JSON first; LaTeX remains an optional adapter.
- Application-open bank sync and a separately configured opt-in headless worker.

These defaults are reflected in the workspace and shared calculations. LaTeX remains an optional future adapter; printable HTML/PDF, CSV, and JSON are the implemented formats.
