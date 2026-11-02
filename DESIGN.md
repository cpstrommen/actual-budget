---
name: Actual CFM
description: Annual planning, liquidity management, and financial position
colors:
  cfm-ink: '#1f1f1f'
  cfm-surface: '#242424'
  cfm-graphite: '#444444'
  cfm-mist: '#f2f2f2'
---

# Actual CFM Design System

Actual CFM is a financial workspace for the year ahead and the assets behind it. Present annual plans, current liquidity, liabilities, and net equity with explicit dates and traceable assumptions. Financial features in `wishlist.md` remain planned until implemented.

## Identity

The CFM mark is a rising three-bar horizon, distinct from the upstream Actual Budget symbol. Canonical vector sources live in `assets/brand/`. Web, desktop, mobile, and documentation icons are generated from those sources. Historical upstream material is kept in `archives/upstream/`; it is not CFM branding or release history.

Use **Actual CFM** in product copy. Use **Actual Budget** only when explicitly naming the upstream product, attribution, or compatibility/import format. JavaScript bridge names, package namespaces, CLI/environment contracts, and native budget-format identifiers remain compatibility identifiers rather than display branding.

## Colors

The default palettes use neutral greys inspired by Strømmen's site: `#1f1f1f`, `#242424`, `#444444`, and `#f2f2f2`. The full neutral ramp is defined in `packages/component-library/src/themes/palette.css`; light, dark, midnight, and sidebar mappings use semantic tokens.

- Light: white and mist surfaces, graphite/ink text and actions.
- Dark and midnight: ink and graphite surfaces with light text and neutral selection.
- Keep positive/negative/warning/information colors meaningful. Forecast uncertainty needs a label, not just a color.
- Use `theme.*` semantic tokens in components. Legacy palette/role names remain available to custom themes; their names do not dictate product branding.
- Check text, controls, disabled states, focus, and charts across themes. Aim for WCAG AA contrast, keyboard access, and reduced-motion support.

## Typography and Layout

Use the locally bundled Geologica variable font, matching Strømmen's site, with the existing system fallback stack. Its source and SIL Open Font License live in `assets/fonts/geologica/`. Offline report packages embed the font and license; run `node scripts/generate-font-assets.mjs` after changing the source. Render standalone financial amounts with `FinancialText` or the tabular numeral styles. Align amounts by column and keep signs and units explicit.

Use compact tables for financial records and clear summaries for annual performance, upcoming cash needs, and valuation dates. Distinguish posted activity, observations, and forecasts. Reuse existing shared components and responsive sizes; mobile controls need adequate touch targets.

## Portability and Trust

Data freshness, valuation methods, and report cutoffs must be visible. Export copy must distinguish native CFM backups from tested upstream-compatible exports. A future conversion must preserve transaction and dated balance history; it cannot rely on this theme or any CFM-only rendering logic.
