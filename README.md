# Actual CFM

**Cash flow management for the year ahead and the assets behind it.**

Actual CFM is a personal fork of [Actual Budget](https://github.com/actualbudget/actual), built on its local-first ledger, account management, reporting, and optional device synchronization. Its focus is long-term annual planning, liquidity, and a clear view of assets, liabilities, and net equity.

The aim is to answer practical questions: Are annual expenses on track despite seasonal spending? Can available cash cover upcoming obligations? What are assets worth today, and how does that change the overall financial position?

## Direction

- Annual category plans with seasonal allocations and year-to-date comparisons.
- Liquidity projections that connect cash balances with credit cards, upcoming bills, receivables, and payables.
- Asset accounts with manual valuations and scheduled depreciation or appreciation.
- Balance sheets and configurable monthly, quarterly, annual, and YTD report packages, with saved historical snapshots.
- Simple balance updates for manual off-budget accounts and configurable bank synchronization.
- A restrained grey visual identity drawn from Strømmen's site (implemented).

The financial additions above are **planned features**. The distinct CFM identity, icons, and neutral theme are implemented. [wishlist.md](wishlist.md) contains the feature requirements, implementation phases, dependencies, and acceptance criteria. The existing application still includes Actual's monthly budgeting workflows while the CFM features are developed.

## Run This Fork

Use the Node version in [.nvmrc](.nvmrc) and the Yarn version declared in [package.json](package.json). Run commands from the repository root:

```sh
yarn install
yarn start
```

Open `http://localhost:3001`. For sample data, choose **Don't use a server**, then **View demo** on the setup screen.

To run the frontend with a local sync server:

```sh
yarn start:server-dev
```

To build the browser or server:

```sh
yarn build:browser
yarn build:server
```

The upstream hosted demo, Docker images, npm packages, and desktop downloads are Actual Budget builds. Build from this checkout to use Actual CFM changes.

## Project Layout

| Package                         | Purpose                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `packages/loot-core`            | Ledger, calculations, persistence, synchronization, and business logic |
| `packages/desktop-client`       | React web interface shared with the desktop app                        |
| `packages/component-library`    | Shared components and theme tokens                                     |
| `packages/desktop-electron`     | Electron desktop wrapper                                               |
| `packages/sync-server`          | Optional sync server and bank-provider integrations                    |
| `packages/api` / `packages/cli` | Programmatic access and automation                                     |
| `packages/docs`                 | Local documentation site                                               |

See [PRODUCT.md](PRODUCT.md) for product direction, [DESIGN.md](DESIGN.md) for interface context, and [AGENTS.md](AGENTS.md) for development context. Package identifiers, commands, and data formats retain their existing Actual names for compatibility.

## Development

```sh
yarn typecheck
yarn lint
yarn test
yarn start:docs
```

Technical setup and architecture notes are in [the development documentation](packages/docs/docs/development/index.md). This personal fork does not use the upstream contribution policies, PR templates, or contributor-management workflow.

## Origin and License

Actual CFM is derived from Actual Budget and retains its [MIT license](LICENSE.txt) and copyright notices. [Upstream documentation](https://actualbudget.org/docs/) remains useful for inherited functionality; CFM-specific behavior is documented in this repository.

## Data Portability

Returning to upstream Actual Budget without losing transaction or dated balance history is a release requirement. Before any CFM financial schema extension ships, implement and test an upstream-compatible exporter plus an offline recovery path. Preserve CFM-only records in open audit/archive formats. Native database backups alone are not a downgrade guarantee. See [the return guide](packages/docs/docs/migration/return-to-actual-budget.md) and the portability section in [wishlist.md](wishlist.md) for current status and acceptance criteria.
