/**
 * Seeded PRNG using xorshift32 algorithm.
 * Seed string is hashed to 32-bit via FNV-1a.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: string) {
    this.state = SeededRNG.fnv1aHash(seed);
  }

  private static fnv1aHash(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return x >>> 0;
  }

  nextInt(n: number): number {
    return this.next() % n;
  }
}
