import { describe, it, expect } from 'vitest';
import { sanitizeSave, SaveStore, defaultSave, type StorageLike } from '../src/core/save';
import { SAVE_KEY } from '../src/core/constants';
import { META, META_IDS, nextCost } from '../src/data/meta';
import { WEAPON_ORDER, WEAPONS } from '../src/data/weapons';
import { SKILL_ORDER } from '../src/data/skills';
import { UPGRADES, UPGRADE_MAP, isEligible, rollOffers, type OfferContext } from '../src/data/upgrades';
import { ENEMIES } from '../src/data/enemies';
import { ZONES } from '../src/data/zones';
import { xpForLevel, comboMultiplier, comboTier, runShardBonus, multishotShare } from '../src/data/balance';
import { Build } from '../src/game/build';
import { segmentBox, circleBox, angleDiff, formatTime } from '../src/core/mathx';
import { SpatialGrid } from '../src/game/spatial';
import { KO_STRINGS, KO_UPGRADES } from '../src/localization/ko';
import { t, upgradeDesc } from '../src/localization/i18n';

const OPT = {
  metaIds: META_IDS,
  metaMax: Object.fromEntries(META.map((m) => [m.id, m.costs.length])),
  weapons: WEAPON_ORDER,
  skills: SKILL_ORDER,
  maxDepth: 5,
};

class Mem implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('save', () => {
  it('sanitizes garbage into a valid default save', () => {
    for (const raw of [null, 42, 'x', [], { shards: 'lots' }]) {
      const s = sanitizeSave(raw, OPT);
      expect(s.version).toBe(1);
      expect(s.shards).toBe(0);
      expect(s.weapon).toBe('smg');
    }
  });

  it('clamps numbers, drops unknown ids and fixes duplicate skills', () => {
    const s = sanitizeSave(
      {
        shards: -50,
        meta: { w_shotgun: 1, b_hp: 99, hacked: 3, g_reroll: 'two' },
        weapon: 'bazooka',
        skillQ: 'overdrive',
        skillE: 'overdrive',
        depth: 9,
        maxDepth: 2,
        settings: { master: 7, shake: 5, damageNumbers: 'yes' },
        stats: { runs: 3.7, bestTime: Number.NaN },
      },
      OPT,
    );
    expect(s.shards).toBe(0);
    expect(s.meta).toEqual({ w_shotgun: 1, b_hp: 3 });
    expect(s.weapon).toBe('smg');
    expect(s.skillQ).not.toBe(s.skillE);
    expect(s.maxDepth).toBe(2);
    expect(s.depth).toBe(2);
    expect(s.settings.master).toBe(1);
    expect(s.settings.shake).toBe(2);
    expect(s.settings.damageNumbers).toBe(true);
    expect(s.stats.runs).toBe(3);
    expect(s.stats.bestTime).toBe(0);
  });

  it('round-trips through storage and survives corrupted JSON', () => {
    const mem = new Mem();
    const a = new SaveStore(OPT, mem);
    a.data.shards = 123;
    a.data.meta.w_rail = 1;
    a.save();
    const b = new SaveStore(OPT, mem);
    expect(b.data.shards).toBe(123);
    expect(b.data.meta.w_rail).toBe(1);

    mem.setItem(SAVE_KEY, '{broken');
    const c = new SaveStore(OPT, mem);
    expect(c.recovered).toBe(true);
    expect(c.data).toEqual(defaultSave());
    expect(mem.getItem(SAVE_KEY + '.corrupt')).toBe('{broken');
  });

  it('reset keeps settings but clears progress', () => {
    const mem = new Mem();
    const s = new SaveStore(OPT, mem);
    s.data.shards = 500;
    s.data.settings.music = 0.1;
    s.reset();
    expect(s.data.shards).toBe(0);
    expect(s.data.settings.music).toBe(0.1);
  });
});

