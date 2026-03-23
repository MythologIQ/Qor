/**
 * Test that TemporalMetadata correctly integrates ThermodynamicState
 */

import { describe, expect, test } from 'bun:test';
import type { TemporalMetadata, SemanticNodeRecord } from './types.js';
import {
  initializeThermodynamicState,
  updateStateOnAccess,
  isGroundState,
} from './thermodynamic-decay.js';

describe('TemporalMetadata with Thermodynamic State', () => {
  test('can store thermodynamic state in temporal metadata', () => {
    const temporal: TemporalMetadata = {
      t0: Date.now(),
      w0: 1.0,
      lambda: 0.00001, // legacy field
      decayProfile: 'standard', // legacy field
      restakeCount: 0,
      thermodynamic: initializeThermodynamicState(0.5),
    };

    expect(temporal.thermodynamic).toBeDefined();
    expect(temporal.thermodynamic!.saturation).toBe(0.5);
    expect(temporal.thermodynamic!.temperature).toBeGreaterThan(0);
    expect(temporal.thermodynamic!.effectiveLambda).toBeGreaterThan(0);
  });

  test('can update thermodynamic state via access', () => {
    const temporal: TemporalMetadata = {
      t0: Date.now(),
      w0: 1.0,
      lambda: 0.00001,
      decayProfile: 'standard',
      restakeCount: 0,
      thermodynamic: initializeThermodynamicState(0.3),
    };

    const initialSaturation = temporal.thermodynamic!.saturation;

    // Simulate access
    temporal.thermodynamic = updateStateOnAccess(temporal.thermodynamic!);

    expect(temporal.thermodynamic.saturation).toBeGreaterThan(initialSaturation);
    expect(temporal.thermodynamic.accessCount).toBe(1);
    expect(temporal.thermodynamic.lastAccessedAt).toBeGreaterThan(0);
  });

  test('semantic node can have thermodynamic temporal metadata', () => {
    const node: SemanticNodeRecord = {
      id: 'node_test',
      documentId: 'doc_1',
      sourceChunkId: 'chunk_1',
      nodeType: 'Task',
      label: 'Test Task',
      summary: 'A test task node',
      fingerprint: 'fp_test',
      span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
      attributes: {},
      state: 'active',
      temporal: {
        t0: Date.now(),
        w0: 1.0,
        lambda: 0.00001,
        decayProfile: 'standard',
        restakeCount: 0,
        thermodynamic: initializeThermodynamicState(0.0),
      },
    };

    expect(node.temporal).toBeDefined();
    expect(node.temporal!.thermodynamic).toBeDefined();
    expect(node.temporal!.thermodynamic!.saturation).toBe(0.0);
  });

  test('can drive memory to ground state through access', () => {
    const temporal: TemporalMetadata = {
      t0: Date.now(),
      w0: 1.0,
      lambda: 0.00001,
      decayProfile: 'standard',
      restakeCount: 0,
      thermodynamic: initializeThermodynamicState(0.0),
    };

    // Access 50 times
    for (let i = 0; i < 50; i++) {
      temporal.thermodynamic = updateStateOnAccess(temporal.thermodynamic!);
    }

    expect(isGroundState(temporal.thermodynamic!)).toBe(true);
    expect(temporal.thermodynamic!.saturation).toBeCloseTo(1.0, 1);
    expect(temporal.thermodynamic!.temperature).toBeCloseTo(0.0, 1);
    expect(temporal.thermodynamic!.effectiveLambda).toBeCloseTo(0.0, 2);
  });

  test('thermodynamic state is optional for backwards compatibility', () => {
    const temporal: TemporalMetadata = {
      t0: Date.now(),
      w0: 1.0,
      lambda: 0.00001,
      decayProfile: 'standard',
      restakeCount: 0,
      // No thermodynamic field
    };

    expect(temporal.thermodynamic).toBeUndefined();
    expect(temporal.lambda).toBe(0.00001);
    expect(temporal.decayProfile).toBe('standard');
  });

  test('callers can inspect thermodynamic state without reconstruction', () => {
    const temporal: TemporalMetadata = {
      t0: Date.now(),
      w0: 1.0,
      lambda: 0.00001,
      decayProfile: 'standard',
      restakeCount: 0,
      thermodynamic: initializeThermodynamicState(0.7),
    };

    // Direct inspection - no need to recalculate
    const saturation = temporal.thermodynamic!.saturation;
    const temperature = temporal.thermodynamic!.temperature;
    const effectiveLambda = temporal.thermodynamic!.effectiveLambda;

    expect(saturation).toBe(0.7);
    expect(temperature).toBeGreaterThan(0);
    expect(effectiveLambda).toBeGreaterThan(0);
    expect(effectiveLambda).toBeLessThan(0.693); // Less than base lambda
  });
});
