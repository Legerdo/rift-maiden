// In-run upgrade definitions. Player-facing text lives in localization/ko.ts
// (keyed by id). Most upgrades change rules, not just numbers.
//
// Card families:
//  common / rare  – normal rule-changing upgrades
//  legendary      – fusions, only when both halves are owned
//  awaken         – one-time weapon awakening, guaranteed around level 12
//  curse          – risk/reward pacts, occasionally offered
//  overflow       – "초월": endless small boosts once the pool runs dry,
//                   so a level-up is never an empty choice

import type { WeaponId } from './weapons';

export type Rarity = 'common' | 'rare' | 'legendary' | 'awaken' | 'curse' | 'overflow';

export type UpgradeId =
  | 'pierce'
  | 'split'
  | 'ricochet'
  | 'multishot'
  | 'crit'
  | 'explosive'
  | 'focus'
  | 'overheat'
  | 'pointblank'
  | 'drone'
  | 'magnet'
  | 'barrier'
  | 'vitality'
  | 'phase_dash'
  | 'combo_heal'
  | 'skill_cd'
  | 'skill_echo'
  | 'smg_tracer'
  | 'sg_recoil'
  | 'rail_super'
  | 'beam_prism'
  | 'execute'
  | 'big_shot'
  | 'sentry'
  | 'retaliate'
  | 'sk_shock_plus'
  | 'sk_od_plus'
  | 'sk_orb_plus'
  | 'sk_sing_plus'
  | 'awaken'
  | 'chain'
  | 'missile'
  | 'frost'
  | 'corpse_blast'
  | 'orbit'
  | 'drone_ai'
  | 'drone_overdrive'
  | 'dash_strike'
  | 'adrenaline'
  | 'f_storm'
  | 'f_legion'
  | 'f_zero'
  | 'f_reaction'
  | 'f_phantom'
  | 'c_glass'
  | 'c_frenzy'
  | 'c_hunter'
  | 'ov_power'
  | 'ov_rate'
  | 'ov_crit'
  | 'ov_life'
  | 'ov_cd';

export interface UpgradeDef {
  id: UpgradeId;
  rarity: Rarity;
  maxLevel: number;
  icon: string;
  tags: string[];
  /** Only offered for these weapons. */
  weapons?: WeaponId[];
  /** Never offered for these weapons. */
  excludeWeapons?: WeaponId[];
  /** Only offered when this skill is equipped. */
  skill?: string;
  /** Minimum player level before this can be offered. */
  minLevel?: number;
  /** Meta module that must be unlocked for this to enter the pool. */
  pool?: string;
  requires?: { id: UpgradeId; level: number }[];
  /** Related upgrades, shown on the card as synergy hints. */
  synergy: UpgradeId[];
  fusion?: boolean;
}

