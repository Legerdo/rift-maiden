// Damage pipeline and every on-hit / on-kill rule. Feedback strength always
// scales with the hit's power so a crit or a rail shot *feels* different.

import { ARENA_W, GROUND_Y } from '../core/constants';
import { dist, segmentBox, clamp } from '../core/mathx';
import { rand, chance, pick } from '../core/rng';
import { audio } from '../audio/audio';
import { QA_ENABLED } from '../core/app';
import { t } from '../localization/i18n';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './enemy';
import type { Shot } from './shots';

export type DmgSource =
  | 'main'
  | 'shard'
  | 'drone'
  | 'homing'
  | 'missile'
  | 'mini'
  | 'ice'
  | 'phantom'
  | 'explosion'
  | 'chain'
  | 'orbit'
  | 'skill'
  | 'dash'
  | 'beam'
  | 'rail'
  | 'debris'
  | 'exploder'
  | 'prism'
  | 'burn'
  | 'turret';

export interface DmgOpts {
  source: DmgSource;
  hx?: number;
  hy?: number;
  /** Force crit on/off; undefined = roll if `canCrit`. */
  crit?: boolean;
  canCrit?: boolean;
  knockX?: number;
  knockY?: number;
  procs?: boolean;
  storm?: boolean;
  quiet?: boolean;
}

interface PendingBlast {
  x: number;
  y: number;
  r: number;
  dmg: number;
  t: number;
  big: boolean;
}

const PROC_SOURCES = new Set<DmgSource>(['main', 'shard', 'drone', 'phantom', 'beam', 'rail', 'homing', 'prism', 'turret']);

export class Combat {
  g: GameScene;
  private hitCounter = 0;
  private focusUid = -1;
  private focusStacks = 0;
  private blasts: PendingBlast[] = [];
  private scratch: Enemy[] = [];
  private lastBlockText = 0;
  private lastWeakText = 0;
  private lastExecText = 0;
  private lastBossStop = -1;
  /** QA/balance: total damage dealt to bosses per source. */
  bossDmg: Record<string, number> = {};

  constructor(g: GameScene) {
    this.g = g;
  }

  /** Global player damage multiplier (level, buffs, overheat). */
  playerMul(): number {
    const g = this.g;
    const p = g.player;
    // Level itself only gives a trickle; real power comes from build choices.
    let m = (1 + 0.01 * (g.run.level - 1)) * g.build.dmgMul;
    if (p.dmgBuffT > 0) m *= 1 + p.dmgBuffMul;
    if (g.build.has('overheat')) m *= 1 + 0.8 * p.heatFrac;
    if (p.overdriveT > 0) m *= 1.15;
    return m;
  }

  hitByShot(s: Shot, e: Enemy, hx: number, hy: number): boolean {
    const src: DmgSource = s.kind === 'main' ? 'main' : (s.kind as DmgSource);
    const kn = s.knock * Math.sign(s.vx || 1);
    // Shotgun: pellets that connect right out of the barrel (~60px) hit 50% harder.
    const pointBlank = s.kind === 'main' && this.g.build.weapon.id === 'shotgun' && s.age < 0.12 ? 1.5 : 1;
    return this.damage(e, s.dmg * pointBlank, {
      source: src,
      hx,
      hy,
      canCrit: true,
      knockX: kn,
      procs: true,
      storm: s.storm,
    }).killed;
  }

