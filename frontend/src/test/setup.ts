import '@testing-library/jest-dom';
import React from 'react';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { server } from '../mocks/server';

vi.mock('@iconify/react', () => ({
  Icon: (props: any) =>
    React.createElement('span', { 'data-icon': props?.icon }),
}));

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
