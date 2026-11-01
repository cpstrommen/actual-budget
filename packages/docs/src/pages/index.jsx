import Link from '@docusaurus/Link';
import useBrokenLinks from '@docusaurus/useBrokenLinks';
import Layout from '@theme/Layout';

import Button from '../components/Button';

import classes from './index.module.css';

export default function Home() {
  useBrokenLinks().collectAnchor('features');
  return (
    <Layout
      title="Actual CFM"
      description="Annual planning, liquidity, and asset valuation. Your financial position, over time."
    >
      <main className={`${classes.main} ${classes.container}`}>
        <h1 className={classes.heroHeading}>Actual CFM</h1>
        <p className={classes.heroText}>
          Plan the year ahead. Understand your liquidity. Keep a clear view of
          assets, liabilities, and net equity.
        </p>
        <p>
          Actual CFM is independently maintained software derived from Actual
          Budget. The ledger, accounts, and monthly budgets are its foundation;
          annual planning, valuations, AR/AP, and liquidity tools are in
          development.
        </p>
        <p>
          <Button primary to="/docs/install/build-from-source">
            Build Actual CFM
          </Button>
          <Button to="/docs/">Read the documentation</Button>
        </p>
        <section id="features">
          <h2>Built around your financial position</h2>
          <p>
            The roadmap connects annual category plans, dated asset values,
            reimbursements, debt, and upcoming cash requirements in one
            local-first workspace. Planned features are documented with
            acceptance criteria.
          </p>
          <p>
            <Link to="https://github.com/cpstrommen/actual-budget/blob/master/wishlist.md">
              Explore the implementation plan
            </Link>
          </p>
          <h2>Your records stay portable</h2>
          <p>
            A tested return path to upstream Actual Budget is required before
            CFM financial data extensions ship. Preserve the ledger and balance
            history, with open archives for CFM-specific records.
          </p>
          <p>
            <Link to="/docs/migration/return-to-actual-budget">
              Read the portability guide and current status
            </Link>
          </p>
        </section>
      </main>
    </Layout>
  );
}
