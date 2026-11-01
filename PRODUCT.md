# Actual CFM Product Direction

## Users

People managing their own finances who want to plan over a full year and understand their longer-term financial position. Their expenses vary by month, they may hold investments and other assets, and they need to know whether cash on hand will cover upcoming obligations. Routine transaction tracking supports that broader view.

## Product Purpose

Actual CFM is a personal fork of Actual Budget for cash flow management. It combines annual planning, liquidity forecasting, asset valuation, liabilities, and net equity in a local-first application. The existing ledger and monthly budgeting tools provide the foundation; the implementation is recorded in [wishlist.md](wishlist.md).

Success means being able to explain the annual plan, compare YTD actuals against seasonal expectations, assess short-term cash coverage, and produce a dated financial statement with traceable balances and valuation assumptions.

## Core Workflows

- Set an annual plan by category, including uneven monthly spending expectations.
- Review available cash against credit card obligations, bills, receivables, and payables.
- Update manual account balances and asset valuations without rebuilding transaction history.
- Track reimbursements and debts through partial settlement, completion, or write-off.
- Generate consistent period reports and retain the figures and assumptions used at the time.

## Brand Personality

Calm, precise, practical. Actual CFM should feel like a dependable personal financial workspace: clear tables, quiet controls, and explicit assumptions. Use the neutral greys from Strømmen's site through the semantic light, dark, and midnight themes.

## Design Principles

- **Show the planning horizon.** Annual totals, YTD progress, upcoming obligations, and historical comparisons should be easy to find.
- **Keep the numbers explainable.** Distinguish posted transactions, estimates, valuations, and projected cash flows. Show dates and data freshness.
- **Separate cash from wealth.** An asset can increase net worth without helping pay next month's credit card bill.
- **Keep one financial foundation.** Plans and forecasts use the same ledger and account classifications as reports, with explicit adjustments for different views.
- **Preserve local ownership.** Data stays on the user's device or own server, with optional synchronization and encryption.
- **Reuse shared components.** Web, desktop, and mobile use the component library and semantic theme tokens.

## Accessibility

Retain keyboard navigation, reduced-motion support, tabular financial numerals, and sufficient contrast across light, dark, and midnight themes. Amounts, status, and forecast uncertainty need text or symbols as well as color.

## Data Portability

Returning to upstream Actual Budget without losing transaction or dated balance history is a release requirement. Before any CFM financial schema extension ships, implement and test an upstream-compatible exporter plus an offline recovery path. Preserve CFM-only records in open audit/archive formats. Native database backups alone are not a downgrade guarantee. See [the return guide](packages/docs/docs/migration/return-to-actual-budget.md) and the portability section in [wishlist.md](wishlist.md) for current status and acceptance criteria.
