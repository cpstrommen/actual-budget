# Migrating from Actual Budget to Actual CFM

Move your existing deployment by starting a separate Actual CFM instance and importing a native Actual Budget export. This preserves the ledger and gives the CFM copy its own synchronization identity. Keep the original deployment and backups until you have checked the imported history and the return path.

You do not need to recreate accounts, import transaction CSVs, or replace account histories with opening balances.

## Compatibility and what moves

This fork is based on **Actual Budget 26.10.0**. Its [verified return target](return-to-actual-budget.md) is that release at commit `5897cfa65afec3d0252d7467e5b7a033fb66900b`. Test a copy before migrating from another release, especially a newer or nightly build. If CFM rejects the database version, stop and use a compatible application version; do not remove migration records or modify the schema to force it open.

| Item                           | Migration behavior                                                                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts and ledger            | The native file carries account identities, open/closed and on/off-budget state, transactions, dates, amounts, splits, transfers, notes, payees, categories, and cleared/reconciled flags. Dated balances remain derived from the original transactions. |
| Existing budgets and tools     | Monthly budget allocations, schedules, rules, and saved report definitions travel with the budget. Monthly budgeting remains available in CFM.                                                                                                           |
| Server administration          | Server passwords, users, sharing permissions, authentication configuration, and bank-provider credentials need setup on the fresh CFM server. A budget export does not migrate the whole server.                                                         |
| Encryption and synchronization | Import creates a separate budget/sync identity and clears the source encryption association. Enable encryption explicitly for the CFM copy. The exported ZIP itself is unencrypted.                                                                      |
| CFM features                   | Classifications, annual plans, valuation policies, obligations, and CFM report packages are configured after import. CFM does not invent historical valuations that were never recorded upstream.                                                        |

Keep the original server and local budget snapshots as well as the export if you need to retain available mutation journals, earlier backups, or other files outside the native ZIP. Do not reset sync or compact the source just to make the migration smaller when preserving that history matters.

## 1. Prepare the source and backups

1. Record the upstream client/server versions, installation method, server address, data-volume paths, authentication method, and bank providers. Retain the original image tag or executable and deployment configuration.
2. Synchronize every device with pending changes. Pause external scripts, automatic bank imports, and automatic scheduled-transaction posting, recording which settings you will restore later. Then stop editing the upstream budget for the migration window. Repeat the export for each budget you intend to move.
3. In upstream Actual Budget, open **Settings → Export data** and save the native ZIP. It contains `db.sqlite` and `metadata.json`; a transaction CSV or a bank-download file is not a substitute. Unlock an encrypted budget before exporting. Store the ZIP privately because it contains unencrypted financial data.
4. Save a reference for comparison: account balances including uncleared entries, reconciled balances, transaction counts, closed accounts, and balances at earlier dates such as the previous year end. Keep representative splits, transfers, and notes available for inspection.
5. If you administer the server, back up its complete persistent data directory, including `server-files`, `user-files`, configuration, and any separately mounted secrets/certificates. Stop the server during a filesystem copy or use a consistent storage snapshot; copying a running SQLite file alone is insufficient. Also preserve local desktop-only budgets and unsynchronized local data. On managed hosting, retain the available provider backup alongside your native exports.

The procedure below uses a **new, empty CFM data directory or volume**. Do not mount the upstream data volume into CFM or let the two applications write the same directory.

## 2. Build this fork

Upstream Docker images, npm packages, desktop installers, and hosted demos run Actual Budget. Changing their display name or image tag does not install CFM.

Use the Node version in `.nvmrc` and Yarn version in `package.json`. With Git and Corepack available, run:

```sh
git clone https://github.com/cpstrommen/actual-budget.git actual-cfm
cd actual-cfm
corepack enable
corepack install
yarn install --immutable
yarn build:server
git rev-parse HEAD
```

Check out your intended CFM revision before installing/building, and record the resulting commit with your deployment configuration. `yarn build:server` builds the browser interface and sync server. See [Build from Source](../install/build-from-source.md) for platform prerequisites.

Choose one of the deployment options below. The browser interface served by that deployment should identify itself as **Actual CFM** and contain **Summary**, **Reports**, **Balances**, and **Planning** in the left menu.

### Docker deployment

