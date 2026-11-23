// Witnessed rewrite, 23 Nov 2026: this file's final content was last touched by the recorded agent session.
// Seeded random numbers (mulberry32) so the same seed always builds the same city,
// the same traffic and the same screenshot scenes.

export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return random;
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** One element of an array, picked with the seeded stream. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

/** An integer in [min, max]. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
