// Automation layer: support drones, missile pods and orbit blades. They take
// over chores (small fry, bullets) so the player can focus on priorities.

import Phaser from 'phaser';
import { DEPTH, GROUND_Y } from '../core/constants';
import { damp, dist2 } from '../core/mathx';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './enemy';

interface Drone {
  x: number;
  y: number;
  cd: number;
  aiCd: number;
  legionCd: number;
  spr: Phaser.GameObjects.Sprite;
  ang: number;
}

const THREAT_BONUS: Record<string, number> = {
  summoner: 400,
  gunner: 260,
  watcher: 240,
  exploder: 300,
  rift: 200,
};

export class Automation {
  g: GameScene;
  drones: Drone[] = [];
  private missileT = 1.5;
  overdriveStacks = 0;
  private overdriveT = 0;
  private blades: Phaser.GameObjects.Image[] = [];
  private bladeAng = 0;
  private t = 0;
  private turrets: { x: number; y: number; life: number; cd: number; ang: number; spr: Phaser.GameObjects.Sprite }[] = [];
  private sentryT = 2;

  constructor(g: GameScene) {
    this.g = g;
  }

  onKill(): void {
    if (this.g.build.has('drone_overdrive')) {
      this.overdriveStacks = Math.min(10, this.overdriveStacks + 1);
      this.overdriveT = 4;
    }
  }

