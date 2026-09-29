// Small RNG helpers. A seedable generator is used for procedural art so the
// generated textures are identical on every boot.

export class SeededRng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export function rand(a = 0, b = 1): number {
  return a + (b - a) * Math.random();
}

export function randInt(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randSign(): 1 | -1 {
  return Math.random() < 0.5 ? -1 : 1;
}

/** Weighted random pick. Entries with weight <= 0 are ignored. */
export function weightedPick<T>(entries: readonly { item: T; weight: number }[], rnd: () => number = Math.random): T | null {
  let total = 0;
  for (const e of entries) if (e.weight > 0) total += e.weight;
  if (total <= 0) return null;
  let r = rnd() * total;
  for (const e of entries) {
    if (e.weight <= 0) continue;
    r -= e.weight;
    if (r <= 0) return e.item;
  }
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].weight > 0) return entries[i].item;
  return null;
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
