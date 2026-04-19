// task-148-gateway-registry-tests | phase E | writes: tests/gateway/registry.test.ts

import { describe, it, expect } from 'vitest';
import { SessionRegistry } from '../../src/gateway/registry.js';
import type { AgentChannel } from '../../src/runner/types.js';

const mockChannel = (id: string): AgentChannel => {
  const handlers: ((m: unknown) => void)[] = [];
  return {
    send: (msg: unknown) => { /* noop for test */ },
    onMessage: (cb: (m: unknown) => void) => { handlers.push(cb); },
    close: () => { /* noop for test */ },
  };
};

describe('task-148-gateway-registry-tests', () => {

  describe('register and get', () => {
    it('returns registered channel by opId', () => {
      const registry = new SessionRegistry();
      const ch = mockChannel('ch-1');
      registry.register('op-1', ch);
      expect(registry.get('op-1')).toBe(ch);
    });

    it('returns null for unregistered opId', () => {
      const registry = new SessionRegistry();
      expect(registry.get('never-registered')).toBeNull();
    });

    it('overwrites prior registration for same opId', () => {
      const registry = new SessionRegistry();
      const ch1 = mockChannel('ch-1');
      const ch2 = mockChannel('ch-2');
      registry.register('op-1', ch1);
      registry.register('op-1', ch2);
      expect(registry.get('op-1')).toBe(ch2);
    });

    it('roundtrip: register multiple channels and retrieve each', () => {
      const registry = new SessionRegistry();
      const chA = mockChannel('ch-a');
      const chB = mockChannel('ch-b');
      registry.register('op-a', chA);
      registry.register('op-b', chB);
      expect(registry.get('op-a')).toBe(chA);
      expect(registry.get('op-b')).toBe(chB);
    });
  });

  describe('unregister', () => {
    it('removes channel so get returns null', () => {
      const registry = new SessionRegistry();
      registry.register('op-1', mockChannel('ch-1'));
      registry.unregister('op-1');
      expect(registry.get('op-1')).toBeNull();
    });

    it('is idempotent on unregistered opId', () => {
      const registry = new SessionRegistry();
      expect(() => registry.unregister('never-there')).not.toThrow();
    });

    it('can re-register after unregister', () => {
      const registry = new SessionRegistry();
      const ch1 = mockChannel('ch-1');
      registry.register('op-1', ch1);
      registry.unregister('op-1');
      const ch2 = mockChannel('ch-2');
      registry.register('op-1', ch2);
      expect(registry.get('op-1')).toBe(ch2);
    });
  });

  describe('size', () => {
    it('starts at zero', () => {
      const registry = new SessionRegistry();
      expect(registry.size()).toBe(0);
    });

    it('increments after register', () => {
      const registry = new SessionRegistry();
      registry.register('op-1', mockChannel('ch-1'));
      expect(registry.size()).toBe(1);
    });

    it('increments for each distinct opId', () => {
      const registry = new SessionRegistry();
      registry.register('op-1', mockChannel('ch-1'));
      registry.register('op-2', mockChannel('ch-2'));
      registry.register('op-3', mockChannel('ch-3'));
      expect(registry.size()).toBe(3);
    });

    it('decrements after unregister', () => {
      const registry = new SessionRegistry();
      registry.register('op-1', mockChannel('ch-1'));
      registry.register('op-2', mockChannel('ch-2'));
      registry.unregister('op-1');
      expect(registry.size()).toBe(1);
    });

    it('stays at zero after unregister of never-registered id', () => {
      const registry = new SessionRegistry();
      registry.unregister('ghost');
      expect(registry.size()).toBe(0);
    });

    it('equals zero after all registrations are unregistered', () => {
      const registry = new SessionRegistry();
      registry.register('op-1', mockChannel('ch-1'));
      registry.register('op-2', mockChannel('ch-2'));
      registry.unregister('op-1');
      registry.unregister('op-2');
      expect(registry.size()).toBe(0);
    });
  });

});
