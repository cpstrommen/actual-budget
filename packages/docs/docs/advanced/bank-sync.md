# Connecting Your Bank

We are excited to offer optional bank integration in Actual CFM.
Here are a couple of considerations to know about before making the decision to use bank sync in your installation of Actual CFM.

- This integration relies on you providing your own API credentials that you will need to get by signing up with the service provider and Generate Keys and Secrets that will be used in Actual CFM.

- The integration only works if you are using actual-server.

- The API secrets and keys for bank sync are stored on the server and are **not** covered by [end-to-end encryption](../getting-started/sync.md#end-to-end-encryption). End-to-end encryption only protects your budget data. Server administrators or hosting providers with direct access to the server's database can read bank sync tokens. If this is a concern, consider self-hosting your server.

- You will need to add a config file to your installation.

## Supported Providers

- [Akahu](./bank-sync/akahu.md) (New Zealand Banks)
- [Enable Banking](./bank-sync/enable-banking.md) (European Banks)
- GoCardless [BankAccountData](./bank-sync/gocardless.md) (European Banks, **not accepting new accounts**)
- [SimpleFIN Bridge](./bank-sync/simplefin.md) (North American Banks)
- [Pluggy.ai](./bank-sync/pluggyai.md) (Brazilian Banks)

### Retrieve Transactions

You can fetch new transactions [automatically](#automatic-syncing) or manually.

#### Automatic Syncing

Configure automatic bank refreshes in **Settings → Automation**. Select one scheduler identity, the budget timezone, an interval, and the accounts to refresh. Enable it after checking a manual refresh; provider limits and retry backoff still apply.

Application mode requires an open, unlocked CFM client and performs bounded catch-up after suspension. Running jobs while all clients are closed requires the separately configured headless worker. See [CFM automation](../actual-cfm.md#automation) for setup, credentials, and the selected-writer requirements.

When [migrating from Actual Budget](../migration/from-actual-budget.md), configure credentials on the new server and reconnect the imported accounts before enabling automatic refreshes.

#### Manual Syncing

To fetch new transactions manually:

#### On Desktop

- To sync all accounts: click **All Accounts** in the sidebar, then click **Bank Sync**.
- To sync a single account: open the account and click the Bank Sync button.

  <img width="192" alt="The Bank Sync button next to Import above a linked account's transactions" src="/img/advanced/bank-sync/bank-sync-account-buttons@2x.webp" />

#### On Mobile

- To sync all linked accounts: open **Accounts**, scroll to the top of the account list, then pull down and release to refresh.
- To sync a single account: open the account, scroll to the top of its transaction list, then pull down and release to refresh.

Pulling down to refresh on the **Budget** screen syncs your budget with the server, but does **not** fetch new bank transactions.
