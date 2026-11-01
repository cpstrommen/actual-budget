import type { ReactNode } from 'react';

import Admonition from '@theme/Admonition';

type ExperimentalFeatureWarningProps = {
  issueId?: string;
  children?: ReactNode;
};

export function ExperimentalFeatureWarning({
  issueId,
  children,
}: ExperimentalFeatureWarningProps) {
  return (
    <Admonition type="warning">
      <p>
        This is an <strong>experimental feature</strong>. That means we're still
        working on finishing it. There may be bugs, missing functionality or
        incomplete documentation, and we may decide to remove the feature in a
        future release. If you have any feedback, please{' '}
        {issueId ? (
          <>
            comment on the{' '}
            <a
              href="https://github.com/cpstrommen/actual-budget/issues"
              rel="noopener noreferrer"
            >
              Actual CFM feedback tracker
            </a>
          </>
        ) : (
          <a
            href="https://github.com/cpstrommen/actual-budget/issues"
            rel="noopener noreferrer"
          >
            open an issue
          </a>
        )}
        .
      </p>
      {children}
    </Admonition>
  );
}