After the source build above, build the runtime image from the repository root:

```sh
docker build --file packages/sync-server/docker/ubuntu.Dockerfile --tag actual-cfm:local .
```

This Dockerfile packages the prebuilt browser/server output and installs runtime dependencies for the container. The repository-root `Dockerfile` and `docker-compose.yml` are for development; use the sync-server Dockerfile for this deployment.

Save the following as `compose.cfm.yaml` in the repository root. Use a new Compose project/volume name if you already have a CFM test installation:

```yaml
services:
  actual-cfm:
    image: actual-cfm:local
    ports:
      - '127.0.0.1:5007:5006'
    volumes:
      - actual-cfm-data:/data
    restart: unless-stopped

volumes:
  actual-cfm-data:
```

```sh
docker compose --project-name actual-cfm --file compose.cfm.yaml up -d
docker compose --project-name actual-cfm --file compose.cfm.yaml logs --tail 100 actual-cfm
docker compose --project-name actual-cfm --file compose.cfm.yaml exec actual-cfm node scripts/health-check.js
```

Open `http://localhost:5007` on the Docker host. The loopback binding lets the upstream deployment keep its existing port while you test. For remote access, configure your reverse proxy as described below. The named volume is the CFM server's persistent storage; include it in backups and retain it when updating the image. `docker compose down --volumes` would delete that storage.

### Node deployment

Create a new data directory outside the checkout, writable by the account running CFM. Substitute its absolute path in all three settings below. From the repository root, start the built server:

```sh
ACTUAL_DATA_DIR=/absolute/path/to/actual-cfm-data \
ACTUAL_SERVER_FILES=/absolute/path/to/actual-cfm-data/server-files \
ACTUAL_USER_FILES=/absolute/path/to/actual-cfm-data/user-files \
ACTUAL_HOSTNAME=127.0.0.1 \
ACTUAL_PORT=5007 \
NODE_ENV=production \
node packages/sync-server/build/app.js
```

Open `http://localhost:5007` on that host. For continuous operation, put this command, working directory, and environment into a separate service or process manager. Keep the data directory outside the build output so rebuilding does not replace it. Check that inherited environment variables or a `config.json` do not point any storage path back at upstream.

Configuration names such as `ACTUAL_DATA_DIR` and workspace names such as `@actual-app/sync-server` are intentionally retained for compatibility.

### Desktop-only or managed deployments

For a local-only budget, use a CFM desktop build or the CFM browser interface with **Don't use a server**, then follow the same native import procedure. Keep the upstream application's data directory intact. Importing a copy is preferable to pointing both desktop applications at one folder.

If your current managed host only offers an upstream Actual Budget image, it will continue to run upstream. Deploy CFM on a host that accepts your own build, or use a local CFM installation. You can still export the source budget from the managed instance.

## 3. Configure access to the new deployment

Create the CFM server login and, where applicable, recreate users and sharing permissions. Import each budget as its intended owner. Review [server configuration](../config/index.md), [multi-user access](../config/multi-user.md), and [OpenID configuration](../config/oauth-auth.md) for the authentication method you use.

Use a separate hostname, such as `cfm.example.com`, during migration. Route it to the new CFM service and configure [HTTPS](../config/https.md) or your [reverse proxy](../config/reverse-proxies.md). A proxy running in another container needs a route over its Docker network rather than the host-loopback example above. Transfer required configuration deliberately, updating hostname-dependent callback URLs and mounted paths. Do not copy a configuration that redirects CFM storage or its web root to the old installation.

With a fresh hostname, browser storage and service-worker caches stay separate from upstream. If you later reuse the old hostname, first save/sync pending local changes, then replace the old installed PWA/site cache and verify that the loaded interface is CFM.

## 4. Import the complete native budget

1. Open CFM, select the new CFM server, and sign in as the intended budget owner. For a local-only import, select **Don't use a server** instead.
2. Close any open budget using **Switch file**. On the file-selection screen, choose **Import file → Actual CFM / Actual Budget**.
3. Select the native upstream ZIP from step 1. Import it once as a separate budget. You may rename the imported copy to make it easy to distinguish from upstream.
4. Wait for the budget to open and, for a server-backed installation, for synchronization to complete. Download this new CFM budget on a second CFM client to confirm server persistence.
5. If you want end-to-end encryption, enable it explicitly in the imported budget's settings and keep its encryption password. Verify downloading/unlocking on another CFM client afterward.

