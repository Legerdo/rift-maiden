// The player's in-run build: upgrade levels and every stat derived from them.
// Pure logic (no Phaser) so it can be unit tested.

import type { UpgradeId } from '../data/upgrades';
import { UPGRADE_MAP } from '../data/upgrades';
import type { WeaponDef } from '../data/weapons';

const pickLv = (arr: number[], lv: number) => arr[Math.max(0, Math.min(arr.length - 1, lv))];

export class Build {
  levels: Partial<Record<UpgradeId, number>> = {};
  /** Order in which upgrades were taken (for the result screen). */
  order: UpgradeId[] = [];

  constructor(public weapon: WeaponDef) {}

  lv(id: UpgradeId): number {
    return this.levels[id] ?? 0;
  }

  has(id: UpgradeId): boolean {
    return this.lv(id) > 0;
  }

  add(id: UpgradeId): number {
    const def = UPGRADE_MAP[id];
    const cur = this.lv(id);
    const next = def ? Math.min(def.maxLevel, cur + 1) : cur + 1;
    this.levels[id] = next;
    if (!this.order.includes(id)) this.order.push(id);
    return next;
  }

  get totalPicks(): number {
    let n = 0;
    for (const v of Object.values(this.levels)) n += v ?? 0;
    return n;
  }

  // ---- projectile rules
  get pierce(): number {
    return this.weapon.pierce + this.lv('pierce') + (this.awakened && this.weapon.id === 'beam' ? 3 : 0);
  }
  get splitCount(): number {
    return pickLv([0, 2, 3], this.lv('split'));
  }
  get bounces(): number {
    return this.lv('ricochet');
  }
  get extraProjectiles(): number {
    return this.lv('multishot') * this.weapon.multishotAdd;
  }
  get critChance(): number {
    return this.weapon.critChance + 0.12 * this.lv('crit');
  }
  get critMul(): number {
    return pickLv([2, 2, 2.4, 2.8], this.lv('crit')) + 0.3 * this.lv('ov_crit');
  }
  /** Flat damage multiplier from 초월 cards and curses. */
  get dmgMul(): number {
    return (1 + 0.12 * this.lv('ov_power')) * (this.has('c_glass') ? 1.5 : 1);
  }
  /** Fire-rate multiplier (also speeds beam ticks). */
  get fireRateMul(): number {
    let m = 1 + 0.08 * this.lv('ov_rate');
    if (this.awakened && this.weapon.id === 'smg') m *= 1.25;
    return m;
  }
  get awakened(): boolean {
    return this.has('awaken');
  }
  get executeThreshold(): number {
    return pickLv([0, 0.12, 0.2], this.lv('execute'));
  }
  get bigShot(): number {
    return this.lv('big_shot');
  }
  get sentryMax(): number {
    return this.lv('sentry');
  }
  get sentryInterval(): number {
    return pickLv([0, 9, 6], this.lv('sentry'));
  }
  /** Spawn-rate multiplier the player opted into (curse). */
  get spawnMul(): number {
    return this.has('c_frenzy') ? 1.4 : 1;
  }
  /** XP / shard reward multiplier from curses. */
  get rewardMul(): number {
    return this.has('c_frenzy') ? 1.4 : 1;
  }
  get eliteBonusChance(): number {
    return this.has('c_hunter') ? 0.06 : 0;
  }
  get explosiveEvery(): number {
    return pickLv([0, 6, 4, 3], this.lv('explosive'));
  }
  get explosiveRadius(): number {
    return pickLv([0, 24, 30, 36], this.lv('explosive'));
  }
  get focusMax(): number {
    return pickLv([0, 0.5, 1.0], this.lv('focus'));
  }
  get pointblankMul(): number {
    return pickLv([0, 0.4, 0.8], this.lv('pointblank'));
  }
  get pointblankRange(): number {
    return pickLv([0, 80, 100], this.lv('pointblank'));
  }
  // ---- automation
  get drones(): number {
    return this.lv('drone') + (this.has('f_legion') ? 1 : 0);
  }
  get magnetMul(): number {
    return pickLv([1, 2.4, 3.2], this.lv('magnet'));
  }
  get magnetAuto(): boolean {
    return this.lv('magnet') >= 2;
  }
  get missileCount(): number {
    return pickLv([0, 1, 2, 3], this.lv('missile'));
  }
  get missileInterval(): number {
    return pickLv([0, 2.6, 2.6, 2.0], this.lv('missile'));
  }
  get orbitBlades(): number {
    return pickLv([0, 2, 3, 4], this.lv('orbit'));
  }
  get orbitSpeed(): number {
    return this.lv('orbit') >= 3 ? 4.2 : 3.2;
  }
  // ---- defence / mobility
  get barrierCooldown(): number {
    return pickLv([0, 14, 9], this.lv('barrier'));
  }
  get bonusHp(): number {
    return this.lv('vitality');
  }
  get dashCharges(): number {
    return this.has('phase_dash') ? 2 : 1;
  }
  get dashCdMul(): number {
    return (this.has('phase_dash') ? 0.75 : 1) * (1 - 0.06 * this.lv('ov_cd'));
  }
  get skillCdMul(): number {
    return pickLv([1, 0.8, 0.64], this.lv('skill_cd')) * (1 - 0.06 * this.lv('ov_cd'));
  }
  // ---- elements
  get chainTargets(): number {
    return pickLv([0, 2, 3, 4], this.lv('chain'));
  }
  get chainDmg(): number {
    return pickLv([0, 0.55, 0.75, 0.85], this.lv('chain'));
  }
  get chainFreeChance(): number {
    return this.lv('chain') >= 3 ? 0.15 : 0;
  }
  get frostStacks(): number {
    return pickLv([0, 6, 4], this.lv('frost'));
  }
  get freezeTime(): number {
    return pickLv([0, 1.5, 2.0], this.lv('frost'));
  }
  get corpseChance(): number {
    return pickLv([0, 0.4, 1], this.lv('corpse_blast'));
  }
  get corpseRadius(): number {
    return pickLv([0, 30, 40], this.lv('corpse_blast'));
  }
  get dashStrikeDmg(): number {
    return pickLv([0, 30, 55], this.lv('dash_strike'));
  }
  get dashStrikeMissiles(): number {
    return pickLv([0, 3, 5], this.lv('dash_strike'));
  }
}
