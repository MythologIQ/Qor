// task-158-gateway-presence-tests
// Tests: upgrade + register → presence.isOnline true; close → isOnline false

import { describe, test, expect, beforeEach } from 'bun:test';
import { presenceTracker } from '../../src/matchmaker/presence.js';

let operatorId = 42;

describe('gateway presence integration', () => {
  beforeEach(() => {
    // Reset presence state before each test
    presenceTracker.disconnect(operatorId);
  });

  test('upgrade + register → presence.isOnline true', () => {
    // Simulate WebSocket upgrade and operator registration
    presenceTracker.connect(operatorId);
    expect(presenceTracker.isOnline(operatorId)).toBe(true);
  });

  test('close → isOnline false', () => {
    // Pre-condition: operator is online
    presenceTracker.connect(operatorId);
    expect(presenceTracker.isOnline(operatorId)).toBe(true);

    // Simulate WebSocket close
    presenceTracker.disconnect(operatorId);
    expect(presenceTracker.isOnline(operatorId)).toBe(false);
  });
});
