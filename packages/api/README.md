# Actual CFM API

Programmatic access to the inherited Actual ledger and budget functionality. The workspace identifier remains `@actual-app/api`. Build this fork's API from the repository root:

```sh
yarn build:api
```

Published `@actual-app/api` npm releases are upstream Actual Budget packages. [Upstream API documentation](https://actualbudget.org/docs/api/) describes the inherited interface; planned CFM extensions are tracked in [wishlist.md](../../wishlist.md).

## TypeScript

`@actual-app/api` publishes TypeScript declarations. Consumers using TypeScript must set `moduleResolution` to `"bundler"`, `"nodenext"`, or `"node16"` in their `tsconfig.json`. Legacy `"node"` / `"node10"` / `"classic"` resolution is not supported in strict mode — the published declarations rely on package.json `exports` conditions that older resolvers don't honor.
