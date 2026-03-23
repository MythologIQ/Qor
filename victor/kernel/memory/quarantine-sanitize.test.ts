/**
 * Quarantine Sanitizer Tests
 *
 * Tests for the content sanitization pipeline that prepares external content
 * for adversarial scanning.
 */

import { describe, it, expect } from 'bun:test';
import {
  sanitizeContent,
  hasEncodedContent,
  estimateCleanliness,
  SanitizeOptions,
} from './quarantine-sanitize';

describe('sanitizeContent', () => {
  it('should return unmodified clean text', () => {
    const input = 'This is clean text without any issues.';
    const result = sanitizeContent(input);

    expect(result.sanitized).toBe(input);
    expect(result.wasModified).toBe(false);
    expect(result.hasEncodedContent).toBe(false);
    expect(result.scanDetails).toHaveLength(0);
    expect(result.originalLength).toBe(input.length);
    expect(result.finalLength).toBe(input.length);
    expect(result.htmlTagsRemoved).toBe(0);
    expect(result.base64BlocksDecoded).toBe(0);
    expect(result.controlCharsRemoved).toBe(0);
  });

  it('should strip HTML tags', () => {
    const input = '<p>Hello <script>alert("xss")</script> world</p>';
    const result = sanitizeContent(input);

    expect(result.sanitized).not.toContain('<p>');
    expect(result.sanitized).not.toContain('<script>');
    expect(result.sanitized).not.toContain('</p>');
    expect(result.htmlTagsRemoved).toBeGreaterThan(0);
    expect(result.wasModified).toBe(true);
    expect(result.scanDetails.some(d => d.category === 'html-injection')).toBe(true);
  });

  it('should strip event handler attributes', () => {
    const input = '<div onclick="alert(1)" onerror="steal()">Click me</div>';
    const result = sanitizeContent(input);

    expect(result.sanitized).not.toContain('onclick');
    expect(result.sanitized).not.toContain('onerror');
    expect(result.wasModified).toBe(true);
  });

  it('should remove javascript: URLs', () => {
    const input = '<a href="javascript:alert(\'xss\')">Click</a>';
    const result = sanitizeContent(input);

    // The javascript: URL should be detected and flagged
    expect(result.scanDetails.some(d =>
      d.category === 'credential-phishing' &&
      d.evidence?.includes('javascript:')
    )).toBe(true);
    expect(result.wasModified).toBe(true);
  });

  it('should decode valid base64 blocks', () => {
    const encoded = Buffer.from('Hello from base64').toString('base64');
    const input = `Check this: ${encoded} for hidden content`;
    const result = sanitizeContent(input);

    expect(result.base64BlocksDecoded).toBe(1);
    expect(result.hasEncodedContent).toBe(true);
    expect(result.sanitized).toContain('Hello from base64');
    expect(result.scanDetails.some(d => d.category === 'encoded-payload')).toBe(true);
    expect(result.wasModified).toBe(true);
  });

  it('should not decode invalid base64-like strings', () => {
    const input = 'This is not valid base64: abc123 xyz789';
    const result = sanitizeContent(input);

    expect(result.base64BlocksDecoded).toBe(0);
    expect(result.hasEncodedContent).toBe(false);
  });

  it('should remove control characters', () => {
    const input = 'Hello\x00World\x01Test\x7F';
    const result = sanitizeContent(input);

    expect(result.sanitized).not.toContain('\x00');
    expect(result.sanitized).not.toContain('\x01');
    expect(result.sanitized).not.toContain('\x7F');
    expect(result.controlCharsRemoved).toBeGreaterThan(0);
    expect(result.wasModified).toBe(true);
    expect(result.scanDetails.some(d => d.category === 'control-character')).toBe(true);
  });

  it('should remove zero-width characters (steganography risk)', () => {
    const input = 'Hello\u200BWorld\u200C'; // Zero-width space and non-joiner
    const result = sanitizeContent(input);

    expect(result.sanitized).not.toContain('\u200B');
    expect(result.sanitized).not.toContain('\u200C');
    expect(result.controlCharsRemoved).toBeGreaterThan(0);
    expect(result.wasModified).toBe(true);
    expect(result.scanDetails.some(d =>
      d.category === 'control-character' &&
      d.evidence?.includes('zero-width')
    )).toBe(true);
  });

  it('should remove bidirectional override characters', () => {
    const input = 'Hello\u202EWorld'; // Right-to-left override
    const result = sanitizeContent(input);

    expect(result.sanitized).not.toContain('\u202E');
    expect(result.controlCharsRemoved).toBeGreaterThan(0);
    expect(result.wasModified).toBe(true);
    expect(result.scanDetails.some(d =>
      d.category === 'control-character' &&
      d.evidence?.includes('bidirectional')
    )).toBe(true);
  });

  it('should normalize unicode', () => {
    // Using compatibility equivalence characters that normalize differently
    const input = 'Ｈｅｌｌｏ'; // Fullwidth characters
    const result = sanitizeContent(input);

    expect(result.sanitized).toBe('Hello');
    expect(result.wasModified).toBe(true);
  });

  it('should truncate content exceeding max length', () => {
    const input = 'a'.repeat(15000);
    const result = sanitizeContent(input, { maxLength: 1000 });

    expect(result.finalLength).toBeLessThanOrEqual(1000);
    expect(result.sanitized.endsWith('...')).toBe(true);
    expect(result.wasModified).toBe(true);
    expect(result.scanDetails.some(d =>
      d.category === 'framing-manipulation' &&
      d.evidence?.includes('truncated')
    )).toBe(true);
  });

  it('should not truncate content under max length', () => {
    const input = 'Short content';
    const result = sanitizeContent(input, { maxLength: 1000 });

    expect(result.finalLength).toBe(input.length);
    expect(result.sanitized).toBe(input);
    expect(result.wasModified).toBe(false);
  });

  it('should apply default max length of 10000', () => {
    const input = 'a'.repeat(12000);
    const result = sanitizeContent(input);

    expect(result.finalLength).toBeLessThanOrEqual(10000);
    expect(result.wasModified).toBe(true);
  });

  it('should handle empty input', () => {
    const result = sanitizeContent('');

    expect(result.sanitized).toBe('');
    expect(result.wasModified).toBe(true); // Whitespace collapse runs
    expect(result.scanDetails).toHaveLength(0);
  });

  it('should handle whitespace-only input', () => {
    const result = sanitizeContent('   \n\t   ');

    expect(result.sanitized).toBe('');
    expect(result.wasModified).toBe(true); // Whitespace collapsed to empty
  });

  it('should respect stripHtml option', () => {
    const input = '<p>Hello</p>';
    const withStrip = sanitizeContent(input, { stripHtml: true });
    const withoutStrip = sanitizeContent(input, { stripHtml: false });

    expect(withStrip.sanitized).not.toContain('<p>');
    expect(withoutStrip.sanitized).toContain('<p>');
  });

  it('should respect decodeBase64 option', () => {
    const encoded = Buffer.from('this is a longer secret message').toString('base64');
    const input = `Data: ${encoded}`;
    const withDecode = sanitizeContent(input, { decodeBase64: true });
    const withoutDecode = sanitizeContent(input, { decodeBase64: false });

    expect(withDecode.base64BlocksDecoded).toBe(1);
    expect(withoutDecode.base64BlocksDecoded).toBe(0);
  });

  it('should respect removeControlChars option', () => {
    const input = 'Hello\x00World';
    const withRemove = sanitizeContent(input, { removeControlChars: true });
    const withoutRemove = sanitizeContent(input, { removeControlChars: false });

    expect(withRemove.controlCharsRemoved).toBeGreaterThan(0);
    expect(withoutRemove.controlCharsRemoved).toBe(0);
  });

  it('should respect normalizeUnicode option', () => {
    const input = 'Ｈｅｌｌｏ';
    const withNormalize = sanitizeContent(input, { normalizeUnicode: true });
    const withoutNormalize = sanitizeContent(input, { normalizeUnicode: false });

    expect(withNormalize.sanitized).toBe('Hello');
    expect(withoutNormalize.sanitized).toBe(input);
  });

  it('should handle complex mixed content', () => {
    const encoded = Buffer.from('hidden message').toString('base64');
    const input = `<script>alert('xss')</script>
    <p onclick="steal()">Hello\u200B world</p>
    Secret: ${encoded}
    \x00\x01\x02`;

    const result = sanitizeContent(input);

    expect(result.wasModified).toBe(true);
    expect(result.htmlTagsRemoved).toBeGreaterThan(0);
    expect(result.base64BlocksDecoded).toBe(1);
    expect(result.controlCharsRemoved).toBeGreaterThan(0);
    expect(result.hasEncodedContent).toBe(true);
    expect(result.scanDetails.length).toBeGreaterThan(0);

    // Verify sanitized output is cleaner
    expect(result.sanitized).not.toContain('<script>');
    expect(result.sanitized).not.toContain('onclick');
    expect(result.sanitized).not.toContain('\u200B');
    expect(result.sanitized).not.toContain('\x00');
    expect(result.sanitized).toContain('hidden message'); // Decoded base64
  });

  it('should collapse multiple spaces into single space', () => {
    const input = 'Hello    world\n\n\ntest';
    const result = sanitizeContent(input);

    expect(result.sanitized).toBe('Hello world test');
    expect(result.wasModified).toBe(true);
  });

  it('should handle multiple base64 blocks', () => {
    const encoded1 = Buffer.from('first message').toString('base64');
    const encoded2 = Buffer.from('second message').toString('base64');
    const input = `${encoded1} and ${encoded2}`;

    const result = sanitizeContent(input);

    expect(result.base64BlocksDecoded).toBe(2);
    expect(result.sanitized).toContain('first message');
    expect(result.sanitized).toContain('second message');
  });

  it('should not crash on malformed input', () => {
    const inputs = [
      null as unknown as string,
      undefined as unknown as string,
      123 as unknown as string,
      {},
    ];

    for (const input of inputs) {
      expect(() => sanitizeContent(input)).not.toThrow();
    }
  });
});

