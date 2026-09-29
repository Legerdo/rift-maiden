// Resource drops: pop out -> float -> get pulled in -> collected with a rising
// pitch chain so vacuuming a pile of crystals sounds great.

import Phaser from 'phaser';
import { ARENA_W, DEPTH, GROUND_Y } from '../core/constants';
import { rand } from '../core/rng';
import { dist } from '../core/mathx';
import { audio } from '../audio/audio';
import { PLAYER } from '../data/balance';
import { hasMeta, metaLv } from '../core/app';
import { t } from '../localization/i18n';
import type { GameScene } from '../scenes/GameScene';

export type PickKind = 'xp' | 'shard' | 'heal' | 'core';

class Pickup {
  active = false;
  kind: PickKind = 'xp';
  value = 1;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  age = 0;
  attract = false;
  speed = 0;
  resting = false;
  spr: Phaser.GameObjects.Sprite;
  tex = 'xp_s';
  constructor(scene: Phaser.Scene) {
    this.spr = scene.add.sprite(-50, -50, 'xp_s', 0).setVisible(false).setDepth(DEPTH.PICKUP);
  }
}

export class Pickups {
  g: GameScene;
  list: Pickup[] = [];
  vacuum = false;
  private chain = 0;
  private chainT = 0;

  constructor(g: GameScene) {
    this.g = g;
  }

  get magnetRadius(): number {
    return PLAYER.magnetRadius * this.g.build.magnetMul * (1 + 0.3 * metaLv('b_magnet'));
  }

  private spawn(kind: PickKind, x: number, y: number, value: number, tex: string): Pickup {
    let p = this.list.find((q) => !q.active);
    if (!p) {
      p = new Pickup(this.g);
      this.list.push(p);
    }
    p.active = true;
    p.kind = kind;
    p.value = value;
    p.x = x;
    p.y = Math.min(y, GROUND_Y - 6);
    const a = -Math.PI / 2 + rand(-1.1, 1.1);
    const s = rand(70, 150);
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.age = 0;
    p.attract = false;
    p.speed = 0;
    p.resting = false;
    p.tex = tex;
    p.spr.setTexture(tex, 0).setVisible(true).setAlpha(1).setScale(1);
    p.spr.setDepth(kind === 'xp' ? DEPTH.PICKUP : DEPTH.PICKUP + 1);
    return p;
  }

  xp(x: number, y: number, amount: number): void {
    let left = Math.max(1, Math.round(amount));
    let guard = 0;
    while (left > 0 && guard++ < 24) {
      if (left >= 20) {
        this.spawn('xp', x, y, 20, 'xp_l');
        left -= 20;
      } else if (left >= 5) {
        this.spawn('xp', x, y, 5, 'xp_m');
        left -= 5;
      } else {
        this.spawn('xp', x, y, left >= 2 ? 2 : 1, 'xp_s');
        left -= left >= 2 ? 2 : 1;
      }
    }
    if (left > 0) this.spawn('xp', x, y, left, 'xp_l');
  }

  shard(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) this.spawn('shard', x, y, 1, 'shard');
  }

  heal(x: number, y: number): void {
    this.spawn('heal', x, y, 1, 'heal');
  }

  /** Crystal falling from the sky (결정 비 event). */
  rain(x: number, value: number): void {
    const p = this.spawn('xp', x, -8, value, value >= 5 ? 'xp_m' : 'xp_s');
    p.y = -8;
    p.vx = rand(-15, 15);
    p.vy = rand(60, 130);
  }

  core(x: number, y: number): void {
    const p = this.spawn('core', x, y, 1, 'core');
    p.vy = -180;
    p.vx = rand(-30, 30);
  }

  update(dt: number): void {
    const g = this.g;
    const pl = g.player;
    const px = pl.x;
    const py = pl.y - 18;
    const mr = this.magnetRadius;
    const autoXp = g.build.magnetAuto;
    const autoCollect = hasMeta('g_autocollect');
    this.chainT -= dt;
    if (this.chainT <= 0) this.chain = 0;
    for (const p of this.list) {
      if (!p.active) continue;
      p.age += dt;
      const d = dist(p.x, p.y, px, py);
      if (!p.attract && !pl.dead) {
        if (d < mr || this.vacuum) p.attract = true;
        else if (p.kind === 'xp' && p.age > 0.35 && autoXp) p.attract = true;
        else if (p.kind === 'xp' && p.age > (autoCollect ? 2 : PLAYER.autoCollectDelay)) p.attract = true;
      }
      if (p.attract && !pl.dead) {
        p.speed = Math.min(560, p.speed + 1000 * dt);
        const a = Math.atan2(py - p.y, px - p.x);
        const tvx = Math.cos(a) * p.speed;
        const tvy = Math.sin(a) * p.speed;
        const k = Math.min(1, dt * 10);
        p.vx += (tvx - p.vx) * k;
        p.vy += (tvy - p.vy) * k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (Math.random() < 0.3) g.fx.p(p.x, p.y, 0, 0, 0.15, p.kind === 'xp' ? 0x6cff9c : 0xffd24a, { add: true });
        if (d < PLAYER.pickupRadius + 4) {
          this.collect(p);
          continue;
        }
      } else if (!p.resting) {
        p.vy += 480 * dt;
        p.vx *= 1 - 2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const floor = GROUND_Y - 8;
        if (p.y >= floor) {
          p.y = floor;
          if (Math.abs(p.vy) < 50) {
            p.resting = true;
            p.vy = 0;
          } else p.vy *= -0.45;
          p.vx *= 0.6;
        }
        p.x = Math.max(6, Math.min(ARENA_W - 6, p.x));
      }
      const bob = p.resting ? Math.round(Math.sin(p.age * 4 + p.x) * 1.5) - 2 : 0;
      p.spr.setPosition(Math.round(p.x), Math.round(p.y + bob));
      p.spr.setFrame(Math.floor(p.age * (p.kind === 'core' ? 10 : 3)) % (p.kind === 'core' ? 4 : 2));
      if (p.kind === 'xp' && p.age > 26) {
        p.spr.setVisible(Math.floor(p.age * 10) % 2 === 0);
        if (p.age > 30) {
          p.active = false;
          p.spr.setVisible(false);
        }
      }
    }
  }

  private collect(p: Pickup): void {
    const g = this.g;
    p.active = false;
    p.spr.setVisible(false);
    this.chain = Math.min(14, this.chain + 1);
    this.chainT = 0.35;
    const pitch = Math.pow(2, this.chain / 14);
    switch (p.kind) {
      case 'xp':
        g.addXp(p.value);
        audio.play('pickup_xp', { pitch, vary: 0.01, vol: 0.7 });
        break;
      case 'shard':
        g.run.shardsPicked += p.value;
        g.hudPulse('shard');
        audio.play('pickup_shard', { pitch: 0.9 + this.chain * 0.03 });
        break;
      case 'heal':
        g.player.heal(1);
        audio.play('pickup_heal');
        break;
      case 'core':
        g.run.pendingCores++;
        g.fx.text(g.player.x, g.player.y - 60, t('banner.core'), 0xffcf4a, 'body', 1.0);
        audio.play('pickup_core');
        break;
    }
    g.fx.glow(g.player.x, g.player.y - 18, 2, p.kind === 'xp' ? 0x6cff9c : 0xffd24a, 30, 0.25);
  }

  /** Pull everything to the player (zone clear). */
  vacuumAll(on: boolean): void {
    this.vacuum = on;
  }

  clear(): void {
    for (const p of this.list) {
      p.active = false;
      p.spr.setVisible(false);
    }
  }
}
