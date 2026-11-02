# Geologica

The variable font is the same Geologica source used by the local Strømmen site. It is redistributed under the included SIL Open Font License; keep `OFL.txt` with it.

The application and documentation load this local font file. Offline report packages embed it and its license so reports do not depend on a running CFM server or an external font service.

After replacing the source font or license, regenerate the report asset:

```sh
node scripts/generate-font-assets.mjs
```