describe('upgrades', () => {
  const ctx = (levels: OfferContext['levels'] = {}, pools: string[] = [], weapon: OfferContext['weapon'] = 'smg'): OfferContext => ({
    weapon,
    levels,
    unlockedPools: new Set(pools),
  });

  it('respects max level, pools, weapons and prerequisites', () => {
    expect(isEligible(UPGRADE_MAP.pierce, ctx({ pierce: 3 }))).toBe(false);
    expect(isEligible(UPGRADE_MAP.pierce, ctx({}, [], 'rail'))).toBe(false);
    expect(isEligible(UPGRADE_MAP.chain, ctx())).toBe(false);
    expect(isEligible(UPGRADE_MAP.chain, ctx({}, ['m_lightning']))).toBe(true);
    expect(isEligible(UPGRADE_MAP.smg_tracer, ctx({}, [], 'shotgun'))).toBe(false);
    expect(isEligible(UPGRADE_MAP.f_storm, ctx({ split: 1 }, ['m_lightning']))).toBe(false);
    expect(isEligible(UPGRADE_MAP.f_storm, ctx({ split: 1, chain: 1 }, ['m_lightning']))).toBe(true);
  });

  it('rolls distinct eligible offers', () => {
    for (let i = 0; i < 200; i++) {
      const offers = rollOffers(ctx({}, ['m_lightning', 'm_missile']), 3);
      expect(offers.length).toBe(3);
      expect(new Set(offers.map((o) => o.id)).size).toBe(3);
      for (const o of offers) expect(isEligible(o, ctx({}, ['m_lightning', 'm_missile']))).toBe(true);
    }
  });

  const SPECIAL = new Set(['awaken', 'curse', 'overflow']);
  const allPools = META.filter((m) => m.cat === 'module').map((m) => m.id);

  it('never runs dry: 초월 cards fill in when the normal pool is exhausted', () => {
    const maxed: OfferContext['levels'] = {};
    for (const u of UPGRADES) if (!SPECIAL.has(u.rarity)) maxed[u.id] = u.maxLevel;
    maxed.vitality = UPGRADE_MAP.vitality.maxLevel - 1;
    for (let i = 0; i < 100; i++) {
      const offers = rollOffers(ctx(maxed, allPools), 3);
      expect(offers.length).toBe(3);
      expect(new Set(offers.map((o) => o.id)).size).toBe(3);
      for (const o of offers) expect(o.id === 'vitality' || o.rarity === 'overflow', o.id).toBe(true);
    }
    // Even with every capped 초월 card taken, the uncapped ones keep offering.
    for (const u of UPGRADES) maxed[u.id] = u.maxLevel >= 99 ? 50 : u.maxLevel;
    const late = rollOffers({ ...ctx(maxed, allPools), level: 60 }, 3);
    expect(late.length).toBe(3);
    for (const o of late) expect(o.rarity).toBe('overflow');
  });

  it('keeps 초월 out while the normal pool is still large', () => {
    for (let i = 0; i < 200; i++) {
      for (const o of rollOffers({ ...ctx(), level: 10 }, 3)) expect(o.rarity).not.toBe('overflow');
    }
  });

  it('offers the weapon awakening first from level 12, once', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollOffers({ ...ctx(), level: 11 }, 3).some((o) => o.id === 'awaken')).toBe(false);
      const at12 = rollOffers({ ...ctx(), level: 12 }, 3);
      expect(at12[0].id).toBe('awaken');
      expect(at12.length).toBe(3);
      expect(rollOffers({ ...ctx({ awaken: 1 }), level: 20 }, 3).some((o) => o.id === 'awaken')).toBe(false);
    }
  });

  it('mixes in at most one curse, only after the early levels', () => {
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      expect(rollOffers({ ...ctx(), level: 5 }, 3).some((o) => o.rarity === 'curse')).toBe(false);
      const offers = rollOffers({ ...ctx(), level: 9 }, 3);
      const n = offers.filter((o) => o.rarity === 'curse').length;
      expect(n).toBeLessThanOrEqual(1);
      expect(offers.length).toBe(3);
      seen += n;
    }
    // ~16% per offer: expect roughly 30–110 of 400
    expect(seen).toBeGreaterThan(30);
    expect(seen).toBeLessThan(110);
  });

  it('skill cards need the matching skill equipped', () => {
    expect(isEligible(UPGRADE_MAP.sk_shock_plus, ctx())).toBe(false);
    expect(isEligible(UPGRADE_MAP.sk_shock_plus, { ...ctx(), skills: ['overdrive', 'shockwave'] })).toBe(true);
    expect(isEligible(UPGRADE_MAP.sk_orb_plus, { ...ctx(), skills: ['overdrive', 'shockwave'] })).toBe(false);
    for (const s of SKILL_ORDER) expect(UPGRADES.some((u) => u.skill === s), s).toBe(true);
  });

  it('a full run worth of picks never gets an empty level-up', () => {
    const levels: OfferContext['levels'] = {};
    for (let lv = 2; lv <= 80; lv++) {
      const offers = rollOffers({ ...ctx(levels, allPools), level: lv, skills: ['shockwave', 'overdrive'] }, 3);
      expect(offers.length, `lv ${lv}`).toBe(3);
      const pick = offers.find((o) => o.rarity !== 'curse') ?? offers[0];
      levels[pick.id] = (levels[pick.id] ?? 0) + 1;
    }
    expect(levels.awaken).toBe(1);
  });

  it('every upgrade has Korean text for every level', () => {
    for (const u of UPGRADES) {
      const txt = KO_UPGRADES[u.id];
      expect(txt, u.id).toBeTruthy();
      for (let lv = 1; lv <= u.maxLevel; lv++) expect(upgradeDesc(u.id, lv).length, `${u.id} lv${lv}`).toBeGreaterThan(3);
      for (const s of u.synergy) expect(UPGRADE_MAP[s], `${u.id} synergy ${s}`).toBeTruthy();
    }
  });
});

