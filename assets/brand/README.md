# Actual CFM Brand Assets

The rising-bar mark and neutral palette are CFM's identity. `symbol.svg` is the monochrome application mark; `icon.svg` is the app tile; `social.svg` is the documentation sharing image.

Regenerate raster assets from the repository root:

```sh
npm exec --yes --package=sharp-cli@5.2.0 -- node scripts/generate-brand-assets.cjs
```

The React logo is generated from `packages/component-library/src/icons/logo/logo.svg` using the component library's SVGR template. Regenerate that logo only, rather than rewriting the unrelated icon library:

```sh
node node_modules/@svgr/cli/bin/svgr --no-runtime-config --typescript --no-dimensions --expand-props start --replace-attr-values '#f2f2f2=currentColor' --template packages/component-library/src/icons/template.ts packages/component-library/src/icons/logo/logo.svg > /tmp/cfm-logo.tsx
cp /tmp/cfm-logo.tsx packages/component-library/src/icons/logo/Logo.tsx
```

Historical upstream artwork in archive directories and test reference screenshots is not the active CFM identity. Existing screenshots are inherited workflow illustrations and need refreshed captures as their associated CFM screens change.
