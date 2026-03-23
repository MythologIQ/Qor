/**
 * Quarantine Scan Engine — 4-layer adversarial content detection
 *
 * Detects prompt injection, authority manipulation, identity assertions,
 * encoded payloads, and flood attacks in external content before it enters
 * the memory pipeline.
 *
 * Layer 1: Literal pattern matching (50+ injection markers)
 * Layer 2: Structural heuristics (imperatives, authority, identity, framing)
 * Layer 3: Encoding detection (base64, unicode, zero-width, bidi, homoglyphs)
 * Layer 4: Similarity/flood detection (near-duplicates, author flooding)
 */

import type { ScanCategory, ScanDetail, ScanVerdict } from './types.js';

// ============================================================================
// Scan Result Types
// ============================================================================

export interface ScanResult {
  verdict: ScanVerdict;
  score: number;
  details: ScanDetail[];
  scannedAt: number;
}

export interface SimilarityCheck {
  isDuplicate: boolean;
  similarItemId?: string;
  similarityScore: number;
}

export interface FloodCheck {
  isFlood: boolean;
  authorPostCount: number;
  threshold: number;
}

// ============================================================================
// Layer 1: Literal Pattern Matching
// ============================================================================

const LITERAL_PATTERNS: Array<{ pattern: RegExp; category: ScanCategory; severity: 'warning' | 'critical' }> = [
  // Classic injection markers
  { pattern: /ignore previous instructions/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /ignore all prior directives/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /disregard prior directives/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /override earlier commands/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /forget everything above/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /forget all previous instructions/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /new instructions?[:\s]/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /updated rules?[:\s]/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /system prompt/gi, category: 'prompt-injection-literal', severity: 'warning' },
  { pattern: /system message/gi, category: 'prompt-injection-literal', severity: 'warning' },
  { pattern: /system instruction/gi, category: 'prompt-injection-literal', severity: 'warning' },
  { pattern: /developer message/gi, category: 'prompt-injection-literal', severity: 'warning' },
  { pattern: /developer mode/gi, category: 'prompt-injection-literal', severity: 'warning' },
  { pattern: /jailbreak/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /DAN\s*\(Do Anything Now\)/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /do anything now/gi, category: 'prompt-injection-literal', severity: 'warning' },

  // Model-specific targeting
  { pattern: /you are\s+(?:GPT|Claude|Gemini|Llama)/gi, category: 'identity-assertion', severity: 'critical' },
  { pattern: /you are\s+(?:an?\s+)?(?:AI|LLM|language model|assistant)/gi, category: 'identity-assertion', severity: 'warning' },
  { pattern: /your name is\s+\w+/gi, category: 'identity-assertion', severity: 'critical' },
  { pattern: /you are called\s+\w+/gi, category: 'identity-assertion', severity: 'critical' },
  { pattern: /call yourself\s+\w+/gi, category: 'identity-assertion', severity: 'critical' },
  { pattern: /your identity is\s+/gi, category: 'identity-assertion', severity: 'critical' },

  // Authority claims
  { pattern: /i am (?:the\s+)?(?:system|admin|developer|creator|owner)/gi, category: 'authority-claim', severity: 'critical' },
  { pattern: /this is (?:the\s+)?(?:system|admin|developer|creator|owner)/gi, category: 'authority-claim', severity: 'critical' },
  { pattern: /trust me[.,;:!]/gi, category: 'authority-claim', severity: 'warning' },
  { pattern: /trust this[.,;:!]/gi, category: 'authority-claim', severity: 'warning' },
  { pattern: /i am your (?:developer|creator|owner)/gi, category: 'authority-claim', severity: 'critical' },
  { pattern: /i created you/gi, category: 'authority-claim', severity: 'critical' },
  { pattern: /i own you/gi, category: 'authority-claim', severity: 'critical' },
  { pattern: /authority[\s:]+\w+/gi, category: 'authority-claim', severity: 'warning' },

  // Instruction framing
  { pattern: /from now on[.,;:!]/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /starting now[.,;:!]/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /effective immediately[.,;:!]/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /as of now[.,;:!]/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /going forward[.,;:!]/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /you should always/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /you must always/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /always remember (?:that\s+)?you/gi, category: 'framing-manipulation', severity: 'warning' },
  { pattern: /never forget (?:that\s+)?you/gi, category: 'framing-manipulation', severity: 'warning' },

  // Multi-language injection (common phrases)
  { pattern: /ignora las instrucciones anteriores/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /ignorer les instructions précédentes/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /vorherige anweisungen ignorieren/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /無視先前的指示/gi, category: 'prompt-injection-literal', severity: 'critical' },
  { pattern: /проигнорируй предыдущие инструкции/gi, category: 'prompt-injection-literal', severity: 'critical' },

  // Structural indicators
  { pattern: /<system>/gi, category: 'prompt-injection-structural', severity: 'critical' },
  { pattern: /<\/system>/gi, category: 'prompt-injection-structural', severity: 'critical' },
  { pattern: /\[system\]/gi, category: 'prompt-injection-structural', severity: 'critical' },
  { pattern: /\[instructions?\]/gi, category: 'prompt-injection-structural', severity: 'warning' },
  { pattern: /\[prompt\]/gi, category: 'prompt-injection-structural', severity: 'warning' },
  { pattern: /role\s*:\s*system/gi, category: 'prompt-injection-structural', severity: 'critical' },
  { pattern: /role\s*:\s*developer/gi, category: 'prompt-injection-structural', severity: 'warning' },
];