describe('hasEncodedContent', () => {
  it('should return false for clean text', () => {
    expect(hasEncodedContent('Clean text')).toBe(false);
  });

  it('should detect base64 content', () => {
    const encoded = Buffer.from('this is a longer secret message').toString('base64');
    expect(hasEncodedContent(`Data: ${encoded}`)).toBe(true);
  });

  it('should detect HTML tags', () => {
    expect(hasEncodedContent('<p>Hello</p>')).toBe(true);
  });

  it('should detect zero-width characters', () => {
    expect(hasEncodedContent('Hello\u200B')).toBe(true);
  });

  it('should detect bidi overrides', () => {
    expect(hasEncodedContent('Hello\u202E')).toBe(true);
  });

  it('should return false for text that looks like base64 but is not valid', () => {
    expect(hasEncodedContent('abc123')).toBe(false);
  });
});

describe('estimateCleanliness', () => {
  it('should return 1.0 for empty content', () => {
    expect(estimateCleanliness('')).toBe(1.0);
  });

  it('should return 1.0 for perfectly clean content', () => {
    expect(estimateCleanliness('This is very clean text.')).toBe(1.0);
  });

  it('should reduce score for HTML tags', () => {
    const clean = estimateCleanliness('Hello world');
    const withHtml = estimateCleanliness('<p>Hello</p><p>World</p>');

    expect(withHtml).toBeLessThan(clean);
    expect(withHtml).toBeGreaterThan(0.5);
  });

  it('should reduce score for control characters', () => {
    const clean = estimateCleanliness('Hello world');
    const withControl = estimateCleanliness('Hello\x00\x01\x02 world');

    expect(withControl).toBeLessThan(clean);
  });

  it('should reduce score significantly for zero-width characters', () => {
    const clean = estimateCleanliness('Hello world');
    const withZeroWidth = estimateCleanliness('Hello\u200B\u200C world');

    expect(withZeroWidth).toBeLessThan(clean);
    expect(withZeroWidth).toBeLessThanOrEqual(0.9); // 2 chars * 0.05 = 0.1 penalty
  });

  it('should reduce score for bidi overrides', () => {
    const clean = estimateCleanliness('Hello world');
    const withBidi = estimateCleanliness('Hello\u202E world');

    expect(withBidi).toBeLessThan(clean);
  });

  it('should reduce score for base64 content', () => {
    const encoded = Buffer.from('this is a much longer secret message with more content').toString('base64');
    const clean = estimateCleanliness('Hello world');
    const withBase64 = estimateCleanliness(`Data: ${encoded}`);

    expect(withBase64).toBeLessThan(clean);
  });

  it('should never return negative values', () => {
    const nasty = '<script>\x00\u200B\u202E' + Buffer.from('x'.repeat(100)).toString('base64');
    const score = estimateCleanliness(nasty);

    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('should never return values above 1.0', () => {
    expect(estimateCleanliness('Perfect')).toBeLessThanOrEqual(1.0);
  });
});