export const UPGRADES: UpgradeDef[] = [
  // ---- Projectile rules ----
  { id: 'pierce', rarity: 'common', maxLevel: 3, icon: 'pierce', tags: ['projectile'], excludeWeapons: ['rail'], synergy: ['split', 'ricochet'] },
  { id: 'split', rarity: 'rare', maxLevel: 2, icon: 'split', tags: ['projectile'], excludeWeapons: ['beam'], synergy: ['pierce', 'chain', 'f_storm'] },
  { id: 'ricochet', rarity: 'common', maxLevel: 2, icon: 'ricochet', tags: ['projectile'], excludeWeapons: ['rail', 'beam'], synergy: ['pierce', 'split'] },
  { id: 'multishot', rarity: 'rare', maxLevel: 3, icon: 'multishot', tags: ['projectile'], excludeWeapons: ['beam'], synergy: ['split', 'explosive'] },
  { id: 'crit', rarity: 'common', maxLevel: 3, icon: 'crit', tags: ['crit'], synergy: ['chain', 'f_zero', 'execute'] },
  { id: 'explosive', rarity: 'rare', maxLevel: 3, icon: 'explosive', tags: ['explosion'], synergy: ['corpse_blast', 'f_reaction', 'multishot'] },
  { id: 'focus', rarity: 'common', maxLevel: 2, icon: 'focus', tags: ['projectile'], synergy: ['crit', 'overheat'] },
  { id: 'overheat', rarity: 'rare', maxLevel: 1, icon: 'overheat', tags: ['risk'], synergy: ['focus', 'pointblank'] },
  { id: 'pointblank', rarity: 'common', maxLevel: 2, icon: 'pointblank', tags: ['risk'], synergy: ['orbit', 'dash_strike', 'retaliate'] },
  { id: 'execute', rarity: 'rare', maxLevel: 2, icon: 'execute', tags: ['crit'], synergy: ['crit', 'split'] },
  { id: 'big_shot', rarity: 'common', maxLevel: 2, icon: 'big_shot', tags: ['projectile'], excludeWeapons: ['rail', 'beam'], synergy: ['pierce', 'explosive'] },
  // ---- Automation ----
  { id: 'drone', rarity: 'rare', maxLevel: 3, icon: 'drone', tags: ['drone', 'auto'], synergy: ['drone_ai', 'drone_overdrive', 'f_legion'] },
  { id: 'magnet', rarity: 'common', maxLevel: 2, icon: 'magnet', tags: ['auto'], synergy: ['combo_heal'] },
  { id: 'sentry', rarity: 'rare', maxLevel: 2, icon: 'sentry', tags: ['auto'], synergy: ['drone', 'pointblank'] },
  // ---- Defence / mobility ----
  { id: 'barrier', rarity: 'common', maxLevel: 2, icon: 'barrier', tags: ['defense'], synergy: ['orbit', 'retaliate'] },
  { id: 'vitality', rarity: 'common', maxLevel: 3, icon: 'vitality', tags: ['defense'], synergy: ['combo_heal'] },
  { id: 'phase_dash', rarity: 'common', maxLevel: 1, icon: 'phase_dash', tags: ['dash'], synergy: ['dash_strike', 'adrenaline', 'f_phantom'] },
  { id: 'combo_heal', rarity: 'common', maxLevel: 1, icon: 'combo_heal', tags: ['combo', 'defense'], synergy: ['vitality', 'magnet'] },
  { id: 'retaliate', rarity: 'common', maxLevel: 1, icon: 'retaliate', tags: ['defense'], synergy: ['barrier', 'pointblank'] },
  // ---- Skills ----
  { id: 'skill_cd', rarity: 'common', maxLevel: 2, icon: 'skill_cd', tags: ['skill'], synergy: ['skill_echo'] },
  { id: 'skill_echo', rarity: 'rare', maxLevel: 1, icon: 'skill_echo', tags: ['skill'], synergy: ['skill_cd'] },
  { id: 'sk_shock_plus', rarity: 'rare', maxLevel: 1, icon: 'sk_shock_plus', tags: ['skill', 'lightning'], skill: 'shockwave', synergy: ['skill_cd', 'skill_echo'] },
  { id: 'sk_od_plus', rarity: 'rare', maxLevel: 1, icon: 'sk_od_plus', tags: ['skill'], skill: 'overdrive', synergy: ['skill_cd', 'multishot'] },
  { id: 'sk_orb_plus', rarity: 'rare', maxLevel: 1, icon: 'sk_orb_plus', tags: ['skill'], skill: 'orbital', synergy: ['skill_cd', 'skill_echo'] },
  { id: 'sk_sing_plus', rarity: 'rare', maxLevel: 1, icon: 'sk_sing_plus', tags: ['skill'], skill: 'singularity', synergy: ['skill_cd', 'explosive'] },
  // ---- Weapon specific ----
  { id: 'smg_tracer', rarity: 'rare', maxLevel: 1, icon: 'tracer', tags: ['projectile'], weapons: ['smg'], synergy: ['pierce', 'ricochet'] },
  { id: 'sg_recoil', rarity: 'rare', maxLevel: 1, icon: 'sg_recoil', tags: ['dash'], weapons: ['shotgun'], synergy: ['pointblank'] },
  { id: 'rail_super', rarity: 'rare', maxLevel: 1, icon: 'rail_super', tags: ['projectile'], weapons: ['rail'], synergy: ['split', 'multishot'] },
  { id: 'beam_prism', rarity: 'rare', maxLevel: 1, icon: 'prism', tags: ['projectile'], weapons: ['beam'], synergy: ['crit', 'focus'] },
  // ---- Weapon awakening (one per run, from level 12) ----
  { id: 'awaken', rarity: 'awaken', maxLevel: 1, icon: 'awaken', tags: ['awaken'], minLevel: 12, synergy: [] },
  // ---- Module: lightning ----
  { id: 'chain', rarity: 'rare', maxLevel: 3, icon: 'chain', tags: ['crit', 'lightning'], pool: 'm_lightning', synergy: ['crit', 'split', 'f_storm'] },
  // ---- Module: missiles ----
  { id: 'missile', rarity: 'rare', maxLevel: 3, icon: 'missile', tags: ['missile', 'auto'], pool: 'm_missile', synergy: ['drone', 'f_legion', 'explosive'] },
  // ---- Module: frost ----
  { id: 'frost', rarity: 'common', maxLevel: 2, icon: 'frost', tags: ['frost'], pool: 'm_frost', synergy: ['crit', 'f_zero'] },
  // ---- Module: demolition ----
  { id: 'corpse_blast', rarity: 'rare', maxLevel: 2, icon: 'corpse_blast', tags: ['explosion'], pool: 'm_demolition', synergy: ['explosive', 'f_reaction'] },
  // ---- Module: orbit ----
  { id: 'orbit', rarity: 'rare', maxLevel: 3, icon: 'orbit', tags: ['orbit', 'auto', 'defense'], pool: 'm_orbit', synergy: ['pointblank', 'barrier'] },
  // ---- Module: tactical drones ----
  { id: 'drone_ai', rarity: 'rare', maxLevel: 1, icon: 'drone_ai', tags: ['drone', 'auto'], pool: 'm_droneai', requires: [{ id: 'drone', level: 1 }], synergy: ['drone'] },
  { id: 'drone_overdrive', rarity: 'rare', maxLevel: 1, icon: 'drone_overdrive', tags: ['drone', 'auto'], pool: 'm_droneai', requires: [{ id: 'drone', level: 1 }], synergy: ['drone', 'corpse_blast'] },
  // ---- Module: phantom ----
  { id: 'dash_strike', rarity: 'rare', maxLevel: 2, icon: 'dash_strike', tags: ['dash'], pool: 'm_phantom', synergy: ['phase_dash', 'f_phantom'] },
  { id: 'adrenaline', rarity: 'rare', maxLevel: 1, icon: 'adrenaline', tags: ['dash'], pool: 'm_phantom', synergy: ['phase_dash', 'dash_strike'] },
  // ---- Fusions (appear only when both halves are owned) ----
  { id: 'f_storm', rarity: 'legendary', maxLevel: 1, icon: 'f_storm', tags: ['lightning'], pool: 'm_lightning', fusion: true, requires: [{ id: 'split', level: 1 }, { id: 'chain', level: 1 }], synergy: ['split', 'chain'] },
  { id: 'f_legion', rarity: 'legendary', maxLevel: 1, icon: 'f_legion', tags: ['drone', 'missile'], pool: 'm_missile', fusion: true, requires: [{ id: 'drone', level: 2 }, { id: 'missile', level: 1 }], synergy: ['drone', 'missile'] },
  { id: 'f_zero', rarity: 'legendary', maxLevel: 1, icon: 'f_zero', tags: ['frost', 'crit'], pool: 'm_frost', fusion: true, requires: [{ id: 'frost', level: 1 }, { id: 'crit', level: 2 }], synergy: ['frost', 'crit'] },
  { id: 'f_reaction', rarity: 'legendary', maxLevel: 1, icon: 'f_reaction', tags: ['explosion'], pool: 'm_demolition', fusion: true, requires: [{ id: 'explosive', level: 1 }, { id: 'corpse_blast', level: 1 }], synergy: ['explosive', 'corpse_blast'] },
  { id: 'f_phantom', rarity: 'legendary', maxLevel: 1, icon: 'f_phantom', tags: ['dash'], pool: 'm_phantom', fusion: true, requires: [{ id: 'dash_strike', level: 1 }, { id: 'phase_dash', level: 1 }], synergy: ['dash_strike', 'phase_dash'] },
  // ---- Curses: big trade-offs, offered now and then ----
  { id: 'c_glass', rarity: 'curse', maxLevel: 1, icon: 'c_glass', tags: ['curse'], minLevel: 6, synergy: ['barrier', 'vitality'] },
  { id: 'c_frenzy', rarity: 'curse', maxLevel: 1, icon: 'c_frenzy', tags: ['curse'], minLevel: 6, synergy: ['drone', 'orbit'] },
  { id: 'c_hunter', rarity: 'curse', maxLevel: 1, icon: 'c_hunter', tags: ['curse'], minLevel: 8, synergy: ['execute', 'focus'] },
  // ---- 초월: endless boosts once the normal pool is almost empty ----
  { id: 'ov_power', rarity: 'overflow', maxLevel: 99, icon: 'ov_power', tags: ['overflow'], synergy: [] },
  { id: 'ov_rate', rarity: 'overflow', maxLevel: 99, icon: 'ov_rate', tags: ['overflow'], synergy: [] },
  { id: 'ov_crit', rarity: 'overflow', maxLevel: 99, icon: 'ov_crit', tags: ['overflow'], synergy: [] },
  { id: 'ov_life', rarity: 'overflow', maxLevel: 4, icon: 'ov_life', tags: ['overflow'], synergy: [] },
  { id: 'ov_cd', rarity: 'overflow', maxLevel: 5, icon: 'ov_cd', tags: ['overflow'], synergy: [] },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 10,
  rare: 6.5,
  legendary: 16,
  awaken: 0,
  curse: 0,
  overflow: 7,
};

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x8fd8ff,
  rare: 0xc890ff,
  legendary: 0xffcf4a,
  awaken: 0xffe08a,
  curse: 0xff4a6a,
  overflow: 0xb4bcd8,
};

