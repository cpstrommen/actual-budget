import { useLocation } from 'react-router';

import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import {
  getSidebarGroupForPath,
  getSidebarMenuItemPath,
} from '#components/sidebar/sidebarMenu';
import { SidebarSections } from '#components/sidebar/SidebarSections';
import { useSidebarMenuItemDetails } from '#components/sidebar/useSidebarMenuItemDetails';
import { useSidebarMenu } from '#hooks/useSidebarMenu';

import { NavRow } from './NavRow';

export function PrimaryNav() {
  const { sidebarItems } = useSidebarMenu();
  const itemDetails = useSidebarMenuItemDetails();
  const location = useLocation();

  return (
    <View
      data-testid="sidebar-primary-buttons"
      style={{
        flexShrink: 0,
        padding: `${spacing.xs}px ${spacing.sm}px 0`,
      }}
    >
      {sidebarItems.map(item => (
        <View key={item.id}>
          <NavRow
            title={itemDetails[item.id].title}
            Icon={itemDetails[item.id].Icon}
            to={getSidebarMenuItemPath(item.id, true)}
            selected={getSidebarGroupForPath(location.pathname) === item.id}
          />
          <SidebarSections id={item.id} />
        </View>
      ))}
    </View>
  );
}
