/**
 * Deterministic seeded PRNG (mulberry32) plus small helpers used throughout
 * the demo dataset generator. Never use Math.random(), Date.now(), or
 * unseeded UUIDs in the seed module — every call must go through an
 * instance of Rng so that `npm run seed` is byte-identical across runs.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force a 32-bit unsigned integer state.
    this.state = seed >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** Returns true with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Picks a random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Fisher-Yates shuffle, returns a new array, does not mutate input. */
  shuffle<T>(arr: readonly T[]): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
