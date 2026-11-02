import { MemoryRouter, Route, Routes } from 'react-router';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AutomaticSyncSettings } from './AutomaticSyncSettings';

it('directs bank refresh configuration to the single CFM automation controller', async () => {
  render(
    <MemoryRouter initialEntries={['/bank-sync']}>
      <Routes>
        <Route path="/bank-sync" element={<AutomaticSyncSettings />} />
        <Route
          path="/settings/automation"
          element={<p>CFM scheduler configuration</p>}
        />
      </Routes>
    </MemoryRouter>,
  );
  const link = screen.getByRole('link', {
    name: 'Open CFM automation settings',
  });
  expect(link).toHaveAttribute('href', '/settings/automation');
  expect(screen.getByText(/disabled until configured/)).toBeInTheDocument();
  await userEvent.click(link);
  expect(screen.getByText('CFM scheduler configuration')).toBeInTheDocument();
});
