/** Small deterministic PRNG suitable for reproducible synthetic fixtures. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function pick<T>(random: () => number, values: readonly T[]): T {
  return values[randomInt(random, 0, values.length - 1)];
}

export function shuffle<T>(random: () => number, input: readonly T[]): T[] {
  const values = [...input];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = randomInt(random, 0, index);
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}