export interface OfferContext {
  weapon: WeaponId;
  levels: Partial<Record<UpgradeId, number>>;
  unlockedPools: Set<string>;
  /** Player level (for awakening / curses). */
  level?: number;
  /** Equipped skills (for skill-specific cards). */
  skills?: string[];
}

export function isEligible(def: UpgradeDef, ctx: OfferContext): boolean {
  const lv = ctx.levels[def.id] ?? 0;
  if (lv >= def.maxLevel) return false;
  if (def.pool && !ctx.unlockedPools.has(def.pool)) return false;
  if (def.weapons && !def.weapons.includes(ctx.weapon)) return false;
  if (def.excludeWeapons && def.excludeWeapons.includes(ctx.weapon)) return false;
  if (def.skill && !(ctx.skills ?? []).includes(def.skill)) return false;
  if (def.minLevel && (ctx.level ?? 1) < def.minLevel) return false;
  if (def.requires) {
    for (const r of def.requires) {
      if ((ctx.levels[r.id] ?? 0) < r.level) return false;
    }
  }
  return true;
}

/** Normal cards still available (excludes awaken / curse / overflow). */
export function normalPoolSize(ctx: OfferContext): number {
  let n = 0;
  for (const u of UPGRADES) {
    if (u.rarity === 'awaken' || u.rarity === 'curse' || u.rarity === 'overflow') continue;
    if (isEligible(u, ctx)) n += u.maxLevel - (ctx.levels[u.id] ?? 0);
  }
  return n;
}

