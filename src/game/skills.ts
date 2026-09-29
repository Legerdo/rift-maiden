// Active skills on Q / E.

import Phaser from 'phaser';
import { DEPTH, GROUND_Y, ARENA_W } from '../core/constants';
import { clamp, dist } from '../core/mathx';
import { rand } from '../core/rng';
import { SKILLS, type SkillId } from '../data/skills';
import { audio } from '../audio/audio';
import { t } from '../localization/i18n';
import type { GameScene } from '../scenes/GameScene';

interface Strike {
  x: number;
  t: number;
  ticks: number;
  tickT: number;
  power: number;
}

interface Sing {
  x: number;
  y: number;
  t: number;
  tickT: number;
  power: number;
  spr: Phaser.GameObjects.Sprite;
}

export class Skills {
  g: GameScene;
  slots: [SkillId, SkillId];
  cd: [number, number] = [0, 0];
  private echoes: { id: SkillId; t: number }[] = [];
  private strikes: Strike[] = [];
  private sings: Sing[] = [];
  private gfx: Phaser.GameObjects.Graphics;

  constructor(g: GameScene, a: SkillId, b: SkillId) {
    this.g = g;
    this.slots = [a, b];
    this.gfx = g.add.graphics().setDepth(DEPTH.PARTICLE_ADD).setBlendMode(Phaser.BlendModes.ADD);
  }

  cooldownOf(i: number): number {
    return SKILLS[this.slots[i]].cooldown * this.g.build.skillCdMul;
  }

  cdFrac(i: number): number {
    return clamp(this.cd[i] / this.cooldownOf(i), 0, 1);
  }

  cast(i: number): void {
    const g = this.g;
    if (g.player.dead || g.player.victory) return;
    if (this.cd[i] > 0) {
      audio.play('ui_error', { vol: 0.35 });
      return;
    }
    const id = this.slots[i];
    this.exec(id, 1);
    this.cd[i] = this.cooldownOf(i);
    g.tutorial.done('skill');
    if (g.build.has('skill_echo')) this.echoes.push({ id, t: 1 });
  }

  private exec(id: SkillId, power: number): void {
    const g = this.g;
    const p = g.player;
    const hpMul = g.director.hpMul;
    p.skillPoseT = 0.32;
    switch (id) {
      case 'shockwave': {
        const plus = g.build.has('sk_shock_plus');
        const R = plus ? 148 : 118;
        g.fx.ring(p.x, p.centerY, 8, R, 0.35, 0x6ef4ff, 3);
        g.fx.ring(p.x, p.centerY, 4, R * 0.7, 0.3, 0xffffff, 1);
        g.fx.sparks(p.x, p.centerY, 26, [0x6ef4ff, 0xffffff], 260, 0, Math.PI * 2, 0.35);
        const popped = g.eshots.clearCircle(p.x, p.centerY, R, (s) => g.fx.glow(s.x, s.y, 3, 0x6cff9c, 30, 0.3));
        if (popped > 0) g.addXp(Math.ceil(popped * 0.5));
        let zapped = 0;
        for (const e of g.enemies.slice()) {
          if (!e.alive || e.dying > 0 || !e.targetable) continue;
          if (dist(e.x, e.y, p.x, p.centerY) > R + e.hw) continue;
          if (!e.boss) e.stun = Math.max(e.stun, 0.45);
          g.combat.damage(e, 32 * hpMul * power, { source: 'skill', canCrit: false, knockX: Math.sign(e.x - p.x || 1) * 300 * power });
          if (plus && zapped < 6 && e.alive && e.dying <= 0) {
            zapped++;
            g.fx.lightning(p.x, p.centerY, e.x, e.y);
            g.combat.damage(e, 16 * hpMul * power, { source: 'chain', canCrit: true, procs: false });
          }
        }
        if (zapped > 0) audio.play('lightning');
        p.iframes = Math.max(p.iframes, 0.4);
        g.hitstop(60);
        g.cam.shake(0.35 * power);
        g.cam.punch(0.035 * power);
        audio.play('shockwave', { vol: power });
        break;
      }
      case 'overdrive': {
        p.overdriveT = Math.max(p.overdriveT, 6 * power);
        if (power >= 1) p.odExtended = 0;
        g.fx.ring(p.x, p.centerY, 4, 46, 0.4, 0xffe860, 2);
        g.fx.sparks(p.x, p.centerY, 20, [0xffe860, 0xffa040, 0xffffff], 180);
        if (power >= 1) g.fx.text(p.x, p.y - 60, t('banner.overdrive'), 0xffe860, 'body', 0.9);
        g.cam.punch(0.02);
        audio.play('overdrive');
        break;
      }
      case 'orbital': {
        const x = clamp(p.aimX, 20, ARENA_W - 20);
        g.telegraph.column(x, 44, 0.45, 0x6ef4ff);
        this.strikes.push({ x, t: -0.45, ticks: 6, tickT: 0, power });
        if (g.build.has('sk_orb_plus')) {
          for (const [dx, delay] of [
            [-64, 0.65],
            [64, 0.85],
          ]) {
            const sx = clamp(x + dx, 20, ARENA_W - 20);
            g.telegraph.column(sx, 44, delay, 0x6ef4ff);
            this.strikes.push({ x: sx, t: -delay, ticks: 6, tickT: 0, power: power * 0.8 });
          }
        }
        audio.play('laser_charge', { pitch: 1.6, vol: 0.5 });
        break;
      }
      case 'singularity': {
        const x = clamp(p.aimX, 20, ARENA_W - 20);
        const y = clamp(p.aimY, 50, GROUND_Y - 20);
        const spr = g.add.sprite(x, y, 'singularity', 0).setDepth(DEPTH.PARTICLE_ADD).setBlendMode(Phaser.BlendModes.ADD).setScale(2);
        this.sings.push({ x, y, t: 0, tickT: 0, power, spr });
        audio.play('singularity', { vol: power });
        g.fx.ring(x, y, 40, 4, 0.4, 0xc890ff, 2);
        break;
      }
    }
  }

