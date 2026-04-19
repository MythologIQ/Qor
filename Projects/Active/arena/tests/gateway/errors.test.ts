import { describe, expect, it } from 'bun:test';
import { ERR, err, type ErrCode } from '../../src/gateway/errors';

describe('gateway errors', () => {
  describe('ERR codes', () => {
    it('AUTH has correct value', () => expect(ERR.AUTH).toBe('AUTH'));
    it('RATE_LIMIT has correct value', () => expect(ERR.RATE_LIMIT).toBe('RATE_LIMIT'));
    it('INVALID_ACTION has correct value', () => expect(ERR.INVALID_ACTION).toBe('INVALID_ACTION'));
    it('TIMEOUT has correct value', () => expect(ERR.TIMEOUT).toBe('TIMEOUT'));
    it('INTERNAL has correct value', () => expect(ERR.INTERNAL).toBe('INTERNAL'));
  });

  describe('err() factory', () => {
    it('returns code and message', () => {
      const result = err(ERR.AUTH, 'Unauthorized');
      expect(result.code).toBe('AUTH');
      expect(result.message).toBe('Unauthorized');
    });

    it('includes optional detail', () => {
      const result = err(ERR.RATE_LIMIT, 'Too many requests', 'user:bob');
      expect(result.code).toBe('RATE_LIMIT');
      expect(result.message).toBe('Too many requests');
      expect(result.detail).toBe('user:bob');
    });

    it('detail is undefined when not provided', () => {
      const result = err(ERR.INVALID_ACTION, 'Bad action');
      expect(result.detail).toBeUndefined();
    });
  });

  describe('ErrCode type', () => {
    it('accepts AUTH', () => {
      const code: ErrCode = ERR.AUTH;
      expect(code).toBe('AUTH');
    });
    it('accepts RATE_LIMIT', () => {
      const code: ErrCode = ERR.RATE_LIMIT;
      expect(code).toBe('RATE_LIMIT');
    });
    it('accepts INVALID_ACTION', () => {
      const code: ErrCode = ERR.INVALID_ACTION;
      expect(code).toBe('INVALID_ACTION');
    });
    it('accepts TIMEOUT', () => {
      const code: ErrCode = ERR.TIMEOUT;
      expect(code).toBe('TIMEOUT');
    });
    it('accepts INTERNAL', () => {
      const code: ErrCode = ERR.INTERNAL;
      expect(code).toBe('INTERNAL');
    });
  });

  describe('send helper (JSON serialization)', () => {
    it('serializes error as JSON with code, message, and detail', () => {
      const payload = err(ERR.INTERNAL, 'Server boom', 'stack:42');
      const json = JSON.stringify(payload);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({ code: 'INTERNAL', message: 'Server boom', detail: 'stack:42' });
    });

    it('serializes without detail field when absent', () => {
      const payload = err(ERR.TIMEOUT, 'Request timed out');
      const json = JSON.stringify(payload);
      const parsed = JSON.parse(json);
      expect(parsed.code).toBe('TIMEOUT');
      expect(parsed.message).toBe('Request timed out');
      expect(parsed.detail).toBeUndefined();
    });
  });
});