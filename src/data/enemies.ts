// Enemy archetypes. Every archetype has a distinct behaviour (see game/enemies.ts)
// so the player has to answer each one differently.

export type EnemyId = 'crawler' | 'charger' | 'gunner' | 'flyer' | 'watcher' | 'shield' | 'summoner' | 'exploder' | 'rift' | 'capsule';

export interface EnemyDef {
  id: EnemyId;
  hp: number;
  speed: number;
  contactDmg: number;
  xp: number;
  shardChance: number;
  /** Hitbox half extents. */
  hw: number;
  hh: number;
  /** Visual offset of the sprite origin (bottom-centre) relative to hitbox bottom. */
  flying: boolean;
  /** 0..1, how much knockback is resisted. */
  mass: number;
  /** Top fraction of the hitbox that counts as a weak point (0 = none). */
  weakTop: number;
  /** Priority for tactical drones / missiles. */
  threat: number;
  tex: string;
  debris: number[];
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  crawler: {
    id: 'crawler', hp: 14, speed: 58, contactDmg: 1, xp: 1, shardChance: 0.02,
    hw: 10, hh: 7, flying: false, mass: 0.1, weakTop: 0, threat: 1,
    tex: 'en_crawler', debris: [0x5a2e84, 0x8a4ab8, 0xff3ca0],
  },
  charger: {
    id: 'charger', hp: 46, speed: 42, contactDmg: 1, xp: 3, shardChance: 0.04,
    hw: 15, hh: 11, flying: false, mass: 0.55, weakTop: 0, threat: 3,
    tex: 'en_charger', debris: [0x4a2a60, 0x7a4a98, 0xff6a3c],
  },
  gunner: {
    id: 'gunner', hp: 28, speed: 44, contactDmg: 1, xp: 2, shardChance: 0.03,
    hw: 8, hh: 16, flying: false, mass: 0.3, weakTop: 0.28, threat: 4,
    tex: 'en_gunner', debris: [0x3a2450, 0x6a4a88, 0xff3ca0],
  },
  flyer: {
    id: 'flyer', hp: 16, speed: 92, contactDmg: 1, xp: 2, shardChance: 0.03,
    hw: 10, hh: 7, flying: true, mass: 0.15, weakTop: 0, threat: 2,
    tex: 'en_flyer', debris: [0x3c5a3a, 0x8ad05a, 0xff3ca0],
  },
  watcher: {
    id: 'watcher', hp: 34, speed: 40, contactDmg: 1, xp: 3, shardChance: 0.04,
    hw: 10, hh: 10, flying: true, mass: 0.4, weakTop: 0, threat: 4,
    tex: 'en_watcher', debris: [0xe8d8f0, 0x8a4ab8, 0xff3c5c],
  },
  shield: {
    id: 'shield', hp: 72, speed: 32, contactDmg: 1, xp: 4, shardChance: 0.06,
    hw: 13, hh: 18, flying: false, mass: 0.8, weakTop: 0, threat: 3,
    tex: 'en_shield', debris: [0x505a78, 0x8890b0, 0xff3ca0],
  },
  summoner: {
    id: 'summoner', hp: 56, speed: 26, contactDmg: 1, xp: 5, shardChance: 0.08,
    hw: 9, hh: 18, flying: false, mass: 0.5, weakTop: 0.25, threat: 6,
    tex: 'en_summoner', debris: [0x2a1a40, 0xb070ff, 0xffe0ff],
  },
  exploder: {
    id: 'exploder', hp: 12, speed: 88, contactDmg: 2, xp: 1, shardChance: 0.02,
    hw: 8, hh: 8, flying: false, mass: 0.2, weakTop: 0, threat: 5,
    tex: 'en_exploder', debris: [0xff8a3c, 0xffe060, 0xff3c5c],
  },
  // Rift event reward: shoot it open for healing, shards and crystals.
  capsule: {
    id: 'capsule', hp: 34, speed: 0, contactDmg: 0, xp: 12, shardChance: 0,
    hw: 9, hh: 10, flying: false, mass: 1, weakTop: 0, threat: 0,
    tex: 'en_capsule', debris: [0xb4bcd8, 0x6ef4ff, 0xffffff],
  },
  // Zone 3 hazard: a tear in space that keeps spawning enemies until shot closed.
  rift: {
    id: 'rift', hp: 60, speed: 0, contactDmg: 0, xp: 6, shardChance: 1,
    hw: 9, hh: 19, flying: true, mass: 1, weakTop: 0, threat: 7,
    tex: 'rift_tear', debris: [0xff3ca0, 0x3a1850, 0xffa0d8],
  },
};

export const SPAWNABLE: EnemyId[] = ['crawler', 'charger', 'gunner', 'flyer', 'watcher', 'shield', 'summoner', 'exploder'];

export type EliteMod = 'swift' | 'splitter' | 'warded' | 'volatile';
export const ELITE_MODS: EliteMod[] = ['swift', 'splitter', 'warded', 'volatile'];

export const ELITE = {
  hpMul: 5.5,
  xpMul: 10,
  shards: 3,
};