The native import resets the old sync/encryption association and can upload the new budget to the selected server. The source's encryption setting does not protect that initial import/upload; perform it on a server you trust and configure encryption for the new copy. Keep the source encryption password for the retained upstream backup/deployment.

Bank connections can still be displayed in the imported account records, but that does not mean the fresh server has their credentials. Leave bank refresh and CFM automation off until validation and reconnection are complete.

## 5. Compare history before enabling CFM postings

Compare the imported copy with the references captured from upstream:

- Every expected account, including closed and off-budget accounts, is present.
- Current balances, uncleared entries, reconciled state, transaction counts, and balances at earlier dates agree.
- Starting balances, zero-value entries, backdated entries, splits, transfer pairs, categories, payees, and notes remain intact.
- Monthly allocations, schedules, rules, and saved reports are present.
- Closing/reopening the budget and downloading it on another CFM client retain the same data.

A matching current net worth alone is not enough. Do not use **Set balance** or add replacement opening transactions to conceal an import difference. Keep the source unchanged and investigate any missing records first.

Before adding CFM-specific postings, choose **Settings → General → Data → Export → Export for Actual Budget**. Save both files and review the receipt. Follow the [return guide](return-to-actual-budget.md) to test the compatible ZIP in a separate Actual Budget 26.10.0 installation. This checks that your own budget can leave CFM, in addition to the repository's compatibility fixtures.

## 6. Set up CFM and reconnect banks

Start in **Summary** and **Balances**. Follow [Using Actual CFM](../actual-cfm.md) for the full workflows:

- Classify existing accounts and choose liquid cash accounts. Classification is separate from monthly-budget participation; give changes the intended effective dates.
- Create annual plans against existing categories. Monthly allocations are changed only when you explicitly apply the funding preview.
- Add asset policies to existing manual tracking accounts using their actual acquisition/valuation history. Avoid entering an opening value twice.
- For existing receivable/payable control balances, use **Allocate from this control account's existing balance** to itemize obligations without posting those balances again.
- Set card timing, review liquidity assumptions, and create report templates before enabling automatic jobs.

For [bank synchronization](../advanced/bank-sync.md), configure provider credentials on the CFM server. Reauthorize connections or obtain replacement setup tokens as the provider requires. Use an imported account's **Link account** action and map the bank account to that **existing CFM account**. If a stale link remains, use **Unlink account** first; do not delete its ledger or create a duplicate account to reconnect it.

Run one manual refresh and inspect its result, including possible duplicates when provider identifiers have changed. Compare balances and reconciliation before enabling further automatic refreshes. Source server credentials and provider authorization do not travel inside a budget ZIP.

Configure scheduled work in **Settings → Automation**. Select one scheduler identity and the budget timezone, then enable the desired bank, valuation, or report jobs. Application mode requires an open, unlocked CFM client. Unattended work needs the separately configured [headless worker](../actual-cfm.md#automation), with the new server address and the imported budget's new sync ID. Update API integrations to use this fork's API build and the new budget identity.

## 7. Complete the cutover and keep rollback available

Move each device to the new CFM server and budget. Use the CFM web/PWA interface or a CFM desktop/mobile build; an upstream native app remains an upstream client even when its server URL changes. Restore the intended schedule-posting settings in CFM after validation. Stop old automation and leave the original deployment stopped or as a clearly identified archival copy. Enter new transactions in one active system.

Back up the CFM server and budget, save a fresh **Export for Actual Budget** plus its recovery archive, and prepare an [offline recovery runtime](return-to-actual-budget.md#offline-recovery-after-maintenance-ends). Retain the original upstream backups and deployment revision as well.

**Before any new CFM financial activity:** you can abandon the imported copy and resume the unchanged upstream deployment at the migration cutoff.

**After transactions, adjustments, valuations, or settlements have been recorded in CFM:** returning to the old snapshot would omit that later activity. Use the fresh compatible export and the [return procedure](return-to-actual-budget.md) instead. Import it into a separate upstream budget, compare its receipt and history, and configure upstream connections there. Changing an image tag back to upstream against a CFM data directory is not the return procedure.
