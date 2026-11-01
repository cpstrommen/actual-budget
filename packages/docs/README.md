# Actual CFM Documentation

Local documentation for Actual CFM, a personal fork of Actual Budget focused on annual planning, cash flow, liquidity, and asset valuation. Existing guides describe inherited functionality; the CFM additions are planned in [wishlist.md](../../wishlist.md).

## Local Development

From the repository root, with the Node and Yarn versions specified by the project:

```sh
yarn install
yarn start:docs
```

Build the documentation with:

```sh
yarn build:docs
```

The site is built with Docusaurus. User guides live in `docs/`; technical reference lives in [docs/development](docs/development/index.md). Use relative Markdown file links within the docs so Docusaurus can validate them.

The upstream website and downloads describe Actual Budget. They are reference material for the inherited application, not releases of Actual CFM.
