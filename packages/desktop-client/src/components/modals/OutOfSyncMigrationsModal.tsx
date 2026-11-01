import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { closeBudget } from '#budgetfiles/budgetfilesSlice';
import { Link } from '#components/common/Link';
import { Modal, ModalHeader, ModalTitle } from '#components/common/Modal';
import { useDispatch } from '#redux';

export function OutOfSyncMigrationsModal() {
  const dispatch = useDispatch();

  const { t } = useTranslation();

  const closeBudgetAndModal = (close: () => void) => {
    void dispatch(closeBudget());
    close();
  };

  return (
    <Modal name="out-of-sync-migrations">
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={t('Please update Actual CFM!')} />}
          />
          <View
            style={{
              padding: 15,
              gap: 15,
              paddingTop: 0,
              paddingBottom: 25,
              maxWidth: 550,
              lineHeight: '1.5em',
            }}
          >
            <Text>
              <Paragraph style={{ fontSize: 16 }}>
                <Trans>
                  It looks like you&apos;re using an outdated version of the
                  Actual CFM client. Your budget data has been updated by
                  another client, but this client is still on the old version.
                  For the best experience, please update Actual CFM to the
                  latest version.
                </Trans>
              </Paragraph>
            </Text>

            <Paragraph
              style={{
                fontSize: 16,
              }}
            >
              <Trans>
                Keep a backup of this budget and update from the{' '}
                <Link
                  variant="external"
                  to="https://github.com/cpstrommen/actual-budget/releases"
                >
                  Actual CFM releases
                </Link>
                . Do not open a CFM database directly in another product. Use
                the documented compatible export when returning to Actual
                Budget.
              </Trans>
            </Paragraph>

            <View
              style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Button
                variant="primary"
                style={{
                  padding: '10px 30px',
                }}
                onPress={() => closeBudgetAndModal(() => state.close())}
              >
                <Trans>Close Budget</Trans>
              </Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
