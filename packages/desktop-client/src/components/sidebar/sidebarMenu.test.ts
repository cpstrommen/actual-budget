import {
  getDefaultSidebarMenuItems,
  getSidebarGroupForPath,
  getSidebarMenuItemPath,
  isInMobileSettingsNav,
  moveSidebarMenuItem,
  parseSidebarMenuItems,
  parseSidebarStartPage,
} from './sidebarMenu';

describe('parseSidebarMenuItems', () => {
  it('returns the defaults when nothing is saved', () => {
    expect(parseSidebarMenuItems(undefined)).toEqual([
      { id: 'cfm', hidden: false },
      { id: 'reports', hidden: false },
      { id: 'balances', hidden: false },
      { id: 'budget', hidden: false },
      { id: 'schedules', hidden: true },
      { id: 'payees', hidden: true },
      { id: 'tags', hidden: true },
      { id: 'rules', hidden: true },
      { id: 'bank-sync', hidden: true },
    ]);
  });

  it('returns the defaults for a malformed value', () => {
    expect(parseSidebarMenuItems('{not json')).toEqual(
      getDefaultSidebarMenuItems(),
    );
  });

  it('keeps the saved order and visibility', () => {
    const saved = [
      { id: 'balances', hidden: false },
      { id: 'payees', hidden: false },
      { id: 'budget', hidden: false },
      { id: 'reports', hidden: false },
      { id: 'schedules', hidden: true },
      { id: 'tags', hidden: true },
      { id: 'rules', hidden: false },
      { id: 'bank-sync', hidden: true },
    ];

    expect(parseSidebarMenuItems(JSON.stringify(saved))).toEqual([
      { id: 'cfm', hidden: false },
      ...saved,
    ]);
  });

  it('drops unknown and duplicate entries', () => {
    const items = parseSidebarMenuItems(
      JSON.stringify([
        { id: 'reports', hidden: false },
        { id: 'unknown', hidden: false },
        { id: 'reports', hidden: true },
        null,
      ]),
    );

    expect(items.filter(item => item.id === 'reports')).toEqual([
      { id: 'reports', hidden: false },
    ]);
    expect(items).toHaveLength(9);
  });

  it('inserts missing pages at their default position', () => {
    const items = parseSidebarMenuItems(
      JSON.stringify([
        { id: 'schedules', hidden: false },
        { id: 'budget', hidden: false },
      ]),
    );

    expect(items.map(item => item.id)).toEqual([
      'cfm',
      'reports',
      'balances',
      'budget',
      'schedules',
      'payees',
      'tags',
      'rules',
      'bank-sync',
    ]);
    expect(items.find(item => item.id === 'reports')?.hidden).toBe(false);
    expect(items.find(item => item.id === 'payees')?.hidden).toBe(true);
  });

  it('always keeps the four financial sections in the sidebar', () => {
    const items = parseSidebarMenuItems(
      JSON.stringify(
        getDefaultSidebarMenuItems().map(item => ({ ...item, hidden: true })),
      ),
    );

    expect(items.filter(item => !item.hidden)).toEqual([
      { id: 'cfm', hidden: false },
      { id: 'reports', hidden: false },
      { id: 'balances', hidden: false },
      { id: 'budget', hidden: false },
    ]);
  });
});

describe('parseSidebarStartPage', () => {
  const items = parseSidebarMenuItems(
    JSON.stringify([
      { id: 'reports', hidden: false },
      { id: 'budget', hidden: false },
      { id: 'schedules', hidden: true },
    ]),
  );

  it('returns the saved page whether or not it is in the sidebar', () => {
    expect(parseSidebarStartPage('budget', items)).toBe('budget');
    expect(parseSidebarStartPage('schedules', items)).toBe('schedules');
  });

  it('falls back to the first page', () => {
    expect(parseSidebarStartPage(undefined, items)).toBe('cfm');
    expect(parseSidebarStartPage('unknown', items)).toBe('cfm');
  });
});

describe('moveSidebarMenuItem', () => {
  const items = getDefaultSidebarMenuItems().filter(item =>
    ['budget', 'reports', 'schedules'].includes(item.id),
  );

  it('moves a page before the target', () => {
    expect(
      moveSidebarMenuItem(items, 'schedules', 'budget', 'before').map(
        item => item.id,
      ),
    ).toEqual(['reports', 'schedules', 'budget']);
  });

  it('moves a page after the target', () => {
    expect(
      moveSidebarMenuItem(items, 'budget', 'schedules', 'after').map(
        item => item.id,
      ),
    ).toEqual(['reports', 'schedules', 'budget']);
  });

  it('leaves the order alone for an unknown target', () => {
    expect(moveSidebarMenuItem(items, 'budget', 'unknown', 'after')).toBe(
      items,
    );
  });
});

describe('isInMobileSettingsNav', () => {
  it('includes schedules beside automation in mobile settings', () => {
    expect(isInMobileSettingsNav('schedules')).toBe(true);
    expect(isInMobileSettingsNav('tags')).toBe(false);
    expect(isInMobileSettingsNav('payees')).toBe(true);
    expect(isInMobileSettingsNav('bank-sync')).toBe(true);
  });
});

describe('getSidebarMenuItemPath', () => {
  it('uses a top-level path for pages in the sidebar', () => {
    expect(getSidebarMenuItemPath('payees', true)).toBe('/payees');
    expect(getSidebarMenuItemPath('budget', true)).toBe('/planning');
    expect(getSidebarMenuItemPath('cfm', true)).toBe('/summary');
    expect(getSidebarMenuItemPath('balances', true)).toBe('/balances');
  });

  it('keeps settings sections under /settings when they are not in the sidebar', () => {
    expect(getSidebarMenuItemPath('payees', false)).toBe('/settings/payees');
    expect(getSidebarMenuItemPath('schedules', false)).toBe(
      '/settings/schedules',
    );
  });
});

describe('financial navigation migration', () => {
  it('migrates old layouts and keeps schedules in Settings even when previously pinned', () => {
    const items = parseSidebarMenuItems(
      JSON.stringify([
        { id: 'budget', hidden: false },
        { id: 'schedules', hidden: false },
        { id: 'reports', hidden: false },
        { id: 'payees', hidden: false },
      ]),
    );
    expect(items.filter(item => !item.hidden).map(item => item.id)).toEqual([
      'cfm',
      'reports',
      'balances',
      'budget',
      'payees',
    ]);
    expect(items.find(item => item.id === 'schedules')?.hidden).toBe(true);
  });
  it.each([
    ['/summary/liquidity', 'cfm'],
    ['/reports/packages', 'reports'],
    ['/balances/assets', 'balances'],
    ['/balances/payables', 'balances'],
    ['/planning', 'budget'],
    ['/budget', 'budget'],
  ])('keeps %s within its parent menu', (path, group) => {
    expect(getSidebarGroupForPath(path)).toBe(group);
  });
});
