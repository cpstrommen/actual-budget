# Local UI Preview

Use the local preview to review formatting before building or deploying a new CFM version. It renders the actual application from your checkout with a synthetic budget. No sync server or bank credentials are needed.

## Start the preview

Use the Node and Yarn versions pinned in `.nvmrc` and `package.json`. From a development checkout:

```sh
yarn install --immutable
yarn preview:ui
```

Open **http://127.0.0.1:3002/__cfm-preview** if the browser does not open automatically. The command prepares the sample using this checkout's API, builds the plugin assets, and starts the browser development server. Initial preparation takes longer than subsequent UI edits. Keep the original terminal running; **Ctrl+C** stops the preview and its backend watcher. Use **Ctrl+C**, rather than **Ctrl+Z**, to stop build or preview commands: Ctrl+Z leaves suspended jobs behind.

The dedicated port has its own browser storage, separate from deployments on other origins. The server binds to loopback. Running the command again reuses a healthy preview from this checkout without rebuilding or resetting its sample. A port occupied by another application is reported before preparation starts; the command does not silently switch ports. Use this development checkout separately from deployed build artifacts.

For a different dedicated port or to suppress automatic browser launch:

```sh
yarn preview:ui --port 3102 --no-open
```

Use the printed URL consistently: `localhost` and `127.0.0.1` have separate browser storage.

## Review a change

- Edit application components, shared styles, or theme sources. Vite updates the interface live; core worker changes reload the app once a successful backend build finishes. Frontend formatting edits use normal Vite updates. Failed backend builds show an error in the preview status while keeping the server running; fixing the source triggers a rebuild.
- Choose **Light**, **Dark**, or **Midnight** in the preview toolbar.
- Choose **Full width**, **Tablet**, or **Phone**. The app runs in an iframe with the selected viewport width, so its responsive layout uses that width. The toolbar stays outside the app. A narrow outer browser window limits the available preview width.
- Visit Summary, Reports, Balances, Planning, Settings, account registers, and forms. Open an archived report and use its print/export actions to inspect report formatting.
- Click **Reset sample** to restore the original fixture after experimenting. Ordinary reloads retain sample edits. Other local files, including a renamed sample, are preserved by reset.

The sample is anchored at **October 31, 2026** and contains checking/savings, card timing, property and mortgage, an investment holding, annual insurance, receivables with partial repayments, a payable, and an archived annual report. CFM opens at that date so seasonal plans and projections are useful even when today's date changes. Automation starts disabled.

The fixture comes from `scripts/create-cfm-example.mjs`, also used by the recovery checks. Restart `yarn preview:ui` after changing the fixture generator or API model, then reset the sample to import the newly generated data.

## Isolation and deployment

Preview mode selects **no server** and restricts browser connections to the preview origin and local development websocket. Use synthetic data here. It is a formatting environment, not a migration tool or a place to connect a production budget.

The sample ZIP and backend build output use a private OS temporary directory, isolated from other builds. They are removed when the runner exits. Prebundled frontend dependencies are cached outside the checkout for reuse on the same preview port. Sample edits are stored only in this preview origin's browser storage. Removing site data removes those local edits.

The preview shell, sample endpoint, and automatic sample loading are enabled only by the local development runner. Normal browser/server builds do not enable them. Reviewing a change does not publish or deploy it; build and deploy your chosen revision separately after review.

The application's SQLite/SharedArrayBuffer runtime uses COOP/COEP response headers, which the local preview supplies. A hosted preview would need equivalent headers and routing. This command runs locally and does not publish a GitHub Pages site.

## Verification

The preview browser checks exercise sample import, themes, a real phone viewport, repeated reloads, multiple tabs, reset, preservation of other local files, and absence of a sync-server association. They also trigger a backend rebuild by changing a source file timestamp, without changing its contents, to verify that only the application iframe reloads and the current page is retained:

```sh
yarn test:preview
```

It starts a separate preview on port 3012 and needs Playwright's Chromium browser installed. For an already running preview:

```sh
E2E_PREVIEW_URL=http://127.0.0.1:3002 yarn test:preview
```

The launcher regression checks cover occupied ports, duplicate launches, interrupted preparation, and cleanup of child processes:

```sh
node --test scripts/preview-ui.test.mjs
```

These checks do not update visual regression baselines. Use the repository's Docker VRT workflow for release snapshots.

## If startup stalls

Use the Node version in `.nvmrc`. A separate `yarn build:api` is not needed; the preview prepares its API and sample automatically.

Keep source files and installed dependencies downloaded when the checkout is in iCloud Drive or another cloud-backed folder. Files that are offloaded or unexpectedly empty can stall reads or break a fresh build. For frequent development, a checkout outside synchronized Documents/Desktop folders avoids that file-provider dependency.
