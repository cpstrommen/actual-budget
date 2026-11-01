# Returning to Actual Budget

Actual CFM exports your ledger for **Actual Budget 26.10.0**, pinned to commit `5897cfa65afec3d0252d7467e5b7a033fb66900b`. The compatibility harness imports the file into unmodified upstream code and compares supported records and dated ledger movements after exporting it again. Other upstream versions are not certified by this target.

Transactions and dated balances remain ordinary ledger entries. Returning does not replace account history with one opening balance. CFM-only plans, valuations, obligations, and report snapshots remain readable in a companion recovery archive.

## Return procedure

1. Finish transactions and synchronization. Disable scheduled work for the final export.
2. Keep a native CFM backup and a separate copy of the existing data directory.
3. Choose **Settings → Export → Export for Actual Budget**, or the same action in **Cash flow management → Financial position**. Save both ZIP files. Both are unencrypted, including when the source uses encryption.
4. Inspect `receipt.json` inside the recovery ZIP. Check the target, transaction counts, historical balance checkpoints, and warnings about existing unresolved links. Unsupported schemas and failed financial comparisons stop export.
5. In a separate installation of the pinned upstream version, close the current budget, select its Actual import format, and import the upstream ZIP as a **new budget**. Keep CFM's original directory and sync group separate.
6. Compare account names, dated balances, counts, splits, transfers, notes, and reconciliation flags against the receipt and source. Configure upstream sync and bank connections separately after checking history.
7. Retain the recovery ZIP. Its JSON/CSV records, reports, and full snapshot remain useful after the fork stops being maintained.

Do not remove migration records or edit a live database to force an unsupported version to open. The dedicated exporter constructs a clean target database and resets sync identities.

## Preserved records

The upstream file preserves supported accounts, opening balances, transactions, dates, amounts, payees, categories, user notes, splits, transfer links, cleared/reconciled flags, schedules, rules, and monthly budgets. Realized valuations, corrections, settlements, write-offs, and reversals have dated native representations. Forecasts never become invented historical cash flows.

The recovery ZIP retains CFM records in JSON/CSV, available edit/deletion messages, tombstones, and an original full snapshot. Reports include HTML, CSV, and JSON. Upstream cannot run CFM-only interfaces, but the records remain readable. The [format specification](cfm-format.md) describes every archive file and its hashes.

## Automatic recovery copies

After financial changes, the running worker refreshes validated `cfm-upstream.zip`, `cfm-recovery.zip`, and `cfm-portability-receipt.json` in the budget directory after a short debounce. Automatic native backups include the most recent successful copies when present. **Financial position** shows their timestamp and export failures. A suspended or closed app cannot refresh them. Copies may lag recent edits, particularly if the app closes immediately after an edit; request a final fresh export before leaving CFM.

## Offline recovery after maintenance ends

A prepared recovery runtime requires a compatible Node installation and a local native backup. No server, login, network access, or maintained CFM service is required:

```sh
node scripts/cfm-export-upstream.mjs /path/to/native-cfm-backup.zip /path/to/new-output-directory
```

Run inside the downloaded recovery-runtime directory. It produces `actual-budget.zip`, `cfm-recovery.zip`, and `receipt.json`. The output directory must be new. The source is read into an isolated temporary budget and remains unchanged. Check the receipt and follow the procedure above.

Prepare a runtime from source before relying on it:

```sh
yarn install
yarn build:api
node scripts/package-cfm-recovery.mjs /path/to/new-recovery-runtime
```

The package includes the built API, migrations, target schema, recovery commands, documentation, SQLite runtime/dependencies, a synthetic example budget, licenses, and a SHA-256 manifest. It needs Node but no dependency installation during recovery. Retain a package for your operating system and CPU; native SQLite addons are platform-specific. `.nvmrc`, `package.json`, and `yarn.lock` pin the development environment. Keep a tested runtime with your backups.

Native backups alone are not a general downgrade guarantee. Future CFM or upstream releases may need a different adapter. Keep the converter, runtime, receipt, and native backup from the same CFM release together.
