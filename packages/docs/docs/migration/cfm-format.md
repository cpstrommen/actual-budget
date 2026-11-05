# Actual CFM data and recovery formats

CFM format version 1 uses the inherited Actual Budget ledger schema. No CFM SQL migrations or columns are added. Internal workspace, database, storage, and environment identifiers retain their compatibility names.

## Synced extension records

The ordinary `notes` table stores one JSON envelope per extension record. Its database ID is `cfm:v1:<record-id>`. These IDs are reserved. User-entered account, category, and transaction notes keep their normal IDs.

```json
{
  "id": "example-plan",
  "kind": "annual-plan",
  "updatedAt": "2026-10-31T12:00:00.000Z",
  "data": {
    "year": 2026,
    "categoryId": "category-id",
    "amount": 120000,
    "currency": "USD",
    "revision": 1
  }
}
```

Amounts are signed integer ledger units (100 units per displayed whole currency unit, following the inherited ledger). Dates are calendar `YYYY-MM-DD` strings; recorded timestamps are ISO timestamps. One budget uses one reporting currency. CFM rejects mixing currencies in a financial view; it does not infer exchange rates.

Supported kinds are `classification`, `annual-plan`, `asset`, `obligation`, `settlement`, `report-template`, `report-run`, `automation`, and `audit`. Their TypeScript definitions live in `packages/loot-core/src/types/models/cfm.ts`, `shared/cfm-reports.ts`, and `shared/cfm-automation.ts`. Each envelope is synced and participates in ordinary undo and backups. Deletion clears its note; an audit envelope retains the prior contents. Financial operations use stable request IDs and audit receipts. Valuation and settlement records link to dated ordinary transactions. Forecasts have no ledger entries.

Asset policies retain effective-date history. Observations record effective date, recorded timestamp, source, value, and any adjustment transaction. A `modeled` observation records realization of the existing model without resetting its calculation basis. A manual observation establishes a new basis. Reports retain materialized results, template revision, calculation version, resolved dates, warnings, and assumptions. HTML/CSV/JSON are generated deterministically from that snapshot and need no live financial queries. Report snapshots sync as notes; exported HTML/PDF files on the user's filesystem do not sync independently.

Obligations retain their original financial terms and separate payment/write-off/reversal allocations. Zero-total split entries represent non-cash expense recognition or reclassification: their account balance movement is zero, while a transfer child offsets the AR/AP control entry and a category child records the expense or release. They preserve cash and survive upstream import. Overpayment credit is a separate payable, rather than an undocumented negative receivable.

## Upstream export

`upstream-schema.json` pins Actual Budget **26.10.0**, commit `5897cfa65afec3d0252d7467e5b7a033fb66900b`, its migration file hashes, table definitions, indexes, and triggers. The exporter creates a fresh schema and copies supported rows field for field. Unsupported tables, columns, migration histories, fractional monetary values, or failed comparisons refuse export. Computed caches, sync messages, and the generated-view hash are omitted from the working target; upstream rebuilds its views and clock. Reserved CFM notes go into the companion archive. Cloud/group/key identities are reset for a separate imported budget.

`actual-budget.zip` contains `db.sqlite` and `metadata.json`. It retains ordinary ledger records, tombstones, splits, transfers, schedules, rules, monthly budgets, user notes, and cleared/reconciled flags. The receipt compares transaction counts and signed running balances at every transaction date. Existing unresolved split/transfer links are preserved and listed as warnings, so they can be investigated against the source.

`cfm-recovery.zip` contains:

- `receipt.json`: target commit/version, timestamps, source and output SHA-256 hashes, copied table counts, dated balance checkpoints, archive entry hashes, warnings, and representation changes.
- `cfm-records-and-audit.json`: raw extension notes and available CRDT messages/clocks/pending records, plus discarded derived metadata.
- `cfm-records.csv`: envelope ID, kind, recorded timestamp, and JSON data for inspection in ordinary tools.
- `transactions-including-deletions.json`: all source transaction rows, including tombstones.
- `full-cfm-backup.zip`: the original snapshot and metadata before compatibility conversion.
- `reports/<run-id>.html`, `.csv`, and `.json`: readable archived report runs.

These files are unencrypted. A native ZIP supplied to offline recovery may already have had CRDT edit messages removed by the inherited export path. Recovery preserves the messages still present; it cannot reconstruct discarded messages. The automatic CFM recovery archive preserves messages from its live snapshot. Effective-dated financial entries and explicit CFM observations remain available in either case.

## Local automation state

Device identity, job leases, retry state, and portability-copy status are local global preferences scoped by budget. They are not financial records or shared encryption credentials. Automation configuration syncs the selected writer identity, timezone, intervals, selected accounts, and enabled job types. The opt-in headless worker holds a local exclusive lease in its data directory. Run one worker per selected identity and budget; do not clone that identity into concurrent workers with separate data directories. Server and encryption passwords are supplied locally through environment variables or protected files.

## Reproduce the compatibility check

From the repository root, with its pinned Node/Yarn versions and installed dependencies:

```sh
yarn build:api
node packages/loot-core/scripts/test-cfm-upstream.mjs
```

The harness extracts the pinned, unmodified upstream core/API from Git, builds it in an isolated temporary directory, imports a CFM compatibility export, exports again upstream, and compares supported table rows and dated ledger movements. It also runs offline recovery from a native backup. The Git history containing the pinned commit is needed to run the test, but is not needed to use the packaged recovery runtime.

## Property valuation sources

An asset may use the `source-average` policy and carry `valuationSources`. Each source has an ID, label, optional HTTP/HTTPS URL, start date, optional retirement date, and append-only `readings`. Readings retain their request ID, effective date, integer minor-unit value, recorded timestamp, source label, and original URL. Aggregate asset observations carry `sourceInputs` snapshots identifying the reading contributed by each source. The current source URL can change without changing the URL retained by earlier readings.

A source reading or retirement can create an ordinary non-cash account adjustment. The upstream-compatible database carries those native transactions and dated balances. Source definitions, readings, input snapshots, and audit receipts remain in `cfm-records-and-audit.json`, `cfm-records.csv`, and the full native backup. Offline recovery uses the same representation; no CFM SQL schema migration is required.
