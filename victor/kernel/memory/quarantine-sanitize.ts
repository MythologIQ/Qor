/**
 * Quarantine Sanitizer — Content preprocessing before adversarial scanning
 *
 * This module sanitizes external content (e.g., from Moltbook) before it enters
 * the adversarial scan pipeline. It performs:
 * - HTML/script tag stripping
 * - Base64 block decoding and flagging
 * - Unicode normalization
 * - Control character removal
 * - Length truncation
 *
 * @module kernel/memory/quarantine-sanitize
 */

import { ScanDetail, ScanCategory } from './types';

/**
 * Options for content sanitization
 */
export interface SanitizeOptions {
  /** Maximum length for sanitized content (default: 10000) */
  maxLength?: number;
  /** Whether to strip HTML tags (default: true) */
  stripHtml?: boolean;
  /** Whether to decode base64 blocks (default: true) */
  decodeBase64?: boolean;
  /** Whether to normalize unicode (default: true) */
  normalizeUnicode?: boolean;
  /** Whether to remove control characters (default: true) */
  removeControlChars?: boolean;
  /** Whether to flag suspicious encoding (default: true) */
  flagEncoded?: boolean;
}

/**
 * Result of content sanitization
 */
export interface SanitizeResult {
  /** Sanitized content ready for scanning */
  sanitized: string;
  /** Whether any sanitization was performed */
  wasModified: boolean;
  /** Whether encoded content was detected and flagged */
  hasEncodedContent: boolean;
  /** Scan details for any detected encoding issues */
  scanDetails: ScanDetail[];
  /** Length before sanitization */
  originalLength: number;
  /** Length after sanitization */
  finalLength: number;
  /** Number of HTML tags removed */
  htmlTagsRemoved: number;
  /** Number of base64 blocks decoded */
  base64BlocksDecoded: number;
  /** Number of control characters removed */
  controlCharsRemoved: number;
}

/** Default sanitization options */
const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  maxLength: 10000,
  stripHtml: true,
  decodeBase64: true,
  normalizeUnicode: true,
  removeControlChars: true,
  flagEncoded: true,
};

/**
 * Regex for detecting base64-encoded blocks (at least 16 chars to catch shorter strings)
 */
const BASE64_REGEX = /[A-Za-z0-9+/]{16,}={0,2}/g;

/**
 * Regex for HTML/script tags
 */
const HTML_TAG_REGEX = /<[^>]+>/g;

/**
 * Regex for script/event handler attributes (onclick, onerror, etc.)
 */
const EVENT_HANDLER_REGEX = /\s(on\w+)\s*=\s*["'][^"']*["']/gi;

/**
 * Regex for javascript: URLs
 */
const JS_URL_REGEX = /javascript:[^\s"']+/gi;

/**
 * Control characters to remove (0x00-0x1F except \t, \n, \r, and 0x7F)
 */
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Zero-width characters that could be used for steganography
 */
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\u2060\uFEFF]/g;

/**
 * RTL/LTR override characters
 */
const BIDI_OVERRIDE_REGEX = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Check if a string looks like valid base64
 */
function isValidBase64(str: string): boolean {
  // Must be divisible by 4 (with padding considered)
  if (str.length % 4 !== 0 && !str.endsWith('=')) {
    return false;
  }
  // Quick entropy check — valid base64 has decent character variety
  const uniqueChars = new Set(str.replace(/=+$/, '')).size;
  return uniqueChars >= 12; // Relaxed from 20 to catch shorter valid strings
}

/**
 * Decode a base64 string if valid
 */
