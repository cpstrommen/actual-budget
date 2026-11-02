import { Navigate, useSearchParams } from 'react-router';

export function CfmRedirect() {
  const [params] = useSearchParams();
  const paths: Record<string, string> = {
    overview: '/summary',
    annual: '/planning',
    assets: '/balances/assets',
    obligations: '/balances/receivables',
    liquidity: '/summary/liquidity',
    reports: '/reports/packages',
    automation: '/settings/automation',
  };
  const account = params.get('account');
  const target = account
    ? '/balances?account=' + encodeURIComponent(account)
    : paths[params.get('tab') || 'overview'] || '/summary';
  return <Navigate to={target} replace />;
}
