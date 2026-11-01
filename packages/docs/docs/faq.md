# Actual CFM FAQ

## What Is Actual CFM?

Actual CFM is independently maintained software derived from Actual Budget. Its direction is annual planning, liquidity management, asset valuation, and net equity. The inherited ledger and monthly budget workflows remain available. The root `wishlist.md` distinguishes planned CFM features from implemented behavior.

## Is This an Actual Budget Release?

No. CFM has its own application identity, support tracker, update source, and development roadmap. Upstream downloads and hosted services do not include CFM changes. Build this repository to run CFM.

## Can I Return to Actual Budget?

Preserving transaction and dated balance history on return is a release requirement. The [return guide](migration/return-to-actual-budget.md) explains the current native export, the planned compatibility exporter, and the verification steps. New CFM financial data features cannot ship before their upstream export has been tested.

## Where Is My Data?

Your working budget is local-first. An optional server synchronizes data across devices; optional encryption protects synchronized budget contents. Backups and exports remain your responsibility. Keep a full CFM backup before transferring a budget.

## Where Do I Report CFM Problems?

Use the [Actual CFM issue tracker](https://github.com/cpstrommen/actual-budget/issues). Upstream community channels do not maintain or support this fork.
