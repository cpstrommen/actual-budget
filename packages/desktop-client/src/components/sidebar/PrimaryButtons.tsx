import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { SvgCog } from '@actual-app/components/icons/v1';
import { View } from '@actual-app/components/view';

import { useSidebarMenu } from '#hooks/useSidebarMenu';

import { Item } from './Item';
import { getSidebarGroupForPath, getSidebarMenuItemPath } from './sidebarMenu';
import { SidebarSections } from './SidebarSections';
import { useSidebarMenuItemDetails } from './useSidebarMenuItemDetails';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const { sidebarItems } = useSidebarMenu();
  const itemDetails = useSidebarMenuItemDetails();
  const location = useLocation();

  return (
    <View data-testid="sidebar-primary-buttons" style={{ flexShrink: 0 }}>
      {sidebarItems.map(item => (
        <Item
          key={item.id}
          title={itemDetails[item.id].title}
          Icon={itemDetails[item.id].Icon}
          to={getSidebarMenuItemPath(item.id, true)}
          forceActive={getSidebarGroupForPath(location.pathname) === item.id}
        >
          {getSidebarGroupForPath(location.pathname) === item.id ? (
            <SidebarSections id={item.id} />
          ) : null}
        </Item>
      ))}
      <Item title={t('Settings')} Icon={SvgCog} to="/settings" />
    </View>
  );
}
