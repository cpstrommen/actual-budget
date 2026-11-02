module.exports = {
  input: [
    'src/**/*.{js,jsx,ts,tsx}',
    'preview/**/*.ts',
    '../loot-core/src/**/*.{js,jsx,ts,tsx}',
  ],
  output: 'locale/$LOCALE.json',
  locales: ['en'],
  sort: true,
  keySeparator: false,
  namespaceSeparator: false,
  defaultValue: (locale, ns, key, value) => {
    if (locale === 'en') {
      return value || key;
    }
    return '';
  },
};