  update(dt: number): void {
    const g = this.g;
    this.cd[0] = Math.max(0, this.cd[0] - dt);
    this.cd[1] = Math.max(0, this.cd[1] - dt);
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.t -= dt;
      if (e.t <= 0) {
        this.echoes.splice(i, 1);
        this.exec(e.id, 0.6);
      }
    }
    const gfx = this.gfx;
    gfx.clear();
    const hpMul = g.director.hpMul;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      if (s.t < 0) continue;
      if (s.ticks > 0) {
        s.tickT -= dt;
        if (s.tickT <= 0) {
          s.tickT = 0.08;
          s.ticks--;
          if (s.ticks === 5) {
            g.cam.shake(0.4 * s.power);
            g.cam.punch(0.03);
            audio.play('laser_fire', { vol: s.power });
            g.flash(0xbff8ff, 0.25);
          }
          for (const e of g.enemies.slice()) {
            if (!e.alive || e.dying > 0 || !e.targetable) continue;
            if (Math.abs(e.x - s.x) > 22 + e.hw) continue;
            g.combat.damage(e, 22 * hpMul * s.power, { source: 'skill', hx: s.x, hy: e.y, canCrit: true });
          }
          g.fx.sparks(s.x, GROUND_Y - 2, 8, [0x6ef4ff, 0xffffff], 200, -Math.PI / 2, 2.2, 0.3);
        }
      }
      const life = 0.6;
      const k = 1 - clamp(s.t / life, 0, 1);
      const w = Math.round(40 * k * s.power);
      if (w > 0) {
        gfx.fillStyle(0x6ef4ff, 0.6 * k);
        gfx.fillRect(Math.round(s.x - w / 2), 0, w, GROUND_Y);
        gfx.fillStyle(0xffffff, 0.9 * k);
        gfx.fillRect(Math.round(s.x - w / 4), 0, Math.max(1, Math.round(w / 2)), GROUND_Y);
      }
      if (s.t > life) this.strikes.splice(i, 1);
    }
    for (let i = this.sings.length - 1; i >= 0; i--) {
      const s = this.sings[i];
      s.t += dt;
      s.spr.setFrame(Math.floor(s.t * 14) % 4).setScale(s.t > 2.2 ? 2 - (s.t - 2.2) * 5 : 2);
      const R = 130 * s.power;
      for (const e of g.enemies) {
        if (!e.alive || e.dying > 0 || e.boss || e.external) continue;
        const d = dist(e.x, e.y, s.x, s.y);
        if (d > R || d < 2) continue;
        const pull = (1 - d / R) * 260 + 40;
        e.x += ((s.x - e.x) / d) * pull * dt;
        if (e.def.flying) e.y += ((s.y - e.y) / d) * pull * dt;
      }
      if (Math.random() < 0.7) {
        const a = rand(0, Math.PI * 2);
        g.fx.p(s.x + Math.cos(a) * R * 0.6, s.y + Math.sin(a) * R * 0.6, -Math.cos(a) * 90, -Math.sin(a) * 90, 0.5, 0xc890ff, { add: true });
      }
      if (g.build.has('sk_sing_plus')) g.eshots.clearCircle(s.x, s.y, R * 0.6);
      s.tickT -= dt;
      if (s.tickT <= 0) {
        s.tickT = 0.25;
        for (const e of g.enemies.slice()) {
          if (!e.alive || e.dying > 0 || !e.targetable) continue;
          if (dist(e.x, e.y, s.x, s.y) < 40) g.combat.damage(e, 5 * hpMul * s.power, { source: 'skill', canCrit: false, quiet: true });
        }
      }
      if (s.t >= 2.4) {
        const big = g.build.has('sk_sing_plus') ? 1.5 : 1;
        g.combat.explode(s.x, s.y, 72 * big * Math.max(0.7, s.power), 75 * hpMul * s.power, 'skill');
        g.fx.ring(s.x, s.y, 10, 90, 0.4, 0xc890ff, 3);
        g.hitstop(50);
        g.cam.punch(0.03);
        s.spr.destroy();
        this.sings.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.strikes.length = 0;
    for (const s of this.sings) s.spr.destroy();
    this.sings.length = 0;
    this.echoes.length = 0;
  }
}