  damage(e: Enemy, amount: number, o: DmgOpts): { killed: boolean; dealt: number } {
    const g = this.g;
    if (!e.alive || e.dying > 0) return { killed: false, dealt: 0 };
    const b = g.build;
    const p = g.player;
    let amt = amount * this.playerMul();
    const hx = o.hx ?? e.x;
    const hy = o.hy ?? e.y;

    let crit = o.crit ?? false;
    if (o.crit === undefined && o.canCrit) {
      let cc = b.critChance;
      if (b.has('f_zero') && e.frozen > 0) cc = 1;
      crit = Math.random() < cc;
    }
    if (crit) amt *= b.critMul;

    if (b.pointblankMul > 0 && dist(p.x, p.y - 20, e.x, e.y) < b.pointblankRange) amt *= 1 + b.pointblankMul;
    if (b.focusMax > 0 && (o.source === 'main' || o.source === 'beam' || o.source === 'rail')) {
      if (e.uid === this.focusUid) this.focusStacks = Math.min(12, this.focusStacks + 1);
      else {
        this.focusUid = e.uid;
        this.focusStacks = 1;
      }
      amt *= 1 + (b.focusMax * this.focusStacks) / 12;
    }
    if (e.frozen > 0) amt *= 1.3;
    if (e.buffT > 0) amt *= 0.6;

    let weak = false;
    if (e.boss) {
      const r = e.boss.modify(e, amt, hx, hy);
      amt = r.amount;
      weak = r.weak;
      if (r.blocked) {
        this.blockFx(hx, hy);
        return { killed: false, dealt: 0 };
      }
    } else if (e.def.weakTop > 0 && hy < e.y - e.hh + e.hh * 2 * e.def.weakTop) {
      weak = true;
      amt *= o.source === 'rail' ? 2.2 : 1.5;
    }
    e.lastHitWeak = weak;

    // Warded elites: shield soaks damage first
    if (e.ward > 0) {
      const soak = Math.min(e.ward, amt * 0.85);
      e.ward -= soak;
      amt -= soak;
      if (e.ward <= 0) {
        e.stun = 1.2;
        g.fx.ring(e.x, e.y, 6, 34, 0.3, 0xc890ff, 2);
        g.fx.sparks(e.x, e.y, 14, [0xc890ff, 0xffffff], 140);
        audio.play('shield_block', { pitch: 0.7 });
      }
    }

    e.hp -= amt;
    if (QA_ENABLED && e.boss) {
      this.bossDmg[o.source] = (this.bossDmg[o.source] ?? 0) + amt;
      this.bossDmg[o.source + '#'] = (this.bossDmg[o.source + '#'] ?? 0) + 1;
      if (weak) this.bossDmg.weak = (this.bossDmg.weak ?? 0) + 1;
      if (crit) this.bossDmg.crit = (this.bossDmg.crit ?? 0) + 1;
      this.bossDmg.raw = (this.bossDmg.raw ?? 0) + amount;
    }
    // hit flash with a short cooldown so rapid fire doesn't turn enemies solid white
    const now = g.run.time;
    if (crit || weak || now - (e.mem.flashAt ?? -1) > 0.12) {
      e.flash = crit ? 0.08 : 0.05;
      e.mem.flashAt = now;
    }
    if (e.isElite || e.boss || e.ai === 'rift') e.hpBarT = Math.max(e.hpBarT, 2.5);
    if (o.knockX && !e.boss && !e.external) {
      const k = o.knockX * (1 - e.def.mass);
      e.kbx += k;
      if (Math.abs(k) > 90 && e.grounded && !e.def.flying) e.vy = -Math.min(160, Math.abs(k) * 0.6);
    }

    // ---- feedback, scaled by power
    const heavy = o.source === 'rail' || amt > 30 * g.director.hpMul;
    const power = clamp((crit ? 1.2 : 0) + (weak ? 1 : 0) + (heavy ? 1.5 : 0) + (o.source === 'main' ? 0.6 : 0.3), 0.3, 4);
    if (!o.quiet) {
      const ang = Math.atan2(hy - (p.y - 22), hx - p.x);
      g.fx.hitSpark(hx, hy, power, ang, crit ? 0xffd84a : weak ? 0xff8ab0 : 0xfff0a0);
      g.fx.dmg(hx, e.top - 2, amt, crit || weak, e.uid, weak && !crit ? 0xff9ad0 : undefined);
      const vol = o.source === 'drone' || o.source === 'chain' || o.source === 'orbit' ? 0.5 : 1;
      if (crit) audio.play('hit_crit', { vol });
      else if (weak) audio.play('hit_weak', { vol });
      else if (heavy) audio.play('hit_heavy', { vol });
      else audio.play('hit', { vol, pitch: e.boss ? 0.7 : 1 });
      if (weak && g.run.time - this.lastWeakText > 0.7) {
        this.lastWeakText = g.run.time;
        g.fx.text(hx, e.top - 10, t('banner.weak'), 0xff9ad0, 'small', 0.6);
      }
    }
    if (o.source === 'rail' || (o.source === 'main' && g.build.weapon.id === 'shotgun')) g.hitstop(g.build.weapon.hitstop * (crit ? 1.4 : 1));
    else if (crit && e.boss && g.run.time - this.lastBossStop > 0.35) {
      // rate-limited so rapid-fire crits don't turn a boss fight into a stutter
      this.lastBossStop = g.run.time;
      g.hitstop(18);
    }

    // ---- procs
    if (o.procs && PROC_SOURCES.has(o.source)) {
      if (b.chainTargets > 0 && (crit || Math.random() < b.chainFreeChance)) this.lightning(e, amt * b.chainDmg, b.chainTargets);
      else if (o.storm && crit) this.lightning(e, amt * 0.6, 2);
      if (b.frostStacks > 0 && e.frozen <= 0) {
        e.frost++;
        e.slow = 1.4;
        if (e.frost >= b.frostStacks) {
          e.frost = 0;
          e.frozen = b.freezeTime * (e.boss ? 0.35 : 1);
          g.fx.anim('ice_burst', e.x, e.y, 3, 18, { add: true });
          audio.play('freeze');
        }
      }
      if (b.explosiveEvery > 0) {
        this.hitCounter++;
        if (this.hitCounter >= b.explosiveEvery) {
          this.hitCounter = 0;
          // small floor so light bullets still pop, without letting bullet volume dominate bosses
          this.explode(hx, hy, b.explosiveRadius, Math.max(5, amount * 1.6), 'explosion');
        }
      }
    }

    // Awakened shotgun: pellets set enemies on fire (damage over time).
    if (o.source === 'main' && b.awakened && b.weapon.id === 'shotgun') {
      e.burnT = 2.2;
      e.burnDmg = Math.max(e.burnDmg, amount * 0.5);
    }

    // Execute: finish off badly wounded non-boss enemies.
    const ex = b.executeThreshold;
    if (ex > 0 && e.hp > 0 && !e.boss && !e.external && e.hp <= e.maxHp * ex) {
      e.hp = 0;
      g.fx.line([e.x - 8, e.y - 8, e.x + 8, e.y + 8], 0xff5c7a, 2, 0.14, 0xffffff);
      g.fx.line([e.x + 8, e.y - 8, e.x - 8, e.y + 8], 0xff5c7a, 2, 0.14, 0xffffff);
      if (g.run.time - this.lastExecText > 1.2) {
        this.lastExecText = g.run.time;
        g.fx.text(e.x, e.top - 10, t('banner.execute'), 0xff8aa0, 'small', 0.5);
      }
      for (let i = 0; i < 3; i++) g.shots.spawn('shard', e.x, e.y, rand(0, Math.PI * 2), 330, Math.max(4, amount * 0.4), { life: 0.3, r: 2 });
    }

    if (e.hp <= 0) {
      this.kill(e, o.source, crit);
      return { killed: true, dealt: amt };
    }
    return { killed: false, dealt: amt };
  }

