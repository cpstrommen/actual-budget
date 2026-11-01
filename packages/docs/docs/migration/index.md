# Switching from Another App

Use a native budget import when moving from Actual Budget so your accounts, transactions, and dated balances remain intact. Other applications have their own import workflows.

## Moving between Actual Budget and Actual CFM

- [Migrate an Actual Budget deployment to Actual CFM](./from-actual-budget.md), including Docker/Node setup, native import, bank reconnection, and rollback.
- [Return from Actual CFM to Actual Budget](./return-to-actual-budget.md), preserving the ledger and retaining CFM-only records in a recovery archive.
- [CFM data and recovery formats](./cfm-format.md).

## Migration from YNAB

- [Migration from YNAB4](./ynab4.md)
- [Migration from nYNAB](./nynab.md)

The [API](../api/index.md) is available for custom importers.

## Migration from the old Actual Budget Desktop App

The original managed Actual Budget service used an older desktop app that may not have an export button. Preserve a copy of its original budget folder. A native ZIP containing that folder's `db.sqlite` and `metadata.json` can be used for import; test a copy for version compatibility before replacing your working installation.

See [Restoring Backups](../backup-restore/restore.md) for the native import steps.