  private pickTarget(x: number, y: number, range: number, smart: boolean): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const r2 = range * range;
    for (const e of this.g.enemies) {
      if (!e.alive || e.dying > 0 || !e.targetable) continue;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 > r2) continue;
      let score = d2;
      if (smart) score -= (THREAT_BONUS[e.ai] ?? 0) * 180 + (e.isElite ? 30000 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  update(dt: number): void {
    const g = this.g;
    const b = g.build;
    const p = g.player;
    this.t += dt;

    // ---- drones
    const want = p.dead ? 0 : b.drones;
    while (this.drones.length < want) {
      const spr = g.add.sprite(p.x, p.y - 50, 'drone', 0).setDepth(DEPTH.PLAYER_FRONT + 1);
      this.drones.push({ x: p.x, y: p.y - 40, cd: rand(0, 0.3), aiCd: 0, legionCd: rand(1, 3), spr, ang: 0 });
      g.fx.ring(p.x, p.y - 50, 2, 18, 0.3, 0x9cff8a, 1);
    }
    while (this.drones.length > want) this.drones.pop()?.spr.destroy();
    this.overdriveT -= dt;
    if (this.overdriveT <= 0) this.overdriveStacks = Math.max(0, this.overdriveStacks - dt * 4);
    const rateMul = 1 + this.overdriveStacks * 0.12;
    const smart = b.has('drone_ai');
    const n = this.drones.length;
    this.drones.forEach((d, i) => {
      const tx = p.x - p.facing * (16 + i * 11);
      const ty = p.y - 52 - (i % 2) * 9 + Math.sin(this.t * 3 + i * 1.7) * 3;
      d.x += (tx - d.x) * damp(7, dt);
      d.y += (ty - d.y) * damp(7, dt);
      d.cd -= dt;
      const target = this.pickTarget(d.x, d.y, 240, smart);
      if (target) d.ang = Math.atan2(target.y - d.y, target.x - d.x);
      if (target && d.cd <= 0) {
        d.cd = 1 / (2.7 * rateMul);
        g.shots.spawn('drone', d.x, d.y, d.ang + rand(-0.04, 0.04), 430, 5.5, { life: 0.6, r: 2, knock: 12 });
        g.fx.p(d.x + Math.cos(d.ang) * 6, d.y + Math.sin(d.ang) * 6, 0, 0, 0.06, 0xe0ffd8, { add: true, size: 2 });
      }
      // tactical AI: shoot down bullets close to the player
      if (smart) {
        d.aiCd -= dt;
        if (d.aiCd <= 0) {
          let best = null as null | (typeof g.eshots.list)[number];
          let bd = 80 * 80;
          for (const s of g.eshots.list) {
            if (!s.active || s.kind === 'wave' || s.kind === 'debris') continue;
            const d2 = dist2(s.x, s.y, p.x, p.centerY);
            if (d2 < bd) {
              bd = d2;
              best = s;
            }
          }
          if (best) {
            d.aiCd = 0.45;
            g.fx.line([d.x, d.y, best.x, best.y], 0x9cff8a, 1, 0.08);
            g.eshots.pop(best);
          } else d.aiCd = 0.1;
        }
      }
      if (b.has('f_legion')) {
        d.legionCd -= dt;
        if (d.legionCd <= 0) {
          d.legionCd = 4;
          g.shots.spawn('mini', d.x, d.y, -Math.PI / 2 + rand(-0.6, 0.6), 110, 14, { life: 1.8, r: 3, explodeR: 16 });
          audio.play('missile', { pitch: 1.6, vol: 0.4 });
        }
      }
      d.spr.setPosition(Math.round(d.x), Math.round(d.y)).setFrame(Math.floor(this.t * 20 + i) % 2).setFlipX(Math.cos(d.ang) < 0);
      if (this.overdriveStacks > 3) d.spr.setTint(0xff9a9a);
      else d.spr.clearTint();
      if (n === 0) d.spr.setVisible(false);
    });

    // ---- missile pod
    const mc = b.missileCount;
    if (mc > 0 && !p.dead) {
      this.missileT -= dt;
      if (this.missileT <= 0 && g.enemies.some((e) => e.alive && e.dying <= 0 && e.targetable)) {
        this.missileT = b.missileInterval;
        for (let i = 0; i < mc; i++) {
          const a = -Math.PI / 2 - p.facing * 0.5 + (i - (mc - 1) / 2) * 0.35;
          g.shots.spawn('missile', p.x - p.facing * 6, p.y - 40, a, 120, 30, { life: 2.6, r: 3, explodeR: 26 });
        }
        audio.play('missile');
      }
    }

    // ---- sentry turrets: planted where the player stands -> positioning matters
    if (b.sentryMax > 0 && !p.dead) {
      this.sentryT -= dt;
      if (this.sentryT <= 0 && p.grounded) {
        this.sentryT = b.sentryInterval;
        while (this.turrets.length >= b.sentryMax) this.turrets.shift()?.spr.destroy();
        const spr = g.add.sprite(p.x, GROUND_Y, 'turret', 0).setOrigin(0.5, 1).setDepth(DEPTH.PLAYER_BACK - 1);
        this.turrets.push({ x: p.x, y: GROUND_Y - 10, life: 12, cd: 0.3, ang: 0, spr });
        g.fx.dust(p.x, GROUND_Y, 6);
        g.fx.ring(p.x, GROUND_Y - 8, 2, 20, 0.25, 0x9cff8a, 1);
        audio.play('shield_block', { vol: 0.35, pitch: 1.8 });
      }
    }
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const tu = this.turrets[i];
      tu.life -= dt;
      tu.cd -= dt;
      if (tu.life <= 0) {
        g.fx.sparks(tu.x, tu.y, 8, [0x9cff8a, 0xffffff], 90);
        tu.spr.destroy();
        this.turrets.splice(i, 1);
        continue;
      }
      const target = this.pickTarget(tu.x, tu.y, 230, true);
      if (target) {
        tu.ang = Math.atan2(target.y - tu.y, target.x - tu.x);
        if (tu.cd <= 0) {
          tu.cd = 0.3 / rateMul;
          g.shots.spawn('drone', tu.x + Math.cos(tu.ang) * 8, tu.y + Math.sin(tu.ang) * 8, tu.ang + rand(-0.03, 0.03), 440, 7, { life: 0.6, r: 2, knock: 16 });
        }
      }
      tu.spr.setFrame(tu.cd > 0.2 ? 1 : 0).setFlipX(Math.cos(tu.ang) < 0).setAlpha(tu.life < 2 && Math.floor(tu.life * 8) % 2 === 0 ? 0.4 : 1);
    }

    // ---- orbit blades
    const nb = p.dead ? 0 : b.orbitBlades;
    while (this.blades.length < nb) this.blades.push(g.add.image(p.x, p.y, 'orbit_blade').setDepth(DEPTH.PLAYER_FRONT + 1).setBlendMode(Phaser.BlendModes.ADD));
    while (this.blades.length > nb) this.blades.pop()?.destroy();
    if (nb > 0) {
      this.bladeAng += b.orbitSpeed * dt;
      const cx = p.x;
      const cy = p.centerY;
      this.blades.forEach((bl, i) => {
        const a = this.bladeAng + (i / nb) * Math.PI * 2;
        const x = cx + Math.cos(a) * 30;
        const y = cy + Math.sin(a) * 24;
        bl.setPosition(Math.round(x), Math.round(y)).setRotation(a + Math.PI / 2);
        g.eshots.clearCircle(x, y, 5);
        for (const e of g.enemies) {
          if (!e.alive || e.dying > 0 || !e.targetable) continue;
          if (!e.overlapsCircle(x, y, 6)) continue;
          const key = `ob${i}`;
          const until = e.mem[key] ?? 0;
          if (g.run.time < until) continue;
          e.mem[key] = g.run.time + 0.3;
          g.combat.damage(e, 12, { source: 'orbit', hx: x, hy: y, canCrit: true, knockX: Math.sign(e.x - cx) * 60 });
        }
      });
    }
  }

  clearTurrets(): void {
    for (const tu of this.turrets) tu.spr.destroy();
    this.turrets.length = 0;
  }

  clear(): void {
    this.clearTurrets();
    for (const d of this.drones) d.spr.destroy();
    this.drones.length = 0;
    for (const b of this.blades) b.destroy();
    this.blades.length = 0;
  }
}
