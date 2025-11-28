import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './AppLayout';

// Mocks for dependencies are now in the global setup file: src/test/setup.ts

// Mock child components to isolate the AppLayout test
vi.mock('@/components/server/ServerList', () => ({
  default: () => <div data-testid="server-list">ServerList</div>,
}));

vi.mock('@/components/channel/ChannelList', () => ({
  default: () => <div data-testid="channel-list">ChannelList</div>,
}));

vi.mock('@/components/user/UserPanel', () => ({
  default: () => <div data-testid="user-panel">UserPanel</div>,
}));

describe('AppLayout', () => {
  it('renders all the main layout components', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>Outlet Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('server-list')).toBeInTheDocument();
    expect(screen.getByTestId('channel-list')).toBeInTheDocument();
    expect(screen.getByTestId('user-panel')).toBeInTheDocument();
    expect(screen.getByText('Outlet Content')).toBeInTheDocument();
  });
});