describe('build stats', () => {
  it('derives rule changes from levels', () => {
    const b = new Build(WEAPONS.smg);
    expect(b.pierce).toBe(0);
    expect(b.splitCount).toBe(0);
    b.add('pierce');
    b.add('pierce');
    b.add('split');
    b.add('multishot');
    expect(b.pierce).toBe(2);
    expect(b.splitCount).toBe(2);
    expect(b.extraProjectiles).toBe(1);
    expect(b.order).toEqual(['pierce', 'split', 'multishot']);
    const s = new Build(WEAPONS.shotgun);
    s.add('multishot');
    expect(s.extraProjectiles).toBe(2);
    const r = new Build(WEAPONS.rail);
    expect(r.pierce).toBeGreaterThan(100);
  });

  it('caps at max level', () => {
    const b = new Build(WEAPONS.smg);
    for (let i = 0; i < 10; i++) b.add('crit');
    expect(b.lv('crit')).toBe(UPGRADE_MAP.crit.maxLevel);
    expect(b.critMul).toBeCloseTo(2.8);
  });

  it('초월, awakening and curses change the numbers', () => {
    const b = new Build(WEAPONS.smg);
    expect(b.dmgMul).toBe(1);
    expect(b.fireRateMul).toBe(1);
    for (let i = 0; i < 5; i++) b.add('ov_power');
    expect(b.dmgMul).toBeCloseTo(1.6);
    b.add('awaken');
    expect(b.awakened).toBe(true);
    expect(b.fireRateMul).toBeCloseTo(1.25);
    b.add('c_glass');
    expect(b.dmgMul).toBeCloseTo(2.4);
    b.add('execute');
    b.add('execute');
    expect(b.executeThreshold).toBeCloseTo(0.2);
    const s = new Build(WEAPONS.shotgun);
    s.add('awaken');
    expect(s.fireRateMul).toBe(1);
    s.add('c_frenzy');
    expect(s.spawnMul).toBeGreaterThan(1);
    expect(s.rewardMul).toBeGreaterThan(1);
  });

  it('fusion adds a drone', () => {
    const b = new Build(WEAPONS.smg);
    b.add('drone');
    b.add('drone');
    b.add('f_legion');
    expect(b.drones).toBe(3);
  });
});

