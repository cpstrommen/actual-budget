# Working on Actual CFM

Actual CFM is a personal fork of Actual Budget for annual planning, liquidity management, asset valuation, and net equity. [PRODUCT.md](PRODUCT.md) describes the direction; [wishlist.md](wishlist.md) contains the implementation roadmap and feature acceptance criteria.

## Repository Context

This is a TypeScript/React monorepo using Yarn 4 workspaces. Run Yarn commands from the repository root; use `yarn workspace <name> <command>` for individual packages. Use the Node version in `.nvmrc` and Yarn version in `package.json`.

| Area                                                | Location                                                |
| --------------------------------------------------- | ------------------------------------------------------- |
| Ledger, calculations, database, core business logic | `packages/loot-core` (`@actual-app/core`)               |
| React web and desktop interface                     | `packages/desktop-client` (`@actual-app/web`)           |
| Shared components and themes                        | `packages/component-library` (`@actual-app/components`) |
| Desktop wrapper                                     | `packages/desktop-electron`                             |
| Sync server and bank-provider integrations          | `packages/sync-server`                                  |
| API and CLI                                         | `packages/api`, `packages/cli`                          |
| Local Docusaurus documentation                      | `packages/docs`                                         |

Technical reference: [development documentation](packages/docs/docs/development/index.md).

## Development Commands

```sh
yarn install
yarn start                 # frontend on localhost:3001
yarn start:server-dev      # frontend plus sync server on localhost:5006
yarn start:desktop
yarn typecheck
yarn lint
yarn lint:fix
yarn test                  # Vitest through Lage
yarn e2e                   # Playwright
yarn vrt:docker            # visual regression tests
yarn build:browser
yarn build:server
yarn start:docs
```

For manual testing, select **Don't use a server**, then **View demo** to get a populated budget. VRT snapshots depend on Linux rendering; generate them in the project's Docker environment and scope updates to the changed tests.

## Implementation Context

- Keep financial calculations in the core so the UI, API, reports, and automation share results. Use integer minor units and explicit rounding.
- Persist new financial data through the existing database, migration, sync, backup, and undo mechanisms. Preserve historical transactions and distinguish non-cash valuations from cash flows.
- `offbudget` controls budget participation; CFM asset/liability and liquidity classifications are separate concepts. The roadmap describes the proposed additions.
- Retain workspace names, environment variables, storage identifiers, and platform exports unless deliberately migrating them. Branding alone does not require changing compatibility identifiers.
- Use TypeScript, existing entity types, functional React components, and shared components. React Compiler handles routine memoization.
- Follow platform-specific package exports; avoid direct cross-platform imports.
- Use translated user-facing strings and `FinancialText` (or tabular numeral styles) for financial figures.
- Read [DESIGN.md](DESIGN.md) for current theme mechanics and the planned grey palette. Use semantic theme tokens.
- Generated icons and package build output are generated artifacts; change their sources instead.

## Scope of Repository Guidance

This personal fork has no upstream contribution-policy requirements, AI prefixes, special PR-body rules, mandatory release-note submissions, or contributor-management bots. Keep license and copyright notices intact. Run checks appropriate to the changes; the lint, typecheck, test, and pre-commit formatting tools remain available.

## Data Portability

Returning to upstream Actual Budget without losing transaction or dated balance history is a release requirement. Before any CFM financial schema extension ships, implement and test an upstream-compatible exporter plus an offline recovery path. Preserve CFM-only records in open audit/archive formats. Native database backups alone are not a downgrade guarantee. See [the return guide](packages/docs/docs/migration/return-to-actual-budget.md) and the portability section in [wishlist.md](wishlist.md) for current status and acceptance criteria.
