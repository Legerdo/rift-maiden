// Zone timelines. The wave director reads these; add a zone by adding data.

import type { EnemyId, EliteMod } from './enemies';

export type BgTheme = 'neon' | 'lab' | 'rift';
export type BossId = 'warden' | 'orbis';
export type HazardId = 'none' | 'debris' | 'rifts';

export interface SpawnPhase {
  /** Zone time (s) when this phase starts. */
  t: number;
  /** Spawn groups per second. */
  rate: number;
  maxAlive: number;
  weights: Partial<Record<EnemyId, number>>;
}

export type ZoneEvent =
  | { t: number; type: 'swarm'; enemy: EnemyId; count: number; side: 'left' | 'right' | 'both' | 'sky' }
  | { t: number; type: 'elite'; enemy: EnemyId; mod?: EliteMod }
  | { t: number; type: 'hint'; key: string };

export interface ZoneDef {
  id: string;
  theme: BgTheme;
  music: number;
  duration: number;
  hpMul: number;
  xpMul: number;
  phases: SpawnPhase[];
  events: ZoneEvent[];
  hazard: HazardId;
  boss?: BossId;
  finale?: 'elite_rush';
}

export const ZONES: ZoneDef[] = [
  {
    id: 'neon',
    theme: 'neon',
    music: 0,
    duration: 165,
    hpMul: 1.3,
    xpMul: 1,
    hazard: 'none',
    boss: 'warden',
    phases: [
      { t: 0, rate: 0.75, maxAlive: 8, weights: { crawler: 1 } },
      { t: 16, rate: 1.0, maxAlive: 13, weights: { crawler: 1, gunner: 0.4 } },
      { t: 38, rate: 1.25, maxAlive: 17, weights: { crawler: 1, gunner: 0.5, charger: 0.35 } },
      { t: 72, rate: 1.5, maxAlive: 22, weights: { crawler: 1, gunner: 0.55, charger: 0.45, flyer: 0.4 } },
      { t: 112, rate: 1.85, maxAlive: 26, weights: { crawler: 1, gunner: 0.6, charger: 0.55, flyer: 0.55 } },
    ],
    events: [
      { t: 9, type: 'swarm', enemy: 'crawler', count: 7, side: 'both' },
      { t: 30, type: 'hint', key: 'hint.weakpoint' },
      { t: 38, type: 'hint', key: 'hint.charger' },
      { t: 45, type: 'elite', enemy: 'charger' },
      { t: 78, type: 'swarm', enemy: 'flyer', count: 5, side: 'sky' },
      { t: 95, type: 'elite', enemy: 'gunner', mod: 'swift' },
      { t: 120, type: 'swarm', enemy: 'charger', count: 3, side: 'both' },
      { t: 135, type: 'elite', enemy: 'charger', mod: 'splitter' },
      { t: 148, type: 'swarm', enemy: 'crawler', count: 12, side: 'both' },
    ],
  },
  {
    id: 'lab',
    theme: 'lab',
    music: 1,
    duration: 170,
    hpMul: 2.8,
    xpMul: 1.15,
    hazard: 'debris',
    finale: 'elite_rush',
    phases: [
      { t: 0, rate: 1.8, maxAlive: 23, weights: { crawler: 0.7, flyer: 0.65, watcher: 0.4, gunner: 0.4 } },
      { t: 30, rate: 2.1, maxAlive: 27, weights: { crawler: 0.7, flyer: 0.6, watcher: 0.45, gunner: 0.4, shield: 0.35 } },
      { t: 65, rate: 2.35, maxAlive: 31, weights: { crawler: 0.7, flyer: 0.6, watcher: 0.45, gunner: 0.4, shield: 0.4, summoner: 0.25 } },
      { t: 115, rate: 2.75, maxAlive: 36, weights: { crawler: 0.8, flyer: 0.7, watcher: 0.5, gunner: 0.45, shield: 0.45, summoner: 0.3, charger: 0.35 } },
    ],
    events: [
      { t: 6, type: 'hint', key: 'hint.debris' },
      { t: 30, type: 'hint', key: 'hint.shield' },
      { t: 50, type: 'elite', enemy: 'watcher', mod: 'volatile' },
      { t: 65, type: 'hint', key: 'hint.summoner' },
      { t: 80, type: 'swarm', enemy: 'flyer', count: 7, side: 'sky' },
      { t: 100, type: 'elite', enemy: 'shield', mod: 'warded' },
      { t: 135, type: 'swarm', enemy: 'crawler', count: 12, side: 'both' },
      { t: 150, type: 'elite', enemy: 'summoner', mod: 'swift' },
    ],
  },
  {
    id: 'rift',
    theme: 'rift',
    music: 2,
    duration: 170,
    hpMul: 4.4,
    xpMul: 1.45,
    hazard: 'rifts',
    boss: 'orbis',
    phases: [
      { t: 0, rate: 2.4, maxAlive: 32, weights: { crawler: 0.8, flyer: 0.6, gunner: 0.45, exploder: 0.5, charger: 0.4, watcher: 0.35 } },
      { t: 55, rate: 3.0, maxAlive: 38, weights: { crawler: 0.8, flyer: 0.6, gunner: 0.45, exploder: 0.6, charger: 0.45, watcher: 0.4, shield: 0.35, summoner: 0.25 } },
      { t: 115, rate: 3.55, maxAlive: 44, weights: { crawler: 0.9, flyer: 0.7, gunner: 0.5, exploder: 0.7, charger: 0.5, watcher: 0.45, shield: 0.4, summoner: 0.3 } },
    ],
    events: [
      { t: 6, type: 'hint', key: 'hint.rifts' },
      { t: 20, type: 'hint', key: 'hint.exploder' },
      { t: 45, type: 'elite', enemy: 'exploder', mod: 'volatile' },
      { t: 75, type: 'swarm', enemy: 'exploder', count: 6, side: 'both' },
      { t: 95, type: 'elite', enemy: 'charger', mod: 'splitter' },
      { t: 130, type: 'elite', enemy: 'watcher', mod: 'warded' },
      { t: 150, type: 'swarm', enemy: 'flyer', count: 10, side: 'sky' },
    ],
  },
];

/** Difficulty scaling for "rift depth" (post-clear difficulty tiers). */
export function depthScale(depth: number) {
  return {
    hp: 1 + 0.35 * depth,
    rate: 1 + 0.12 * depth,
    dmgBonus: depth >= 3 ? 1 : 0,
    shards: 1 + 0.5 * depth,
    eliteChance: 0.02 * depth,
  };
}

export const MAX_DEPTH = 5;
