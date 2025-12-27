import { describe, it, expect } from 'vitest';
import { infraRegistry } from './infraRegistry';

describe('infraRegistry', () => {
  it('tracks online connection counts per serviceType', () => {
    const a = `test-service-a-${Date.now()}`;
    const b = `test-service-b-${Date.now()}`;

    infraRegistry.addConnection(a, 'socket-1');
    infraRegistry.addConnection(a, 'socket-2');
    infraRegistry.addConnection(b, 'socket-3');

    expect(infraRegistry.getOnlineCounts()).toMatchObject({ [a]: 2, [b]: 1 });
    expect(infraRegistry.isOnline(a)).toBe(true);
    expect(infraRegistry.isOnline(b)).toBe(true);

    infraRegistry.removeConnection(a, 'socket-1');
    expect(infraRegistry.getOnlineCounts()).toMatchObject({ [a]: 1, [b]: 1 });

    infraRegistry.removeConnection(a, 'socket-2');
    expect(infraRegistry.isOnline(a)).toBe(false);
  });
});

