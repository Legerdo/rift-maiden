// Tunable numbers that are not tied to a specific weapon / enemy.

export const PLAYER = {
  maxHp: 5,
  speed: 152,
  accelGround: 2600,
  decelGround: 3200,
  accelAir: 1700,
  decelAir: 900,
  gravity: 1080,
  jumpVel: 335,
  jumpCutMul: 0.45,
  coyote: 0.09,
  jumpBuffer: 0.12,
  dashSpeed: 560,
  dashTime: 0.13,
  dashIframes: 0.2,
  dashCooldown: 0.75,
  hurtIframes: 1.05,
  hitboxHW: 6,
  hitboxHH: 19,
  magnetRadius: 60,
  /** Crystals left on the floor drift to the player after this long. */
  autoCollectDelay: 7,
  pickupRadius: 12,
};

/** XP needed to go from level `lv` to `lv + 1`. */
export function xpForLevel(lv: number): number {
  const n = Math.max(0, lv - 1);
  // Quick first few levels, then a steep climb: zone 1 should end around
  // Lv 12–13 so the normal pool (and the Lv 12 awakening) lasts the whole run.
  const mid = n > 4 ? 0.8 * (n - 4) * (n - 4) : 0;
  const late = n > 10 ? 4 * (n - 10) * (n - 10) : 0;
  return Math.floor(5 + 4 * n + 1.2 * n * n + mid + late);
}

/**
 * Per-projectile damage when firing `n` bullets / rail lines at once, so
 * multishot scales area coverage more than single-target damage:
 * 1 → 100%, 2 → 80%, 3 → 73%, 4 → 70% (total 1x / 1.6x / 2.2x / 2.8x).
 */
export function multishotShare(n: number): number {
  return n <= 1 ? 1 : 0.6 + 0.4 / n;
}

/** Elites drop an upgrade core only if killed within this many seconds. */
export const ELITE_QUICK_KILL = 12;

export const COMBO = {
  window: 3.2,
  decayStep: 0.5,
  decayFrac: 0.25,
  // XP bonus from combo: +0.33% per kill in the chain, capped at x1.5
  maxBonus: 0.5,
  bonusPer: 0.0033,
  tiers: [
    { at: 15, key: 'combo.t1', color: 0x8fd8ff },
    { at: 40, key: 'combo.t2', color: 0x9cff8a },
    { at: 80, key: 'combo.t3', color: 0xffcf4a },
    { at: 150, key: 'combo.t4', color: 0xff5c8a },
  ],
};

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(COMBO.maxBonus, combo * COMBO.bonusPer);
}

export function comboTier(combo: number): number {
  let t = -1;
  for (let i = 0; i < COMBO.tiers.length; i++) if (combo >= COMBO.tiers[i].at) t = i;
  return t;
}

export const PERFECT_DODGE = {
  slowScale: 0.3,
  slowTime: 0.32,
  buffTime: 3,
  buffDmg: 0.25,
  adrenalineDmg: 0.6,
  adrenalineTime: 4,
};

/** End-of-run shard bonus. */
export function runShardBonus(kills: number, zonesCleared: number, bosses: number, seconds: number, victory: boolean): number {
  // A small flat bonus so even a short first run buys something in the workshop.
  return 5 + Math.floor(kills / 15) + zonesCleared * 8 + bosses * 18 + Math.floor(seconds / 60) * 2 + (victory ? 40 : 0);
}