describe('balance', () => {
  it('xp curve is increasing and starts quick', () => {
    expect(xpForLevel(1)).toBeLessThanOrEqual(6);
    for (let lv = 1; lv < 60; lv++) expect(xpForLevel(lv + 1)).toBeGreaterThan(xpForLevel(lv));
  });

  it('combo multiplier is a bonus capped at x1.5', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(10000)).toBe(1.5);
    expect(comboTier(0)).toBe(-1);
    expect(comboTier(15)).toBe(0);
    expect(comboTier(150)).toBe(3);
  });

  it('multishot adds coverage but shares damage', () => {
    expect(multishotShare(1)).toBe(1);
    expect(multishotShare(2)).toBeCloseTo(0.8);
    let lastTotal = 1;
    for (let n = 2; n <= 6; n++) {
      const total = n * multishotShare(n);
      expect(total).toBeGreaterThan(lastTotal);
      expect(multishotShare(n)).toBeLessThan(multishotShare(n - 1));
      lastTotal = total;
    }
  });

  it('run bonus rewards progress', () => {
    expect(runShardBonus(0, 0, 0, 0, false)).toBe(5);
    // a typical 2-minute first run should afford the cheapest unlock
    expect(runShardBonus(150, 0, 0, 120, false)).toBeGreaterThanOrEqual(15);
    expect(runShardBonus(200, 3, 2, 720, true)).toBeGreaterThan(runShardBonus(200, 1, 1, 300, false));
  });

  it('meta costs are defined per level', () => {
    expect(nextCost({}, 'g_reroll')).toBe(20);
    expect(nextCost({ g_reroll: 1 }, 'g_reroll')).toBe(40);
    expect(nextCost({ g_reroll: 3 }, 'g_reroll')).toBeNull();
    expect(nextCost({}, 'nope')).toBeNull();
  });
});

describe('data integrity', () => {
  it('zones reference valid enemies and ordered phases', () => {
    for (const z of ZONES) {
      let last = -1;
      for (const p of z.phases) {
        expect(p.t).toBeGreaterThan(last);
        last = p.t;
        for (const id of Object.keys(p.weights)) expect(ENEMIES[id as keyof typeof ENEMIES], id).toBeTruthy();
      }
      for (const e of z.events) if (e.type !== 'hint') expect(ENEMIES[e.enemy]).toBeTruthy();
      expect(z.boss || z.finale).toBeTruthy();
    }
  });

  it('player-facing keys exist in Korean', () => {
    const keys: string[] = [];
    for (const z of ZONES) keys.push(`zone.${z.id}`, `zone.${z.id}.sub`);
    for (const id of Object.keys(ENEMIES)) if (id !== 'rift') keys.push(`enemy.${id}`);
    for (const m of META) keys.push(`meta.${m.id}`, `meta.${m.id}.desc`);
    for (const w of WEAPON_ORDER) keys.push(`weapon.${w}`, `weapon.${w}.desc`);
    for (const s of SKILL_ORDER) keys.push(`skill.${s}`, `skill.${s}.desc`);
    for (const z of ZONES) for (const e of z.events) if (e.type === 'hint') keys.push(e.key);
    for (const ev of ['supply', 'surge', 'bounty', 'rain']) keys.push(`event.${ev}`, `event.${ev}.sub`);
    for (const r of new Set(UPGRADES.map((u) => u.rarity))) keys.push(`rarity.${r}`);
    for (const w of WEAPON_ORDER) keys.push(`awaken.${w}`);
    keys.push('hud.event', 'banner.execute', 'banner.awaken', 'event.bountyDone', 'event.bountyFail');
    for (const k of keys) expect(KO_STRINGS[k], k).toBeTruthy();
    expect(t('hud.lv', { n: 3 })).toBe('Lv 3');
  });
});

describe('math & spatial', () => {
  it('segment vs box', () => {
    expect(segmentBox(0, 0, 1, 0, 100, 50, 0, 5, 5)).toBeCloseTo(45);
    expect(segmentBox(0, 20, 1, 0, 100, 50, 0, 5, 5)).toBe(-1);
    expect(segmentBox(0, 0, 1, 0, 30, 50, 0, 5, 5)).toBe(-1);
    expect(circleBox(0, 0, 3, 5, 0, 2, 2)).toBe(true);
    expect(circleBox(0, 0, 2, 5, 0, 2, 2)).toBe(false);
  });

  it('angles and time formatting', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(Math.abs(angleDiff(3.1, -3.1))).toBeLessThan(0.1);
    expect(formatTime(125.7)).toBe('2:05');
  });

  it('grid returns each item once', () => {
    const g = new SpatialGrid<{ x: number; y: number; hw: number; hh: number; qstamp: number }>(32);
    const a = { x: 100, y: 100, hw: 40, hh: 40, qstamp: 0 };
    const b = { x: 600, y: 100, hw: 5, hh: 5, qstamp: 0 };
    g.insert(a);
    g.insert(b);
    const out: (typeof a)[] = [];
    expect(g.query(50, 50, 150, 150, out)).toEqual([a]);
    expect(g.query(0, 0, 900, 200, out).length).toBe(2);
  });
});
