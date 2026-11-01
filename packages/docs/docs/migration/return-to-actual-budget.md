# Returning to Actual Budget

Actual CFM is separate software derived from Actual Budget. Keeping your financial records portable is a release requirement: returning to upstream must preserve your transaction ledger and dated balance history.

## Current Status

This checkout still uses the inherited ledger format and has no CFM financial schema migrations. Its existing **Settings → Export → Export data** action produces a ZIP containing `db.sqlite` and `metadata.json`. The ZIP is unencrypted even when the source budget uses encryption.

The dedicated **Export for Actual Budget** converter and its upstream compatibility tests are **planned, not implemented**. They are required before shipping CFM financial extensions. A native database backup is not a general downgrade guarantee: upstream can reject unknown migrations. Only use a target version whose compatibility has actually been verified; this documentation does not yet certify a tested CFM/upstream release pair.

## Return Procedure

For the inherited-format checkout, use the existing export action. Once CFM financial extensions ship, use the dedicated compatibility export supplied with that release instead. The intended workflow is:

1. Finish pending transactions and synchronization in CFM. Pause automated financial jobs for the final export.
2. Save a full CFM backup. Keep a separate copy before changing installations.
3. Export the upstream-compatible ZIP and accompanying audit archive. Check the validation receipt and the named supported upstream version. For this checkout, the native ZIP is the available export and requires an independent import check.
4. Open a separate upstream Actual Budget installation. Close its current budget, choose **Import file**, select its **Actual** import format, and import the ZIP as a new budget. Do not reuse CFM's live sync group or overwrite the original directory.
5. Compare account lists, transaction counts, signed balances, historical balance checkpoints, splits/transfers, notes, and reconciliation states with the export receipt or the original CFM budget. Investigate discrepancies before proceeding.
6. Configure upstream synchronization and bank connections separately. Reconnect bank imports carefully so already imported transactions are not duplicated.
7. Keep the CFM backup and audit archive until you are satisfied with the imported history. You can keep them indefinitely for CFM-only records.

If an upstream version rejects the ZIP, stop and retain the source backup. Do not delete migration records or edit the live database to force it to open. Use the converter and upstream version supplied with a release that has passed the compatibility gate.

## What Is Preserved

The required export preserves accounts, opening balances, all posted transactions and their effective dates, amounts, categories, payees, splits, transfers, notes, and cleared/reconciled state. Dated balance corrections, realized asset valuations, settlements, and write-offs have ordinary ledger representations, so returning does not reduce history to a single current balance.

Detailed valuation/balance observations and available transaction edit/deletion history also remain in an open JSON/CSV audit archive. Deleted transactions stay deleted in the upstream working budget; their audit records remain available separately. Observations that never changed the ledger remain observations; they are not invented transactions. Forecast values stay forecasts.

CFM-specific annual plans, asset policies, obligation details, forecast scenarios, and report layouts are preserved as files in the companion archive. Upstream cannot display CFM-only interfaces. Archived reports remain readable, and the records are retained for future conversion or a return to CFM. CSV alone is not the financial migration format because it cannot preserve the entire native ledger structure.

## If Actual CFM Is No Longer Maintained

The implementation plan requires every data-feature release to include an offline exporter, a documented format, and a pinned compatible upstream target. A local backup plus that release must be sufficient; a running CFM hosting service is not required. Maintain current local backups and check the timestamp of the latest validated upstream export rather than relying on an old backup.

This is the release contract for future CFM data features. It is not a claim that the unimplemented converter is available in this checkout.
