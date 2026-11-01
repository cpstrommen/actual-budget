import { forwardRef, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { Button } from '@actual-app/components/button';
import { SvgHelp } from '@actual-app/components/icons/v2';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { SpaceBetween } from '@actual-app/components/space-between';
import { useToggle } from 'usehooks-ts';

import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { useTour } from './tour/TourProvider';

const getPageDocs = (page: string) => {
  switch (page) {
    case '/budget':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/getting-started/envelope-budgeting.md';
    case '/reports':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/reports/index.md';
    case '/schedules':
    case '/settings/schedules':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/schedules.md';
    case '/payees':
    case '/settings/payees':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/transactions/payees.md';
    case '/rules':
    case '/settings/rules':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/budgeting/rules/index.md';
    case '/tags':
    case '/settings/tags':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/transactions/tags.md';
    case '/bank-sync':
    case '/settings/bank-sync':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/advanced/bank-sync.md';
    case '/settings/experimental':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/experimental/index.md';
    case '/settings':
    case '/settings/general':
    case '/settings/advanced':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/settings/index.md';
    case '/notifications':
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/notifications.md';
    default:
      // All pages under /accounts, plus any missing pages
      return 'https://github.com/cpstrommen/actual-budget/blob/master/packages/docs/docs/index.md';
  }
};

function openDocsForCurrentPage() {
  window.Actual.openURLInBrowser(getPageDocs(window.location.pathname));
}

type HelpMenuItem =
  | 'docs'
  | 'discord'
  | 'keyboard-shortcuts'
  | 'start-tour'
  | 'goal-templates';

type HelpButtonProps = {
  onPress?: () => void;
};

const HelpButton = forwardRef<HTMLButtonElement, HelpButtonProps>(
  ({ onPress }, ref) => {
    const size = 15;
    return (
      <Button
        variant="bare"
        ref={ref}
        onPress={onPress}
        data-testid="help-menu-button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <SvgHelp width={size} height={size} />
        <Trans>Help</Trans>
      </Button>
    );
  },
);

HelpButton.displayName = 'HelpButton';

export const HelpMenu = () => {
  const showGoalTemplates = useFeatureFlag('goalTemplatesEnabled');
  const { t } = useTranslation();
  const [isMenuOpen, toggleMenuOpen, setMenuOpen] = useToggle();
  const menuButtonRef = useRef(null);

  const dispatch = useDispatch();
  const page = useLocation().pathname;
  const { startTour } = useTour();

  const handleItemSelect = (item: HelpMenuItem) => {
    switch (item) {
      case 'docs':
        openDocsForCurrentPage();
        break;
      case 'discord':
        window.Actual.openURLInBrowser(
          'https://github.com/cpstrommen/actual-budget/issues',
        );
        break;
      case 'keyboard-shortcuts':
        dispatch(pushModal({ modal: { name: 'keyboard-shortcuts' } }));
        break;
      case 'start-tour':
        startTour();
        break;
      case 'goal-templates':
        dispatch(pushModal({ modal: { name: 'goal-templates' } }));
        break;
      default:
        throw new Error(`Unrecognized menu option: ${String(item)}`);
    }
  };

  useHotkeys('?', () => setMenuOpen(true), { useKey: true });

  return (
    <SpaceBetween>
      <HelpButton ref={menuButtonRef} onPress={toggleMenuOpen} />

      <Popover
        placement="bottom end"
        offset={8}
        triggerRef={menuButtonRef}
        isOpen={isMenuOpen}
        onOpenChange={() => setMenuOpen(false)}
      >
        <Menu
          onMenuSelect={(item: HelpMenuItem) => {
            setMenuOpen(false);
            handleItemSelect(item);
          }}
          items={[
            {
              name: 'docs',
              text: t('Documentation'),
            },
            {
              name: 'discord',
              text: t('Community support (Discord)'),
            },
            { name: 'keyboard-shortcuts', text: t('Keyboard shortcuts') },
            { name: 'start-tour', text: t('Take a tour') },
            ...(showGoalTemplates && page === '/budget'
              ? [{ name: 'goal-templates', text: t('Goal templates') }]
              : []),
          ]}
        />
      </Popover>
    </SpaceBetween>
  );
};
