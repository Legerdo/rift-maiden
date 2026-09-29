// Persistent save (localStorage). Every field is validated on load so a
// corrupted or hand-edited save can never prevent the game from starting.

import { SAVE_KEY } from './constants';

export interface SettingsData {
  master: number;
  music: number;
  sfx: number;
  /** 0 = off, 1 = light, 2 = normal */
  shake: number;
  damageNumbers: boolean;
  fullscreen: boolean;
  integerScale: boolean;
}

export interface StatsData {
  runs: number;
  kills: number;
  bestTime: number;
  bestCombo: number;
  bestLevel: number;
  bossesDefeated: number;
  clears: number;
  deepestZone: number;
  totalShards: number;
}

export interface SaveData {
  version: 1;
  shards: number;
  meta: Record<string, number>;
  weapon: string;
  skillQ: string;
  skillE: string;
  depth: number;
  maxDepth: number;
  tutorialDone: boolean;
  stats: StatsData;
  settings: SettingsData;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    shards: 0,
    meta: {},
    weapon: 'smg',
    skillQ: 'shockwave',
    skillE: 'overdrive',
    depth: 0,
    maxDepth: 0,
    tutorialDone: false,
    stats: {
      runs: 0,
      kills: 0,
      bestTime: 0,
      bestCombo: 0,
      bestLevel: 0,
      bossesDefeated: 0,
      clears: 0,
      deepestZone: 0,
      totalShards: 0,
    },
    settings: {
      master: 0.8,
      music: 0.6,
      sfx: 0.8,
      shake: 2,
      damageNumbers: true,
      fullscreen: false,
      integerScale: true,
    },
  };
}

function num(v: unknown, def: number, lo: number, hi: number, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const c = Math.min(hi, Math.max(lo, v));
  return integer ? Math.floor(c) : c;
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

function str(v: unknown, def: string, allowed?: readonly string[]): string {
  if (typeof v !== 'string') return def;
  if (allowed && !allowed.includes(v)) return def;
  return v;
}

export interface SanitizeOptions {
  metaIds: readonly string[];
  metaMax: Record<string, number>;
  weapons: readonly string[];
  skills: readonly string[];
  maxDepth: number;
}

/** Turn arbitrary parsed JSON into a valid SaveData. Never throws. */
export function sanitizeSave(raw: unknown, opt: SanitizeOptions): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  d.shards = num(r.shards, 0, 0, 1e9, true);

  if (r.meta && typeof r.meta === 'object') {
    for (const [k, v] of Object.entries(r.meta as Record<string, unknown>)) {
      if (!opt.metaIds.includes(k)) continue;
      const lv = num(v, 0, 0, opt.metaMax[k] ?? 1, true);
      if (lv > 0) d.meta[k] = lv;
    }
  }
  d.weapon = str(r.weapon, d.weapon, opt.weapons);
  d.skillQ = str(r.skillQ, d.skillQ, opt.skills);
  d.skillE = str(r.skillE, d.skillE, opt.skills);
  if (d.skillQ === d.skillE) {
    d.skillQ = 'shockwave';
    d.skillE = 'overdrive';
  }
  d.maxDepth = num(r.maxDepth, 0, 0, opt.maxDepth, true);
  d.depth = num(r.depth, 0, 0, d.maxDepth, true);
  d.tutorialDone = bool(r.tutorialDone, false);

  const s = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  d.stats.runs = num(s.runs, 0, 0, 1e9, true);
  d.stats.kills = num(s.kills, 0, 0, 1e12, true);
  d.stats.bestTime = num(s.bestTime, 0, 0, 1e7);
  d.stats.bestCombo = num(s.bestCombo, 0, 0, 1e9, true);
  d.stats.bestLevel = num(s.bestLevel, 0, 0, 1e6, true);
  d.stats.bossesDefeated = num(s.bossesDefeated, 0, 0, 1e9, true);
  d.stats.clears = num(s.clears, 0, 0, 1e9, true);
  d.stats.deepestZone = num(s.deepestZone, 0, 0, 99, true);
  d.stats.totalShards = num(s.totalShards, 0, 0, 1e12, true);

  const st = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  d.settings.master = num(st.master, d.settings.master, 0, 1);
  d.settings.music = num(st.music, d.settings.music, 0, 1);
  d.settings.sfx = num(st.sfx, d.settings.sfx, 0, 1);
  d.settings.shake = num(st.shake, d.settings.shake, 0, 2, true);
  d.settings.damageNumbers = bool(st.damageNumbers, true);
  d.settings.fullscreen = bool(st.fullscreen, false);
  d.settings.integerScale = bool(st.integerScale, true);
  return d;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function resolveStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__rm_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* storage disabled – fall back to memory */
  }
  return new MemoryStorage();
}

export class SaveStore {
  data: SaveData;
  private storage: StorageLike;
  private opt: SanitizeOptions;
  /** True if the stored save was unreadable and got reset. */
  recovered = false;

  constructor(opt: SanitizeOptions, storage?: StorageLike) {
    this.opt = opt;
    this.storage = storage ?? resolveStorage();
    this.data = this.load();
  }

  private load(): SaveData {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(SAVE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return defaultSave();
    try {
      return sanitizeSave(JSON.parse(raw), this.opt);
    } catch {
      this.recovered = true;
      try {
        this.storage.setItem(SAVE_KEY + '.corrupt', raw);
      } catch {
        /* ignore */
      }
      return defaultSave();
    }
  }

  save(): void {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* quota / disabled storage – keep playing */
    }
  }

  reset(): void {
    const settings = { ...this.data.settings };
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }

  reload(): void {
    this.data = this.load();
  }
}
