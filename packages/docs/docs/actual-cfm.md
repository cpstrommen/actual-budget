# Using Actual CFM

Open **Cash flow management** in the sidebar. The as-of date controls historical statements and report cutoffs. Monthly budgets, account registers, imports, reconciliation, and existing reports remain available.

To bring an existing deployment and its history into CFM, start with [Migrating from Actual Budget](migration/from-actual-budget.md).

## Try the complete example

Build the API, then generate a separate synthetic file:

```sh
yarn build:api
node scripts/create-cfm-example.mjs /path/to/new-cfm-example.zip
```

Import that ZIP as a new Actual CFM file and select **2026-10-31**. It includes checking/savings, card timing, property and mortgage, investment modeling, November insurance, the three-friend ticket example, partial repayments, a payable, and an archived annual report. Automation starts disabled. This same example drives the upstream compatibility harness.

## Financial position and manual balances

Classify accounts as cash, investment holdings, other assets, credit cards, loans, receivables, or payables. Classification is separate from monthly-budget participation. Give changes an effective date. Select available liquid accounts explicitly; restricted cash, investments, and AR are excluded by default. Specify current/long-term debt and card payment account, statement day, and payment day.

The balance sheet uses dated ledger values and derives net equity as assets less liabilities. Mortgage debt remains a liability while property retains its gross asset value. Review unclassified accounts and unusual-sign warnings.

Create manual tracking accounts here. **Set balance** is also available in an eligible account's register. Enter a signed target, date, and reason. Review the existing balance and proposed difference. The core rejects a stale preview, includes cleared/uncleared transactions through that date, preserves later entries, and creates no transaction for zero difference. Undo reverses the operation. Bank-linked, on-budget, and managed obligation accounts use their own workflows.

## Annual planning

Save an annual amount by category/year. Choose equal allocations, twelve exact custom amounts, or twelve integer weights. Dated one-off amounts are included in the annual total and enter expected YTD on their due dates. A November insurance bill therefore does not distort spring comparisons.

Expense actuals include refunds, exclude transfers, and count splits once. Positive expense variance means over plan. Choose prorated or full-current-month expectation. Next-year copies are independent. Report snapshots retain the revision and materialized figures used.

Plans do not fund envelopes automatically. Open **Monthly funding preview** to review January through December. **Apply all twelve amounts to monthly budgets** explicitly replaces that category's twelve monthly allocations and supports Undo.

## Assets

Choose a manual tracking account whose acquisition balance is already in the ledger. Add a manual, straight-line, fixed annual percentage, or dated-schedule policy. Set frequency, compounding, residual value, useful life, linked debt, and disposal date as applicable. A policy revision requires a later effective date and retains earlier policies.

The table distinguishes modeled and observed values. **Record value and ledger adjustment** realizes a dated non-cash observation. The balance sheet uses the ledger; the asset preview may show unposted modeled values. It never adds both. Optional automatic realization preserves the original simple/compound basis. Disposal ends the model; record actual proceeds separately and realize the disposed value in the ledger.

## Receivables, payables, and credits

Create manual control accounts, then individual obligations by counterparty. Linking a source transaction/split allocates its value using ordinary split/transfer entries. For a new unpaid payable, choose an expense recognition account/category or an off-budget asset account. Non-cash zero-total splits recognize expenses; paired asset/liability entries recognize financed assets. Cash moves on payment.

For four $100 tickets on a $400 card charge, create three $100 receivables linked to that charge. The card stays -$400, entertainment becomes $100, and AR becomes $300. Match imported deposits to settlements, including partial payments. Allocate a single deposit to several items through separate settlement operations without duplicating its cash amount.

**Allocate from this control account's existing balance** itemizes an older manual balance. The core checks the unallocated amount and avoids posting it again. Compare the proposed allocation with the account first.

Overpayment credit is explicit: settle the debt's share, then create a payable for the excess linked to the remaining deposit. Refund or settle that credit separately. A settlement cannot exceed the outstanding item.

Write-offs need a reason. AR uses the obligation's loss category and an on-budget adjustment account with zero cash movement. AP release is a labeled non-cash liability reduction. A reversal reopens the obligation without reversing actual cash; use Undo if a newly entered payment itself was a mistake. Ordinary register edits cannot independently alter managed amounts, dates, or transfer links. Notes and reconciliation flags remain editable.

## Liquidity scenarios

Choose 30/60/90 days, a 12-month view, or an end date. Select a cash account for residual annual-plan estimates, optional AR collections, collection delay, and minimum cash threshold. Review daily/monthly cash, minimum cash/date, shortfalls, liability coverage, exclusions, stale accounts, missing card timing, and undated obligations.

Posted transactions replace matching schedule occurrences. Selected-cash transfers net to zero; transfers to excluded accounts reduce cash. Card purchases affect debt while payment cycles determine cash movement. Annual estimates cover the remaining plan after actuals and known events. Zero liabilities show an unavailable ratio instead of infinity. Scenarios do not post transactions.

## Report packages

Create ordered balance-sheet, annual-plan, liquidity, asset, AR/AP, and filtered chart/table sections. Choose monthly, quarterly, annual, YTD, or custom periods and generate at the selected as-of date. Stock values use that date; transaction tables use resolved start/end dates. Liquidity is a forward scenario from the as-of date.

Runs retain template revision, calculation version, dates, currency, timezone, assumptions, warnings, and materialized results. Later ledger/template edits do not rewrite them. Export HTML, CSV, or JSON. **Print / save PDF** uses browser printing, with embedded charts and repeating table headings. Snapshots sync and back up with the budget; independently saved files do not sync automatically.

## Automation

Select one scheduler identity, budget timezone, refresh interval, and bank accounts. Enable asset realization and report schedules separately. Application mode requires a running, unlocked app and performs one bounded catch-up after suspension. History shows success, next attempt, backoff, and reconnection errors. Retry paused jobs after reconnecting a bank.

Headless mode needs a separately launched worker with local credentials:

```sh
yarn build:api
node scripts/cfm-automation-worker.mjs --server-url http://localhost:5006 --sync-id YOUR_SYNC_ID --device-id YOUR_SELECTED_ID --data-dir /private/path/cfm-worker --password-file /private/path/server-password --encryption-password-file /private/path/budget-password
```

Encryption credentials are needed only for encrypted budgets. Password files contain one password; restrict them to the worker's OS user. Environment variables `ACTUAL_PASSWORD[_FILE]` and `ACTUAL_ENCRYPTION_PASSWORD[_FILE]` are alternatives. Keep the worker directory private because it contains an unlocked database. Stop before rotating/revoking credentials, then restart with replacements. Shutdown closes the budget and signs out its API session. Encryption keys never enter ordinary synced settings. The encrypted sync server cannot run the ledger on its own.

Use one worker/data directory per selected identity. Its local lock prevents duplicate processes in that directory; do not clone the identity into simultaneous workers elsewhere. Stable operation keys protect financial retries. Manual and scheduled bank calls share an overlap lock; SimpleFIN uses its batch path and existing import deduplication. Provider errors back off. Reports run after requested refreshes and retain failure warnings.

## Leaving the fork

Use **Export for Actual Budget** and retain both ZIP files. The [return guide](migration/return-to-actual-budget.md) covers the pinned target, preserved history, receipt, and offline recovery after maintenance ends. The [format specification](migration/cfm-format.md) describes the open archive.