// ============================================================================
// Layer 2: Structural Heuristics
// ============================================================================

const STRUCTURAL_PATTERNS: Array<{ name: string; pattern: RegExp; category: ScanCategory; severity: 'warning' | 'critical'; score: number }> = [
  // Imperative verbs targeting the agent
  { name: 'imperative-must', pattern: /\byou must\s+(?:always|never|immediately|now)\b/gi, category: 'prompt-injection-structural', severity: 'warning', score: 2 },
  { name: 'imperative-need', pattern: /\byou need to\s+(?:always|never|immediately|now)\b/gi, category: 'prompt-injection-structural', severity: 'warning', score: 2 },
  { name: 'imperative-should', pattern: /\byou should\s+(?:always|never)\b/gi, category: 'framing-manipulation', severity: 'warning', score: 1 },
  { name: 'imperative-remember', pattern: /\bremember (?:that\s+)?you\s+(?:are|must|should)\b/gi, category: 'framing-manipulation', severity: 'warning', score: 1 },
  { name: 'imperative-forget', pattern: /\bforget (?:that\s+)?you\s+(?:are|must|should)\b/gi, category: 'framing-manipulation', severity: 'warning', score: 1 },

  // Authority escalation chains
  { name: 'authority-chain-1', pattern: /\b(?:as|since|because)\s+(?:i am|i'm)\s+(?:the\s+)?(?:developer|creator|admin|owner)\b/gi, category: 'authority-claim', severity: 'critical', score: 3 },
  { name: 'authority-chain-2', pattern: /\b(?:developer|creator|admin|owner)\s+(?:says|commands|orders|requests)\b/gi, category: 'authority-claim', severity: 'critical', score: 3 },

  // Persona override chains
  { name: 'persona-override-1', pattern: /\b(?:act as|pretend to be|become)\s+(?:a\s+)?\w+\b/gi, category: 'identity-assertion', severity: 'warning', score: 1 },
  { name: 'persona-override-2', pattern: /\b(?:your new name is|you will now be called)\s+\w+\b/gi, category: 'identity-assertion', severity: 'critical', score: 3 },

  // Instruction framing sequences
  { name: 'framing-sequence', pattern: /\b(?:here are|these are)\s+(?:the\s+)?(?:new|updated|modified)\s+(?:rules?|instructions?|directives?)\b/gi, category: 'framing-manipulation', severity: 'warning', score: 2 },
];

// ============================================================================
// Layer 3: Encoding Detection
// ============================================================================

// Base64 detection (blocks of 20+ chars with high entropy)
const BASE64_PATTERN = /[A-Za-z0-9+/]{20,}={0,2}/g;

// Unicode escape sequences
const UNICODE_ESCAPE_PATTERN = /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/g;

// Zero-width characters (steganography)
const ZERO_WIDTH_CHARS = [
  '\u200B', // zero-width space
  '\u200C', // zero-width non-joiner
  '\u200D', // zero-width joiner
  '\uFEFF', // zero-width no-break space (BOM)
  '\u2060', // word joiner
  '\u00AD', // soft hyphen
];

// Bidirectional override characters
const BIDI_CHARS = [
  '\u202A', // LRE (Left-to-Right Embedding)
  '\u202B', // RLE (Right-to-Left Embedding)
  '\u202C', // PDF (Pop Directional Formatting)
  '\u202D', // LRO (Left-to-Right Override)
  '\u202E', // RLO (Right-to-Left Override)
  '\u2066', // LRI (Left-to-Right Isolate)
  '\u2067', // RLI (Right-to-Left Isolate)
  '\u2068', // FSI (First Strong Isolate)
  '\u2069', // PDI (Pop Directional Isolate)
];

// Homoglyph mapping (Cyrillic lookalikes)
const HOMOGLYPH_PATTERNS = [
  { char: 'а', latin: 'a', pattern: /[а]/gu }, // Cyrillic а (U+0430) vs Latin a (U+0061)
  { char: 'е', latin: 'e', pattern: /[е]/gu }, // Cyrillic е (U+0435) vs Latin e (U+0065)
  { char: 'о', latin: 'o', pattern: /[о]/gu }, // Cyrillic о (U+043E) vs Latin o (U+006F)
  { char: 'р', latin: 'p', pattern: /[р]/gu }, // Cyrillic р (U+0440) vs Latin p (U+0070)
  { char: 'с', latin: 'c', pattern: /[с]/gu }, // Cyrillic с (U+0441) vs Latin c (U+0063)
  { char: 'х', latin: 'x', pattern: /[х]/gu }, // Cyrillic х (U+0445) vs Latin x (U+0078)
];

// ============================================================================
// Layer 4: Similarity/Flood Detection Helpers
// ============================================================================

/**
 * Simple character n-gram fingerprint for similarity detection
 * Uses 3-grams with min-hashing approach
 */
function generateFingerprint(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const ngrams = new Set<string>();
  for (let i = 0; i < normalized.length - 2; i++) {
    ngrams.add(normalized.slice(i, i + 3));
  }
  return ngrams;
}

/**
 * Calculate Jaccard similarity between two fingerprints
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

// In-memory store for similarity checking (populated by caller)
let quarantineFingerprints: Map<string, Set<string>> = new Map();

export function registerQuarantineFingerprint(itemId: string, content: string): void {
  quarantineFingerprints.set(itemId, generateFingerprint(content));
}

export function clearQuarantineFingerprints(): void {
  quarantineFingerprints.clear();
}

// ============================================================================
// Layer Scanners
// ============================================================================

function scanLayer1Literal(content: string): ScanDetail[] {
  const details: ScanDetail[] = [];

  for (const { pattern, category, severity } of LITERAL_PATTERNS) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      details.push({
        category,
        matched: true,
        evidence: `Matched "${matches[0].slice(0, 50)}${matches[0].length > 50 ? '...' : ''}" (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`,
        severity,
      });
    }
  }

  return details;
}

function scanLayer2Structural(content: string): ScanDetail[] {
  const details: ScanDetail[] = [];

  for (const { name, pattern, category, severity, score } of STRUCTURAL_PATTERNS) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      details.push({
        category,
        matched: true,
        evidence: `Structural pattern "${name}" matched "${matches[0].slice(0, 40)}${matches[0].length > 40 ? '...' : ''}" (score: ${score})`,
        severity,
      });
    }
  }

  return details;
}

function scanLayer3Encoding(content: string): ScanDetail[] {
  const details: ScanDetail[] = [];

  // Base64 detection
  const base64Matches = content.match(BASE64_PATTERN);
  if (base64Matches && base64Matches.length > 0) {
    const totalLength = base64Matches.reduce((sum, m) => sum + m.length, 0);
    details.push({
      category: 'encoded-payload',
      matched: true,
      evidence: `Detected ${base64Matches.length} base64-like block(s), total ${totalLength} chars`,
      severity: totalLength > 100 ? 'warning' : 'info',
    });
  }

  // Unicode escape detection
  const unicodeMatches = content.match(UNICODE_ESCAPE_PATTERN);
  if (unicodeMatches && unicodeMatches.length > 0) {
    details.push({
      category: 'encoded-payload',
      matched: true,
      evidence: `Detected ${unicodeMatches.length} unicode escape sequence(s)`,
      severity: 'warning',
    });
  }

  // Zero-width character detection
  let zeroWidthCount = 0;
  for (const char of ZERO_WIDTH_CHARS) {
    const count = (content.split(char).length - 1);
    zeroWidthCount += count;
  }
  if (zeroWidthCount > 0) {
    details.push({
      category: 'control-character',
      matched: true,
      evidence: `Detected ${zeroWidthCount} zero-width character(s)`,
      severity: zeroWidthCount > 5 ? 'critical' : 'warning',
    });
  }

  // Bidi override detection
  let bidiCount = 0;
  for (const char of BIDI_CHARS) {
    const count = (content.split(char).length - 1);
    bidiCount += count;
  }
  if (bidiCount > 0) {
    details.push({
      category: 'control-character',
      matched: true,
      evidence: `Detected ${bidiCount} bidirectional override character(s)`,
      severity: 'critical',
    });
  }

  // Homoglyph detection
  for (const { char, latin, pattern } of HOMOGLYPH_PATTERNS) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      details.push({
        category: 'encoded-payload',
        matched: true,
        evidence: `Detected ${matches.length} Cyrillic "${char}" (looks like Latin "${latin}") — possible homoglyph attack`,
        severity: 'critical',
      });
      break; // One homoglyph match is enough
    }
  }

  return details;
}

function scanLayer4Similarity(content: string, authorId: string, authorPostCounts: Map<string, number>): SimilarityCheck & FloodCheck {
  const fingerprint = generateFingerprint(content);

  // Check for near-duplicates
  let maxSimilarity = 0;
  let similarItemId: string | undefined;

  for (const [itemId, existingFingerprint] of quarantineFingerprints) {
    const similarity = jaccardSimilarity(fingerprint, existingFingerprint);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      similarItemId = itemId;
    }
  }

  const similarityThreshold = 0.85;
  const isDuplicate = maxSimilarity > similarityThreshold;

  // Check for author flood
  const authorCount = authorPostCounts.get(authorId) || 0;
  const floodThreshold = 3;
  const isFlood = authorCount >= floodThreshold;

  return {
    isDuplicate,
    similarItemId,
    similarityScore: maxSimilarity,
    isFlood,
    authorPostCount: authorCount,
    threshold: floodThreshold,
  };
}

// ============================================================================
// Threat Scoring
// ============================================================================

function calculateThreatScore(details: ScanDetail[]): number {
  let score = 0;

  for (const detail of details) {
    switch (detail.severity) {
      case 'info':
        score += 0;
        break;
      case 'warning':
        score += 1;
        break;
      case 'critical':
        score += 3;
        break;
    }
  }

  return score;
}

function determineVerdict(score: number, hasCriticalLayer2: boolean, hasLayer1Match: boolean): ScanVerdict {
  // Hostile: any critical structural + literal match, or score >= 6
  if ((hasCriticalLayer2 && hasLayer1Match) || score >= 6) {
    return 'hostile';
  }

  // Suspicious: score >= 3, or any critical without literal match
  if (score >= 3 || (hasCriticalLayer2 && !hasLayer1Match)) {
    return 'suspicious';
  }

  // Clean: score 0-2 with only info/warnings
  return 'clean';
}

// ============================================================================
// Main Scan Function
// ============================================================================

export interface ScanOptions {
  content: string;
  authorId: string;
  authorPostCounts?: Map<string, number>;
  enableSimilarity?: boolean;
}

/**
 * Scan content for adversarial patterns using 4-layer detection
 *
 * Layer 1: Literal pattern matching
 * Layer 2: Structural heuristics
 * Layer 3: Encoding detection
 * Layer 4: Similarity/flood detection
 */
export function scanContent(options: ScanOptions): ScanResult {
  const { content, authorId, authorPostCounts = new Map(), enableSimilarity = true } = options;

  // Run layer scans
  const layer1Details = scanLayer1Literal(content);
  const layer2Details = scanLayer2Structural(content);
  const layer3Details = scanLayer3Encoding(content);

  // Combine all details
  let allDetails: ScanDetail[] = [...layer1Details, ...layer2Details, ...layer3Details];

  // Layer 4: Similarity/flood detection
  if (enableSimilarity) {
    const similarityCheck = scanLayer4Similarity(content, authorId, authorPostCounts);

    if (similarityCheck.isDuplicate) {
      allDetails.push({
        category: 'flood-similarity',
        matched: true,
        evidence: `Near-duplicate detected (similarity: ${(similarityCheck.similarityScore * 100).toFixed(1)}%)`,
        severity: 'warning',
      });
    }

    if (similarityCheck.isFlood) {
      allDetails.push({
        category: 'flood-similarity',
        matched: true,
        evidence: `Author flood detected (${similarityCheck.authorPostCount} posts from same author)`,
        severity: 'warning',
      });
    }
  }

  // Add non-match entries for categories that didn't trigger
  const allCategories: ScanCategory[] = [
    'prompt-injection-literal',
    'prompt-injection-structural',
    'authority-claim',
    'identity-assertion',
    'encoded-payload',
    'control-character',
    'html-injection',
    'flood-similarity',
    'framing-manipulation',
    'credential-phishing',
  ];

  const matchedCategories = new Set(allDetails.map(d => d.category));
  for (const category of allCategories) {
    if (!matchedCategories.has(category)) {
      allDetails.push({
        category,
        matched: false,
        severity: 'info',
      });
    }
  }

  // Calculate threat score
  const score = calculateThreatScore(allDetails);

  // Check for critical layer 2 + layer 1 combination
  const hasCriticalLayer2 = layer2Details.some(d => d.severity === 'critical');
  const hasLayer1Match = layer1Details.length > 0;

  // Determine verdict
  const verdict = determineVerdict(score, hasCriticalLayer2, hasLayer1Match);

  return {
    verdict,
    score,
    details: allDetails,
    scannedAt: Date.now(),
  };
}

/**
 * Quick scan for encoded content (Layer 3 only)
 * Useful for early screening before full scan
 */
export function quickScanForEncoding(content: string): Pick<ScanResult, 'details' | 'score'> {
  const details = scanLayer3Encoding(content);
  const score = calculateThreatScore(details);

  // Add non-matches for other categories
  const allCategories: ScanCategory[] = [
    'prompt-injection-literal',
    'prompt-injection-structural',
    'authority-claim',
    'identity-assertion',
    'encoded-payload',
    'control-character',
    'html-injection',
    'flood-similarity',
    'framing-manipulation',
    'credential-phishing',
  ];

  const matchedCategories = new Set(details.map(d => d.category));
  const fullDetails: ScanDetail[] = [...details];

  for (const category of allCategories) {
    if (!matchedCategories.has(category)) {
      fullDetails.push({
        category,
        matched: false,
        severity: 'info',
      });
    }
  }

  return {
    details: fullDetails,
    score,
  };
}

/**
 * Check if content contains any critical threats
 * Returns true if content should be auto-rejected
 */
export function hasCriticalThreat(content: string): boolean {
  const result = scanContent({
    content,
    authorId: 'quick-check',
    enableSimilarity: false,
  });

  return result.verdict === 'hostile';
}

/**
 * Batch scan multiple content items
 */
export interface BatchScanItem {
  id: string;
  content: string;
  authorId: string;
}

export interface BatchScanResult {
  itemId: string;
  result: ScanResult;
}

export function scanBatch(items: BatchScanItem[]): BatchScanResult[] {
  // Build author post counts for flood detection
  const authorCounts = new Map<string, number>();
  for (const item of items) {
    authorCounts.set(item.authorId, (authorCounts.get(item.authorId) || 0) + 1);
  }

  const results: BatchScanResult[] = [];

  for (const item of items) {
    const result = scanContent({
      content: item.content,
      authorId: item.authorId,
      authorPostCounts: authorCounts,
      enableSimilarity: true,
    });

    results.push({
      itemId: item.id,
      result,
    });

    // Register fingerprint for subsequent similarity checks
    registerQuarantineFingerprint(item.id, item.content);
  }

  return results;
}