/**
 * Pick up to `count` distinct upgrades. Upgrades that share tags with what
 * the player already owns are slightly favoured so builds come together.
 *  - an available awakening always takes the first slot
 *  - sometimes one curse is mixed in
 *  - 초월 cards join the pool only once normal cards are running out
 */
export function rollOffers(ctx: OfferContext, count: number, rnd: () => number = Math.random): UpgradeDef[] {
  const ownedTags = new Set<string>();
  for (const [id, lv] of Object.entries(ctx.levels)) {
    if (!lv) continue;
    const d = UPGRADE_MAP[id];
    if (d) d.tags.forEach((t) => ownedTags.add(t));
  }
  const out: UpgradeDef[] = [];
  const eligible = UPGRADES.filter((u) => isEligible(u, ctx));
  const awaken = eligible.find((u) => u.rarity === 'awaken');
  if (awaken) out.push(awaken);

  const remaining = normalPoolSize(ctx);
  const allowOverflow = remaining < 6;
  const pool = eligible
    .filter((u) => u.rarity !== 'awaken' && u.rarity !== 'curse' && (u.rarity !== 'overflow' || allowOverflow))
    .map((u) => {
      let w = RARITY_WEIGHT[u.rarity];
      if (u.tags.some((t) => ownedTags.has(t))) w *= 1.35;
      if ((ctx.levels[u.id] ?? 0) > 0 && u.rarity !== 'overflow') w *= 1.15;
      return { u, w };
    });

  const curses = eligible.filter((u) => u.rarity === 'curse');
  const wantCurse = curses.length > 0 && out.length < count && rnd() < 0.16;
  const normalSlots = count - out.length - (wantCurse ? 1 : 0);
  while (out.length < (awaken ? 1 : 0) + normalSlots && pool.length > 0) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = rnd() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx].u);
    pool.splice(idx, 1);
  }
  if (wantCurse) out.push(curses[Math.floor(rnd() * curses.length) % curses.length]);
  // If the normal pool ran dry, top up with 초월 cards so there are always choices.
  if (out.length < count) {
    const extra = eligible.filter((u) => u.rarity === 'overflow' && !out.includes(u));
    while (out.length < count && extra.length) out.push(extra.splice(Math.floor(rnd() * extra.length) % extra.length, 1)[0]);
  }
  return out.slice(0, count);
}
