import { Trans } from 'react-i18next';
import { Link } from 'react-router';

import { Paragraph } from '@actual-app/components/paragraph';

export function AutomaticSyncSettings() {
  return (
    <div>
      <Paragraph>
        <Trans>
          Automatic bank refresh is managed by Actual CFM Automation. Choose
          selected accounts, one scheduler, provider-safe intervals, and
          application or headless execution there. It is disabled until
          configured.
        </Trans>
      </Paragraph>
      <Link to="/cfm?tab=automation">
        <Trans>Open CFM automation settings</Trans>
      </Link>
    </div>
  );
}
