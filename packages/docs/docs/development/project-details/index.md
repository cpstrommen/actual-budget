# The Actual CFM Project Structure

Actual CFM is made up of lots of different _packages_ organized as a monorepo using Yarn workspaces. This article covers how they all fit together to form the project you know as Actual CFM.

Actual CFM keeps the inherited Actual CFM monorepo structure. The client, sync server, API, and documentation are developed together in this checkout.

The Actual CFM monorepo contains the following main packages:

### 1. loot-core (`packages/loot-core/`)

The core application logic that runs on any platform.

- **Purpose**: Business logic, database operations, and calculations
- **Platform**: Platform-agnostic code that works in both browser and Node.js environments
- **Exports**: Provides conditional exports for browser and node environments
- **Key Directories**:
  - `src/client/` - Client-side core logic
  - `src/server/` - Server-side core logic
  - `src/shared/` - Shared utilities
  - `src/types/` - Type definitions
  - `migrations/` - Database migration files

### 2. desktop-client (`packages/desktop-client/` - aliased as `@actual-app/web`)

The React-based UI for web and desktop.

- **Purpose**: Forms the front-end code for the Actual CFM web app - the code you see when you load Actual CFM in your browser
- **Note**: Despite the name "desktop-client", this package is actually the web UI used by both browser and desktop apps
- **Technology**: React components using functional programming patterns, Vite for bundling
- **Key Directories**:
  - `src/components/` - React components
  - `src/hooks/` - Custom React hooks
  - `e2e/` - End-to-end tests

### 3. desktop-electron (`packages/desktop-electron/`)

Electron wrapper for the desktop application.

- **Purpose**: Provides the desktop application wrapper that allows stable use of the Actual CFM Web App locally with or without internet or a sync-server
- **Technology**: Electron for window management and native OS integration
- **Note**: It is unlikely you will need to make changes here unless working on Electron-specific features

### 4. api (`packages/api/` - aliased as `@actual-app/api`)

Public API for programmatic access to Actual CFM.

- **Purpose**: Node.js API package designed for integrations and automation
- **Use Cases**: Custom importers, data exporters, automation scripts

### 5. sync-server (`packages/sync-server/` - aliased as `@actual-app/sync-server`)

Synchronization server for multi-device support.

- **Purpose**: Handles synchronization of budget data across multiple devices
- **Technology**: Express-based server, currently transitioning to TypeScript (mostly JavaScript)
- **Dependency**: Has a dependency on `@actual-app/web` (the desktop-client package)
- **Deployment**: When you deploy Actual CFM Server and run `yarn build:server` and `yarn install`, the Actual CFM client is installed as a dependency

You can see this in the [package.json](https://github.com/actualbudget/actual/blob/master/packages/sync-server/package.json) file:

```json
"dependencies": {
    "@actual-app/web": "workspace:*",
    // rest of dependencies...
  },
```

The workspace reference ensures that changes to `@actual-app/web` are reflected in your server deployment. If you see any discrepancies, run `yarn build:server` to compile the latest.

### 6. component-library (`packages/component-library/` - aliased as `@actual-app/components`)

Reusable React UI components.

- **Purpose**: Shared components like Button, Input, Menu, etc.
- **Features**: Theme system, design tokens, and icon components
- **Icons**: Contains 375+ icons in SVG/TSX format (auto-generated, don't edit manually)
- **Key Directories**:
  - `src/` - Component source files
  - `src/icons/` - Icon components (auto-generated)

### 7. crdt (`packages/crdt/` - aliased as `@actual-app/crdt`)

CRDT (Conflict-free Replicated Data Type) implementation for data synchronization.

- **Purpose**: Core sync logic for handling concurrent edits across devices
- **Technology**: Protocol buffers for serialization
- **Use**: Used by the sync-server for conflict-free data synchronization

### 8. plugins-service (`packages/plugins-service/`)

Service for handling plugins/extensions.

- **Purpose**: Manages plugin functionality and extensions

### 9. eslint-plugin-actual (`packages/eslint-plugin-actual/`)

Custom ESLint rules specific to Actual CFM.

- **Purpose**: Enforces Actual CFM-specific coding standards
- **Rules**:
  - `no-untranslated-strings` - Enforces i18n usage
  - `prefer-trans-over-t` - Prefers Trans component over t() function
  - `prefer-logger-over-console` - Enforces using logger instead of console
  - `typography` - Typography rules
  - `prefer-if-statement` - Prefers explicit if statements

### 10. docs (`packages/docs/`)

Documentation website built with Docusaurus.

- **Purpose**: The Actual CFM documentation website
- **Technology**: Docusaurus 3 for static site generation

## Working with Packages

To run commands for a specific package, use:

```bash
yarn workspace <workspace-name> run <command>
```

For more information about development workflows, see the [Development Setup Guide](../development-setup.md).
