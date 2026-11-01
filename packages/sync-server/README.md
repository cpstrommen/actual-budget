# Actual CFM Sync Server

The optional server for Actual CFM, a personal fork of Actual Budget focused on annual planning, liquidity, and asset valuation. It persists synchronized budget data and provides the existing bank-provider integrations.

From the repository root, run `yarn start:server-dev` for local development or `yarn build:server` to build this fork. The published `@actual-app/sync-server` npm package is an upstream Actual Budget build. Server commands and configuration names retain their existing identifiers.

### Using the CLI tool

Node.js v22 or higher is required for the @actual-app/sync-server npm package

After building from the repository root, run `node packages/sync-server/build/bin/actual-server.js` with the options below.

**Usage**

```bash
actual-server [options]
```

**Available options**

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `-h` or `--help`    | Print this list and exit.    |
| `-v` or `--version` | Print this version and exit. |
| `--config`          | Path to the config file.     |
| `--reset-password`  | Reset your password          |

**Examples**

Run with default configuration

```bash
actual-server
```

Run with custom configuration

```bash
actual-server --config ./config.json
```

Reset your password

```bash
actual-server --reset-password
```

### Documentation

See the [project README](../../README.md) and [CFM implementation plan](../../wishlist.md). [Upstream documentation](https://actualbudget.org/docs/) describes inherited server configuration and account functionality.
