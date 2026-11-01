---
title: 'Docker'
sidebar_position: 2
---

Build Actual CFM from this checkout to run it in Docker. There is no published CFM container release configured here; images named `actualbudget/actual-server` or `ghcr.io/actualbudget/actual` contain upstream Actual Budget.

Moving an existing deployment? Use [Migrating from Actual Budget](../migration/from-actual-budget.md#docker-deployment) for a separate port/volume, native budget import, bank reconnection, and rollback. Do not reuse the upstream data volume for the CFM trial.

## Build and launch

Install the [source-build prerequisites](./build-from-source.md), Docker, and Docker Compose. From the repository root, with the pinned Node and Yarn versions:

```sh
yarn install --immutable
yarn build:server
docker compose --file packages/sync-server/docker-compose.yml up -d --build
```

The Compose file builds `actual-cfm:local` using `packages/sync-server/docker/ubuntu.Dockerfile`. That Dockerfile packages the browser and server output from `yarn build:server`; it does not run the source build for you. The repository-root Dockerfile/Compose file are for development.

The supplied runtime Compose file publishes port **5006** and stores persistent data in **packages/sync-server/actual-data** through a `/data` bind mount. Change the host port and host data path if needed before starting it. CFM creates `server-files` and `user-files` inside that data directory.

Check the running service:

```sh
docker compose --file packages/sync-server/docker-compose.yml logs --tail 100 actual_server
docker compose --file packages/sync-server/docker-compose.yml exec actual_server node scripts/health-check.js
```

Open `http://localhost:5006` on the host, create the server login, and confirm the interface identifies itself as Actual CFM. Configure [HTTPS](../config/https.md) or a [reverse proxy](../config/reverse-proxies.md) for access from other devices. See [server configuration](../config/index.md) for environment variables and mounted configuration/secrets.

## Updates and backups

Retain a native budget backup, a consistent backup of the complete persistent data directory, and the currently deployed CFM revision. After selecting the new source revision, repeat the install, source build, and Compose command above. Replacing the container retains the bind-mounted data directory; deleting that directory would remove the server's persistent data.

Pulling an upstream image does not update this fork. Returning to upstream uses [Export for Actual Budget](../migration/return-to-actual-budget.md) and a separate upstream budget, rather than replacing the image against the CFM directory.

## Image tags

### `latest` Tag

Upstream `latest` images install Actual Budget. Use a locally built CFM image, or an image you have built and published from a recorded CFM revision. This repository does not configure a published CFM `latest` channel.

### `nightly` Tag

Upstream `nightly` images also install Actual Budget. To test a CFM development revision, build that revision yourself and use separate test data. Do not assume an upstream nightly budget can be opened by an older CFM build.