  /** Burning enemies (awakened shotgun) take periodic fire damage. */
  tickBurn(e: Enemy, dt: number): void {
    if (e.burnT <= 0) return;
    e.burnT -= dt;
    e.burnTick -= dt;
    if (Math.random() < 0.5) this.g.fx.p(e.x + rand(-e.hw, e.hw), e.y + rand(-e.hh, e.hh * 0.5), rand(-8, 8), -rand(20, 50), 0.35, Math.random() < 0.5 ? 0xffa040 : 0xffe060, { add: true });
    if (e.burnTick <= 0) {
      e.burnTick = 0.25;
      this.damage(e, e.burnDmg, { source: 'burn', canCrit: false, procs: false, quiet: true });
    }
    if (e.burnT <= 0) e.burnDmg = 0;
  }

  kill(e: Enemy, source: DmgSource, crit: boolean): void {
    const g = this.g;
    if (e.dying > 0 || !e.alive) return;
    const big = e.isElite || e.def.hp >= 40 || !!e.boss;
    e.dying = e.boss ? 0.01 : e.isElite ? 0.38 : big ? 0.16 : 0.09;
    e.dyingMax = e.dying;
    e.flash = 0;
    if (source === 'explosion' || source === 'exploder' || source === 'missile') e.killedByExplosion = true;
    if (e.boss) {
      e.boss.onPartKilled(e);
      return;
    }
    g.onEnemyKilled(e, source, crit);

    const b = g.build;
    // on-kill rules
    if (e.ai === 'exploder') this.detonateExploder(e, true);
    const blastChance = b.corpseChance;
    if (b.has('f_reaction') && e.killedByExplosion) this.queueBlast(e.x, e.y, b.corpseRadius * 1.4 || 36, 22 * g.director.hpMul, 0.07, true);
    else if (blastChance > 0 && Math.random() < blastChance) this.queueBlast(e.x, e.y, b.corpseRadius, 16 * g.director.hpMul, 0.06, false);
    if (b.has('f_zero') && e.frozen > 0) {
      for (let i = 0; i < 6; i++) g.shots.spawn('ice', e.x, e.y, (i / 6) * Math.PI * 2 + rand(-0.2, 0.2), 300, 10, { life: 0.4, r: 2 });
    }
    if (b.has('f_storm') && source === 'chain') {
      for (let i = 0; i < 3; i++) g.shots.spawn('shard', e.x, e.y, rand(0, Math.PI * 2), 360, 8, { life: 0.35, r: 2, storm: true });
    }
    if (e.burnT > 0) this.queueBlast(e.x, e.y, 28, 16 * g.director.hpMul, 0.05, false);
    if (e.elite === 'splitter') {
      for (let i = 0; i < 3; i++) {
        const c = g.spawnEnemy('crawler', e.x + (i - 1) * 12, GROUND_Y - 10, null);
        if (c) c.vy = -rand(160, 240);
      }
    }
    if (e.elite === 'volatile') {
      this.queueBlast(e.x, e.y, 40, 30 * g.director.hpMul, 0.25, true);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.eshots.fire(e.x, e.y, Math.cos(a) * 95, Math.sin(a) * 95, 'orb', 1);
      }
    }
  }

  queueBlast(x: number, y: number, r: number, dmg: number, delay: number, big: boolean): void {
    if (this.blasts.length > 40) return;
    this.blasts.push({ x, y, r, dmg, t: delay, big });
  }

  update(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const bl = this.blasts[i];
      bl.t -= dt;
      if (bl.t <= 0) {
        this.blasts.splice(i, 1);
        this.explode(bl.x, bl.y, bl.r, bl.dmg, 'explosion', false, bl.big);
      }
    }
  }

  explode(x: number, y: number, r: number, dmg: number, source: DmgSource, hurtsPlayer = false, big = false): void {
    const g = this.g;
    g.fx.explosion(x, y, r);
    g.cam.shake(Math.min(0.3, 0.06 + r * 0.003));
    audio.play(r > 34 || big ? 'explosion' : 'explosion_small', { vol: 0.8 });
    g.grid.queryCircle(x, y, r + 20, this.scratch);
    const list = this.scratch.slice();
    for (const e of list) {
      if (!e.alive || e.dying > 0) continue;
      if (!e.overlapsCircle(x, y, r)) continue;
      const kx = Math.sign(e.x - x || 1) * 120;
      const res = this.damage(e, dmg, { source, hx: e.x, hy: e.y, knockX: kx, canCrit: false, quiet: false });
      if (res.killed) e.killedByExplosion = true;
    }
    if (hurtsPlayer) {
      const p = g.player;
      if (dist(x, y, p.x, p.y - 20) < r + 6) p.hurt(1, x, source);
    }
  }

  lightning(from: Enemy, dmg: number, count: number): void {
    const g = this.g;
    let cur = { x: from.x, y: from.y };
    const hit: number[] = [from.uid];
    for (let i = 0; i < count; i++) {
      let best: Enemy | null = null;
      let bd = 95;
      for (const e of g.enemies) {
        if (!e.alive || e.dying > 0 || !e.targetable || hit.includes(e.uid)) continue;
        const d = dist(cur.x, cur.y, e.x, e.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      hit.push(best.uid);
      g.fx.lightning(cur.x, cur.y, best.x, best.y);
      this.damage(best, dmg, { source: 'chain', hx: best.x, hy: best.y, canCrit: false, procs: false });
      cur = { x: best.x, y: best.y };
    }
    if (hit.length > 1) audio.play('lightning');
  }

  /** Sweep a ray, returning hits sorted by distance. */
  private ray(x0: number, y0: number, ang: number, maxLen: number, pad = 2): { len: number; hits: { e: Enemy; t: number }[] } {
    const g = this.g;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let len = maxLen;
    if (dy > 0.0001) len = Math.min(len, (GROUND_Y - 1 - y0) / dy);
    if (dx > 0.0001) len = Math.min(len, (ARENA_W - x0) / dx);
    if (dx < -0.0001) len = Math.min(len, (0 - x0) / dx);
    if (dy < -0.0001) len = Math.min(len, (-20 - y0) / dy);
    len = Math.max(0, len);
    const x1 = x0 + dx * len;
    const y1 = y0 + dy * len;
    g.grid.query(Math.min(x0, x1) - 4, Math.min(y0, y1) - 4, Math.max(x0, x1) + 4, Math.max(y0, y1) + 4, this.scratch);
    const hits: { e: Enemy; t: number }[] = [];
    for (const e of this.scratch) {
      if (!e.alive || e.dying > 0 || !e.targetable) continue;
      const tt = segmentBox(x0, y0, dx, dy, len, e.x, e.y, e.hw, e.hh, pad);
      if (tt >= 0) hits.push({ e, t: tt });
    }
    hits.sort((a, b) => a.t - b.t);
    return { len, hits };
  }

  railShot(x0: number, y0: number, ang: number, dmg: number, phantom = false, depth = 0, exclude = -1): void {
    const g = this.g;
    const ray = this.ray(x0, y0, ang, g.build.weapon.range || 720);
    const len = ray.len;
    const hits = exclude >= 0 ? ray.hits.filter((h) => h.e.uid !== exclude) : ray.hits;
    // Awakened rail: fork into three at the first enemy it pierces.
    if (depth === 0 && !phantom && g.build.awakened && g.build.weapon.id === 'rail' && hits.length > 0) {
      const f = hits[0];
      const fx0 = x0 + Math.cos(ang) * f.t;
      const fy0 = y0 + Math.sin(ang) * f.t;
      this.g.director.later(0.03, () => {
        for (const da of [-0.32, 0.32]) this.railShot(fx0, fy0, ang + da, dmg * 0.7, false, 1, f.e.uid);
      });
    }
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    g.fx.line([x0, y0, x1, y1], phantom ? 0x9cf8ff : 0x6ef4ff, phantom ? 2 : 4, 0.2);
    g.fx.sparks(x1, y1, 8, [0xffffff, 0x6ef4ff], 120, ang + Math.PI, 1.8, 0.25);
    let n = 0;
    for (const h of hits) {
      const hx = x0 + Math.cos(ang) * h.t;
      const hy = y0 + Math.sin(ang) * h.t;
      const res = this.damage(h.e, dmg, { source: phantom ? 'phantom' : 'rail', hx, hy, canCrit: true, knockX: Math.cos(ang) * g.build.weapon.knockback, procs: true });
      n++;
      if (g.build.splitCount > 0) {
        const fake = { vx: Math.cos(ang) * 400, vy: Math.sin(ang) * 400, dmg: dmg * 0.9, hits: [h.e.uid] } as unknown as Shot;
        g.shots.split(fake, hx, hy);
      }
      if (res.killed) g.fx.sparks(hx, hy, 6, [0x6ef4ff, 0xffffff], 160, ang, 0.6, 0.3);
    }
    if (!phantom && depth === 0 && g.build.has('rail_super') && n >= 3) {
      g.player.fireCd = 0.06;
      g.fx.text(g.player.x, g.player.y - 56, t('banner.railSuper'), 0x6ef4ff, 'small', 0.7);
      audio.play('perfect', { pitch: 1.3, vol: 0.6 });
    }
  }

  /** One beam damage tick. Returns the visual end point. */
  beamTick(x0: number, y0: number, ang: number, dmg: number, doDamage: boolean): { x: number; y: number; hitAny: boolean } {
    const g = this.g;
    const w = g.build.weapon;
    const sun = g.build.awakened && w.id === 'beam';
    const { len, hits } = this.ray(x0, y0, ang, w.range * (sun ? 1.2 : 1), sun ? 6 : 2);
    let endT = len;
    let remaining = g.build.pierce + 1;
    let hitAny = false;
    for (const h of hits) {
      const hx = x0 + Math.cos(ang) * h.t;
      const hy = y0 + Math.sin(ang) * h.t;
      if (this.shieldBlocks(h.e, hx, hy, Math.cos(ang), Math.sin(ang))) {
        endT = h.t;
        if (doDamage) this.blockFx(hx, hy);
        break;
      }
      hitAny = true;
      if (doDamage) this.damage(h.e, dmg, { source: 'beam', hx, hy, canCrit: true, knockX: Math.cos(ang) * w.knockback, procs: true });
      remaining--;
      if (remaining <= 0) {
        endT = h.t + 2;
        break;
      }
    }
    const ex = x0 + Math.cos(ang) * endT;
    const ey = y0 + Math.sin(ang) * endT;
    if (g.build.has('beam_prism')) {
      for (const da of [-0.5, 0, 0.5]) {
        const a2 = ang + da;
        const sub = this.ray(ex, ey, a2, 75);
        const first = sub.hits.find((q) => q.t > 1);
        const st = first ? first.t : sub.len;
        g.beamFx.prism.push(ex, ey, ex + Math.cos(a2) * st, ey + Math.sin(a2) * st);
        if (doDamage && first) this.damage(first.e, dmg * 0.45, { source: 'prism', canCrit: true, procs: false, quiet: false });
      }
    }
    return { x: ex, y: ey, hitAny };
  }

  shieldBlocks(e: Enemy, hx: number, hy: number, vx: number, vy: number): boolean {
    if (e.ai !== 'shield' || e.frozen > 0 || e.stun > 0 || e.dying > 0) return false;
    if (Math.sign(vx) !== -e.facing) return false;
    if (vy > Math.abs(vx) * 0.9) return false; // steep shots from above get over the shield
    if (hy < e.top + 4) return false;
    if ((hx - e.x) * e.facing < -3) return false;
    return true;
  }

  blockFx(x: number, y: number): void {
    const g = this.g;
    g.fx.sparks(x, y, 5, [0xffffff, 0x9aa4c4, 0x6ef4ff], 110, 0, Math.PI * 2, 0.15);
    audio.play('hit_block');
    if (g.run.time - this.lastBlockText > 2.5) {
      this.lastBlockText = g.run.time;
      g.fx.text(x, y - 8, t('banner.blocked'), 0x9aa4c4, 'small', 0.5);
    }
  }

  detonateExploder(e: Enemy, byPlayer: boolean): void {
    const g = this.g;
    if (e.mem.boom) return;
    e.mem.boom = 1;
    const r = 44;
    g.fx.explosion(e.x, e.y, r, [0xffe060, 0xff8a3c, 0xff3c5c]);
    g.cam.shake(0.25);
    audio.play('explosion');
    g.grid.queryCircle(e.x, e.y, r + 20, this.scratch);
    for (const q of this.scratch.slice()) {
      if (q === e || !q.alive || q.dying > 0 || !q.overlapsCircle(e.x, e.y, r)) continue;
      const res = this.damage(q, 60 * g.director.hpMul, { source: 'exploder', knockX: Math.sign(q.x - e.x || 1) * 150, canCrit: false });
      if (res.killed) q.killedByExplosion = true;
    }
    const p = g.player;
    const pr = byPlayer ? 24 : r;
    if (dist(e.x, e.y, p.x, p.y - 20) < pr + 6) p.hurt(byPlayer ? 1 : e.def.contactDmg, e.x, 'exploder');
    if (!byPlayer && e.alive && e.dying <= 0) {
      e.hp = 0;
      this.kill(e, 'exploder', false);
    }
  }

  reset(): void {
    this.blasts.length = 0;
    this.hitCounter = 0;
    this.focusUid = -1;
  }
}

export { pick };
