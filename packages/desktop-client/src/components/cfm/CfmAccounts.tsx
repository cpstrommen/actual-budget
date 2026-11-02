import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import type { CfmAccountKind } from '@actual-app/core/types/models/cfm';

import { CfmOverview } from './CfmOverview';
import {
  Choice,
  Field,
  fieldStyle,
  gridStyle,
  newId,
  Panel,
  parseMoney,
} from './ui';

type Props = Omit<ComponentProps<typeof CfmOverview>, 'mode'> & {
  createAccount: (input: {
    name: string;
    kind: CfmAccountKind;
    initialBalance: number;
    date: string;
    currency: string;
    requestId: string;
  }) => Promise<boolean>;
};
export function CfmAccounts({ createAccount, ...props }: Props) {
  const { t } = useTranslation();
  const { state, asOf, busy } = props;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CfmAccountKind>('asset');
  const [opening, setOpening] = useState('0');
  const [createRequestId, setCreateRequestId] = useState(newId);
  async function create() {
    try {
      if (
        await createAccount({
          name,
          kind,
          initialBalance: parseMoney(opening),
          date: asOf,
          currency: state.currency,
          requestId: createRequestId,
        })
      ) {
        setName('');
        setOpening('0');
        setCreateRequestId(newId());
      }
    } catch (error) {
      props.onError(error);
    }
  }
  return (
    <>
      <CfmOverview {...props} mode="accounts" />
      <Panel title={t('Add a tracking account')}>
        <p>
          <Trans>
            Create asset, investment, debt, or AR/AP control accounts here.
            Ordinary bank accounts can still be created in Accounts.
          </Trans>
        </p>
        <form
          onSubmit={event => {
            event.preventDefault();
            void create();
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
            <div style={gridStyle}>
              <Field label={t('Account name')}>
                <input
                  style={fieldStyle}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                />
              </Field>
              <Choice
                label={t('Account type')}
                value={kind}
                onChange={value => setKind(value as CfmAccountKind)}
                options={[
                  ['cash', t('Cash')],
                  ['investment', t('Equities / investments')],
                  ['asset', t('Other asset')],
                  ['credit-card', t('Credit card')],
                  ['loan', t('Loan')],
                  ['receivable', t('Accounts receivable')],
                  ['payable', t('Accounts payable')],
                ]}
              />
              <Field label={t('Opening balance')}>
                <input
                  style={fieldStyle}
                  inputMode="decimal"
                  value={opening}
                  onChange={event => setOpening(event.target.value)}
                  required
                />
              </Field>
            </div>
            <p>
              <Button type="submit" variant="primary">
                <Trans>Create tracking account</Trans>
              </Button>
            </p>
          </fieldset>
        </form>
      </Panel>
    </>
  );
}
