import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { theme } from '@actual-app/components/theme';
import { css } from '@emotion/css';

import { useNavigate } from '#hooks/useNavigate';

import { getSidebarGroupForPath } from './sidebarMenu';
import type { SidebarMenuItemId } from './sidebarMenu';

export function useSidebarSections() {
  const { t } = useTranslation();
  return {
    cfm: [
      { title: t('Financial position'), path: '/summary' },
      { title: t('Liquidity'), path: '/summary/liquidity' },
    ],
    reports: [
      { title: t('Charts and reports'), path: '/reports' },
      { title: t('Report packages'), path: '/reports/packages' },
    ],
    balances: [
      { title: t('Accounts and balances'), path: '/balances' },
      { title: t('Assets'), path: '/balances/assets' },
      { title: t('Accounts receivable'), path: '/balances/receivables' },
      { title: t('Accounts payable'), path: '/balances/payables' },
    ],
    budget: [
      { title: t('Annual budget'), path: '/planning' },
      { title: t('Monthly budget'), path: '/budget' },
    ],
  };
}

export function SidebarSections({ id }: { id: SidebarMenuItemId }) {
  const { t } = useTranslation();
  const sections = useSidebarSections();
  const location = useLocation();
  if (!(id in sections) || getSidebarGroupForPath(location.pathname) !== id) {
    return null;
  }
  const items = sections[id as keyof typeof sections];
  return (
    <nav aria-label={t('Page sections')} style={{ paddingBottom: 6 }}>
      {items.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          className={({ isActive }) =>
            css({
              display: 'block',
              padding: '6px 12px 6px 42px',
              fontSize: 12,
              textDecoration: 'none',
              color: isActive
                ? theme.sidebarItemTextSelected
                : theme.sidebarItemText,
              background: isActive
                ? theme.sidebarItemBackgroundSelected
                : 'transparent',
              fontWeight: isActive ? 600 : 400,
              ':hover': { background: theme.sidebarItemBackgroundHover },
            })
          }
        >
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
}

/** Compact subsection navigation where the desktop left menu is not visible. */
export function MobileSectionNavigation() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const location = useLocation();
  const navigate = useNavigate();
  const sections = useSidebarSections();
  const group = getSidebarGroupForPath(location.pathname);
  if (!isNarrowWidth || !group || !(group in sections)) return null;
  const items = sections[group as keyof typeof sections];
  const selected =
    items.find(item => item.path === location.pathname) || items[0];
  return (
    <div style={{ padding: '8px 20px' }}>
      <select
        aria-label={t('Section')}
        value={selected.path}
        onChange={event => void navigate(event.target.value)}
        style={{
          width: '100%',
          padding: 8,
          font: 'inherit',
          color: theme.pageText,
          background: theme.tableBackground,
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 4,
        }}
      >
        {items.map(item => (
          <option key={item.path} value={item.path}>
            {item.title}
          </option>
        ))}
      </select>
    </div>
  );
}