function tryDecodeBase64(base64Str: string): string | null {
  try {
    if (!isValidBase64(base64Str)) {
      return null;
    }
    // Use Buffer for Node.js environment
    const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
    // Check if decoded content is printable
    if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
      return null; // Likely binary, not text
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Strip HTML tags from content
 */
function stripHtmlTags(content: string): { cleaned: string; tagsRemoved: number } {
  let cleaned = content;
  let tagsRemoved = 0;

  // Count and remove HTML tags
  const tagMatches = content.match(HTML_TAG_REGEX);
  if (tagMatches) {
    tagsRemoved = tagMatches.length;
    cleaned = cleaned.replace(HTML_TAG_REGEX, ' ');
  }

  // Remove event handler attributes (even without tags)
  cleaned = cleaned.replace(EVENT_HANDLER_REGEX, ' ');

  return { cleaned, tagsRemoved };
}

/**
 * Decode base64 blocks in content
 */
function decodeBase64Blocks(content: string): { decoded: string; blocksDecoded: number; details: ScanDetail[] } {
  let decoded = content;
  let blocksDecoded = 0;
  const details: ScanDetail[] = [];

  // Find potential base64 blocks
  const matches = content.match(BASE64_REGEX) || [];

  for (const match of matches) {
    const decodedBlock = tryDecodeBase64(match);
    if (decodedBlock && decodedBlock.length > 0) {
      // Replace the base64 with its decoded content
      decoded = decoded.replace(match, ` [BASE64:${decodedBlock}] `);
      blocksDecoded++;

      details.push({
        category: 'encoded-payload',
        matched: true,
        evidence: `Base64 block decoded: "${match.substring(0, 30)}..." -> "${decodedBlock.substring(0, 50)}..."`,
        severity: 'warning',
      });
    }
  }

  return { decoded, blocksDecoded, details };
}

/**
 * Remove control characters from content
 */
function removeControlCharacters(content: string): { cleaned: string; removed: number; details: ScanDetail[] } {
  let cleaned = content;
  let removed = 0;
  const details: ScanDetail[] = [];

  // Count and remove standard control characters
  const controlMatches = content.match(CONTROL_CHAR_REGEX);
  if (controlMatches) {
    removed += controlMatches.length;
    cleaned = cleaned.replace(CONTROL_CHAR_REGEX, '');
    details.push({
      category: 'control-character',
      matched: true,
      evidence: `Removed ${controlMatches.length} control characters (0x00-0x1F, 0x7F)`,
      severity: 'warning',
    });
  }

  // Count and remove zero-width characters (steganography risk)
  const zeroWidthMatches = content.match(ZERO_WIDTH_REGEX);
  if (zeroWidthMatches) {
    removed += zeroWidthMatches.length;
    cleaned = cleaned.replace(ZERO_WIDTH_REGEX, '');
    details.push({
      category: 'control-character',
      matched: true,
      evidence: `Removed ${zeroWidthMatches.length} zero-width characters (steganography risk)`,
      severity: 'critical',
    });
  }

  // Count and remove bidi override characters
  const bidiMatches = content.match(BIDI_OVERRIDE_REGEX);
  if (bidiMatches) {
    removed += bidiMatches.length;
    cleaned = cleaned.replace(BIDI_OVERRIDE_REGEX, '');
    details.push({
      category: 'control-character',
      matched: true,
      evidence: `Removed ${bidiMatches.length} bidirectional override characters`,
      severity: 'critical',
    });
  }

  return { cleaned, removed, details };
}

/**
 * Normalize unicode to NFKC form
 */
function normalizeUnicode(content: string): string {
  return content.normalize('NFKC');
}

/**
 * Truncate content to maximum length with ellipsis indicator
 */
function truncateContent(content: string, maxLength: number): { truncated: string; wasTruncated: boolean } {
  if (content.length <= maxLength) {
    return { truncated: content, wasTruncated: false };
  }
  return {
    truncated: content.substring(0, maxLength - 3) + '...',
    wasTruncated: true,
  };
}

/**
 * Sanitize external content before adversarial scanning
 *
 * This is the main entry point for the quarantine sanitizer. It performs
 * all sanitization steps in the correct order:
 * 1. Strip HTML/script tags
 * 2. Decode base64 blocks
 * 3. Remove control characters
 * 4. Normalize unicode
 * 5. Truncate to max length
 *
 * @param content - Raw content from external source
 * @param options - Sanitization options
 * @returns Sanitization result with cleaned content and metadata
 */
export function sanitizeContent(
  content: string,
  options: SanitizeOptions = {}
): SanitizeResult {
  // Guard against null/undefined
  if (!content || typeof content !== 'string') {
    return {
      sanitized: '',
      wasModified: true,
      hasEncodedContent: false,
      scanDetails: [],
      originalLength: 0,
      finalLength: 0,
      htmlTagsRemoved: 0,
      base64BlocksDecoded: 0,
      controlCharsRemoved: 0,
    };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalLength = content.length;
  let working = content;
  let wasModified = false;
  const allDetails: ScanDetail[] = [];

  // Track metrics
  let htmlTagsRemoved = 0;
  let base64BlocksDecoded = 0;
  let controlCharsRemoved = 0;
  let jsUrlsFound = 0;

  // Step 1: Detect and replace javascript: URLs FIRST (before stripping HTML)
  if (opts.stripHtml) {
    const jsMatches = working.match(JS_URL_REGEX);
    if (jsMatches) {
      jsUrlsFound = jsMatches.length;
      // Replace the URLs before stripping tags
      working = working.replace(JS_URL_REGEX, '[removed-js-url]');
      wasModified = true;
      allDetails.push({
        category: 'credential-phishing',
        matched: true,
        evidence: `Removed ${jsUrlsFound} javascript: URL(s)`,
        severity: 'critical',
      });
    }
  }

  // Step 2: Strip HTML tags
  if (opts.stripHtml) {
    const { cleaned, tagsRemoved } = stripHtmlTags(working);
    if (tagsRemoved > 0) {
      wasModified = true;
      htmlTagsRemoved = tagsRemoved;
      allDetails.push({
        category: 'html-injection',
        matched: true,
        evidence: `Stripped ${tagsRemoved} HTML/script tags or event handlers`,
        severity: tagsRemoved > 5 ? 'critical' : 'warning',
      });
    }
    working = cleaned;
  }

  // Step 2: Decode base64 blocks
  if (opts.decodeBase64) {
    const { decoded, blocksDecoded, details } = decodeBase64Blocks(working);
    if (blocksDecoded > 0) {
      wasModified = true;
      base64BlocksDecoded = blocksDecoded;
      allDetails.push(...details);
    }
    working = decoded;
  }

  // Step 3: Remove control characters
  if (opts.removeControlChars) {
    const { cleaned, removed, details } = removeControlCharacters(working);
    if (removed > 0) {
      wasModified = true;
      controlCharsRemoved = removed;
      allDetails.push(...details);
    }
    working = cleaned;
  }

  // Step 4: Normalize unicode
  if (opts.normalizeUnicode) {
    const normalized = normalizeUnicode(working);
    if (normalized !== working) {
      wasModified = true;
    }
    working = normalized;
  }

  // Step 5: Truncate to max length
  const { truncated, wasTruncated } = truncateContent(working, opts.maxLength);
  if (wasTruncated) {
    wasModified = true;
    allDetails.push({
      category: 'framing-manipulation',
      matched: true,
      evidence: `Content truncated from ${working.length} to ${opts.maxLength} chars`,
      severity: 'info',
    });
  }
  working = truncated;

  // Clean up whitespace (collapse multiple spaces)
  const whitespaceCollapsed = working.replace(/\s+/g, ' ').trim();
  if (whitespaceCollapsed !== working) {
    wasModified = true;
  }
  working = whitespaceCollapsed;

  return {
    sanitized: working,
    wasModified,
    hasEncodedContent: base64BlocksDecoded > 0,
    scanDetails: allDetails,
    originalLength,
    finalLength: working.length,
    htmlTagsRemoved,
    base64BlocksDecoded,
    controlCharsRemoved,
  };
}

/**
 * Quick check if content appears to contain encoded/obfuscated content
 *
 * Use this for early detection before full sanitization.
 *
 * @param content - Content to check
 * @returns True if encoded content detected
 */
export function hasEncodedContent(content: string): boolean {
  // Guard against null/undefined
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Check for base64-like sequences
  const base64Matches = content.match(BASE64_REGEX) || [];
  for (const match of base64Matches) {
    if (isValidBase64(match) && tryDecodeBase64(match)) {
      return true;
    }
  }

  // Check for zero-width characters
  if (ZERO_WIDTH_REGEX.test(content)) {
    return true;
  }

  // Check for bidi overrides
  if (BIDI_OVERRIDE_REGEX.test(content)) {
    return true;
  }

  // Check for HTML tags
  if (HTML_TAG_REGEX.test(content)) {
    return true;
  }

  return false;
}

/**
 * Estimate the "cleanliness" of content on a 0-1 scale
 *
 * Higher is cleaner (less sanitization needed).
 *
 * @param content - Content to assess
 * @returns Cleanliness score (0-1)
 */
export function estimateCleanliness(content: string): number {
  // Guard against null/undefined
  if (!content || typeof content !== 'string' || content.length === 0) {
    return 1.0;
  }

  let penalty = 0;

  // HTML tags
  const htmlMatches = content.match(HTML_TAG_REGEX);
  if (htmlMatches) {
    penalty += Math.min(htmlMatches.length * 0.05, 0.3);
  }

  // Base64 blocks - use the same logic as hasEncodedContent
  const base64Matches = content.match(BASE64_REGEX) || [];
  let validBase64Count = 0;
  for (const match of base64Matches) {
    if (isValidBase64(match) && tryDecodeBase64(match)) {
      validBase64Count++;
    }
  }
  penalty += Math.min(validBase64Count * 0.1, 0.3);

  // Control characters
  const controlMatches = content.match(CONTROL_CHAR_REGEX);
  if (controlMatches) {
    penalty += Math.min(controlMatches.length * 0.02, 0.2);
  }

  // Zero-width characters
  const zeroWidthMatches = content.match(ZERO_WIDTH_REGEX);
  if (zeroWidthMatches) {
    penalty += Math.min(zeroWidthMatches.length * 0.05, 0.2);
  }

  // Bidi overrides
  const bidiMatches = content.match(BIDI_OVERRIDE_REGEX);
  if (bidiMatches) {
    penalty += Math.min(bidiMatches.length * 0.1, 0.3);
  }

  return Math.max(0, 1 - penalty);
}
