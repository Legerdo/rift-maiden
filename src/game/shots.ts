// Player projectiles and enemy projectiles.

import Phaser from 'phaser';
import { ARENA_W, DEPTH, GROUND_Y } from '../core/constants';
import { segmentBox, dist2, rotateToward, circleBox } from '../core/mathx';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { PLAYER } from '../data/balance';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './enemy';

export type ShotKind = 'main' | 'shard' | 'drone' | 'homing' | 'missile' | 'mini' | 'ice' | 'phantom';

export class Shot {
  active = false;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  dmg = 1;
  r = 3;
  life = 1;
  age = 0;
  pierce = 0;
  bounces = 0;
  kind: ShotKind = 'main';
  canSplit = false;
  homing = 0;
  target: Enemy | null = null;
  retarget = 0;
  hits: number[] = [];
  knock = 30;
  explodeR = 0;
  speed = 0;
  /** Lightning from split shards (f_storm). */
  storm = false;
  spr: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.spr = scene.add.image(-50, -50, 'shot_smg').setVisible(false).setDepth(DEPTH.PLAYER_SHOT);
  }
}

const TEX: Record<ShotKind, string> = {
  main: 'shot_smg',
  shard: 'shot_shard',
  drone: 'shot_drone',
  homing: 'shot_homing',
  missile: 'shot_missile',
  mini: 'shot_mini',
  ice: 'shot_ice',
  phantom: 'shot_smg',
};

interface HitCand {
  e: Enemy;
  t: number;
}

export class PlayerShots {
  g: GameScene;
  list: Shot[] = [];
  private scratch: Enemy[] = [];
  private cands: HitCand[] = [];
  static readonly MAX = 420;

  constructor(g: GameScene) {
    this.g = g;
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.list) if (s.active) n++;
    return n;
  }

  spawn(kind: ShotKind, x: number, y: number, ang: number, speed: number, dmg: number, o: Partial<Shot> & { tex?: string; scale?: number } = {}): Shot | null {
    let s = this.list.find((q) => !q.active);
    if (!s) {
      if (this.list.length >= PlayerShots.MAX) return null;
      s = new Shot(this.g);
      this.list.push(s);
    }
    s.active = true;
    s.kind = kind;
    s.x = s.px = x;
    s.y = s.py = y;
    s.vx = Math.cos(ang) * speed;
    s.vy = Math.sin(ang) * speed;
    s.speed = speed;
    s.dmg = dmg;
    s.r = o.r ?? 3;
    s.life = o.life ?? 0.6;
    s.age = 0;
    s.pierce = o.pierce ?? 0;
    s.bounces = o.bounces ?? 0;
    s.canSplit = o.canSplit ?? false;
    s.homing = o.homing ?? 0;
    s.target = o.target ?? null;
    s.retarget = 0;
    s.hits.length = 0;
    s.knock = o.knock ?? 30;
    s.explodeR = o.explodeR ?? 0;
    s.storm = o.storm ?? false;
    s.spr.setTexture(o.tex ?? TEX[kind]);
    s.spr.setVisible(true).setAlpha(1).setScale(o.scale ?? 1);
    s.spr.setBlendMode(kind === 'missile' || kind === 'mini' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    s.spr.setPosition(Math.round(x), Math.round(y)).setRotation(ang);
    if (kind === 'phantom') s.spr.setTint(0x9cf8ff);
    else s.spr.clearTint();
    return s;
  }

  kill(s: Shot): void {
    s.active = false;
    s.spr.setVisible(false);
  }

  private nearestEnemy(x: number, y: number, range: number, exclude: number[] | null, preferStrong = false): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const r2 = range * range;
    for (const e of this.g.enemies) {
      if (!e.alive || e.dying > 0 || !e.targetable) continue;
      if (exclude && exclude.includes(e.uid)) continue;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 > r2) continue;
      const score = preferStrong ? -e.hp - (e.boss ? 1e6 : 0) + d2 * 0.001 : d2;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  update(dt: number): void {
    const g = this.g;
    for (const s of this.list) {
      if (!s.active) continue;
      s.age += dt;
      s.life -= dt;
      if (s.life <= 0) {
        if (s.explodeR > 0) g.combat.explode(s.x, s.y, s.explodeR, s.dmg, 'missile');
        this.kill(s);
        continue;
      }
      // Missiles: pop up, then accelerate and home.
      if (s.kind === 'missile' || s.kind === 'mini') {
        const sp = Math.min(380, 70 + s.age * 620);
        if (s.age > 0.14) {
          s.retarget -= dt;
          if (!s.target || !s.target.alive || s.target.dying > 0 || s.retarget <= 0) {
            s.target = this.nearestEnemy(s.x, s.y, 420, null, s.kind === 'missile');
            s.retarget = 0.3;
          }
          if (s.target) {
            const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
            const cur = Math.atan2(s.vy, s.vx);
            const na = rotateToward(cur, want, 7 * dt);
            s.vx = Math.cos(na) * sp;
            s.vy = Math.sin(na) * sp;
          } else {
            const cur = Math.atan2(s.vy, s.vx);
            s.vx = Math.cos(cur) * sp;
            s.vy = Math.sin(cur) * sp;
          }
        } else {
          s.vx *= 0.9;
          s.vy *= 0.9;
        }
        if (Math.random() < 0.8) g.fx.p(s.x - s.vx * 0.02, s.y - s.vy * 0.02, rand(-10, 10), rand(-10, 10), rand(0.2, 0.4), Math.random() < 0.3 ? 0xffa040 : 0x8a8098, { size: Math.random() < 0.5 ? 2 : 1, drag: 3 });
      } else if (s.homing > 0) {
        s.retarget -= dt;
        if (s.retarget <= 0) {
          s.target = this.nearestEnemy(s.x, s.y, 150, s.hits, false);
          s.retarget = 0.12;
        }
        if (s.target && s.target.alive) {
          const want = Math.atan2(s.target.y - s.y, s.target.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          const na = rotateToward(cur, want, s.homing * dt);
          const sp = Math.hypot(s.vx, s.vy);
          s.vx = Math.cos(na) * sp;
          s.vy = Math.sin(na) * sp;
        }
      }
      s.px = s.x;
      s.py = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // World collisions
      let dead = false;
      if (s.y >= GROUND_Y - 1) {
        if (s.explodeR > 0) {
          g.combat.explode(s.x, GROUND_Y - 4, s.explodeR, s.dmg, 'missile');
          dead = true;
        } else if (s.bounces > 0) {
          s.y = GROUND_Y - 2;
          s.vy = -Math.abs(s.vy) * 0.9;
          s.bounces--;
          g.fx.sparks(s.x, GROUND_Y - 1, 3, [0xffffff, 0xffe860], 60, -Math.PI / 2, 1.5, 0.15);
        } else {
          g.fx.sparks(s.x, GROUND_Y - 1, 2, [0xffe860, 0x8a80a8], 40, -Math.PI / 2, 1.8, 0.15);
          dead = true;
        }
      } else if (s.x < 0 || s.x > ARENA_W) {
        if (s.bounces > 0) {
          s.x = s.x < 0 ? 1 : ARENA_W - 1;
          s.vx = -s.vx;
          s.bounces--;
        } else dead = true;
      } else if (s.y < -30) dead = true;
      if (dead) {
        this.kill(s);
        continue;
      }

      // Enemy collisions (swept)
      const x0 = s.px;
      const y0 = s.py;
      const dx = s.x - x0;
      const dy = s.y - y0;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      const nx = dx / len;
      const ny = dy / len;
      g.grid.query(Math.min(x0, s.x) - s.r, Math.min(y0, s.y) - s.r, Math.max(x0, s.x) + s.r, Math.max(y0, s.y) + s.r, this.scratch);
      const cands = this.cands;
      cands.length = 0;
      for (const e of this.scratch) {
        if (!e.alive || e.dying > 0 || !e.targetable) continue;
        if (s.hits.includes(e.uid)) continue;
        const t = segmentBox(x0, y0, nx, ny, len, e.x, e.y, e.hw, e.hh, s.r);
        if (t >= 0) cands.push({ e, t });
      }
      if (cands.length === 0) {
        s.spr.setPosition(Math.round(s.x), Math.round(s.y)).setRotation(Math.atan2(s.vy, s.vx));
        continue;
      }
      if (cands.length > 1) cands.sort((a, b) => a.t - b.t);
      for (const c of cands) {
        const e = c.e;
        const hx = x0 + nx * c.t;
        const hy = y0 + ny * c.t;
        if (g.combat.shieldBlocks(e, hx, hy, s.vx, s.vy)) {
          g.combat.blockFx(hx, hy);
          if (s.bounces > 0) {
            s.vx = -s.vx;
            s.bounces--;
            s.x = hx - nx * 2;
            s.y = hy;
            s.hits.push(e.uid);
          } else this.kill(s);
          break;
        }
        s.hits.push(e.uid);
        if (s.explodeR > 0) {
          g.combat.explode(hx, hy, s.explodeR, s.dmg, s.kind === 'missile' ? 'missile' : 'explosion');
          this.kill(s);
          break;
        }
        const killed = g.combat.hitByShot(s, e, hx, hy);
        if (s.pierce > 0) {
          s.pierce--;
          if (s.canSplit) this.split(s, hx, hy);
          continue;
        }
        if (killed && s.canSplit) this.split(s, hx, hy);
        if (s.bounces > 0) {
          const next = this.nearestEnemy(hx, hy, 140, s.hits, false);
          if (next) {
            const a = Math.atan2(next.y - hy, next.x - hx);
            const sp = Math.max(260, Math.hypot(s.vx, s.vy));
            s.vx = Math.cos(a) * sp;
            s.vy = Math.sin(a) * sp;
            s.x = hx;
            s.y = hy;
            s.bounces--;
            s.life = Math.max(s.life, 0.35);
            break;
          }
        }
        this.kill(s);
        break;
      }
      if (s.active) s.spr.setPosition(Math.round(s.x), Math.round(s.y)).setRotation(Math.atan2(s.vy, s.vx));
    }
  }

  /** Split a projectile into smaller shards (분열탄). */
  split(s: Shot, x: number, y: number): void {
    const n = this.g.build.splitCount;
    if (n <= 0) return;
    const base = Math.atan2(s.vy, s.vx);
    const spread = n === 2 ? 0.5 : 0.42;
    for (let i = 0; i < n; i++) {
      const a = base + ((i - (n - 1) / 2) * spread * 2) / Math.max(1, n - 1) + rand(-0.05, 0.05);
      const sh = this.spawn('shard', x, y, a, 380, s.dmg * 0.45, {
        life: 0.35,
        r: 2,
        canSplit: false,
        storm: this.g.build.has('f_storm'),
      });
      if (sh) sh.hits.push(...s.hits);
    }
  }

  clear(): void {
    for (const s of this.list) this.kill(s);
  }
}

// ---------------------------------------------------------------------------
export type EShotKind = 'orb' | 'big' | 'mortar' | 'wave' | 'debris';

export class EShot {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  r = 3;
  life = 5;
  dmg = 1;
  age = 0;
  grav = 0;
  kind: EShotKind = 'orb';
  spr: Phaser.GameObjects.Sprite;
  constructor(scene: Phaser.Scene) {
    this.spr = scene.add.sprite(-50, -50, 'e_orb', 0).setVisible(false).setDepth(DEPTH.ENEMY_SHOT);
  }
}

export class EnemyShots {
  g: GameScene;
  list: EShot[] = [];

  constructor(g: GameScene) {
    this.g = g;
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.list) if (s.active) n++;
    return n;
  }

  fire(x: number, y: number, vx: number, vy: number, kind: EShotKind, dmg: number): EShot {
    let s = this.list.find((q) => !q.active);
    if (!s) {
      s = new EShot(this.g);
      this.list.push(s);
    }
    s.active = true;
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.kind = kind;
    s.dmg = dmg;
    s.age = 0;
    s.grav = kind === 'mortar' ? 420 : kind === 'debris' ? 900 : 0;
    s.life = kind === 'wave' ? 6 : 7;
    s.r = kind === 'big' ? 5.5 : kind === 'orb' ? 3.5 : kind === 'mortar' ? 4 : kind === 'debris' ? 7 : 6;
    const tex = kind === 'big' ? 'e_orb_big' : kind === 'mortar' ? 'e_mortar' : kind === 'wave' ? 'e_wave' : kind === 'debris' ? 'debris' : 'e_orb';
    s.spr.setTexture(tex, 0).setVisible(true).setAlpha(1).setRotation(0).setScale(1);
    s.spr.setOrigin(0.5, kind === 'wave' ? 1 : 0.5);
    s.spr.setPosition(Math.round(x), Math.round(y));
    return s;
  }

  kill(s: EShot): void {
    s.active = false;
    s.spr.setVisible(false);
  }

  /** Destroy enemy bullets inside a circle (shockwave, orbit blades). */
  clearCircle(x: number, y: number, r: number, onPop?: (s: EShot) => void): number {
    let n = 0;
    for (const s of this.list) {
      if (!s.active || s.kind === 'wave' || s.kind === 'debris') continue;
      if (dist2(s.x, s.y, x, y) <= (r + s.r) * (r + s.r)) {
        this.pop(s);
        onPop?.(s);
        n++;
      }
    }
    return n;
  }

  pop(s: EShot): void {
    this.g.fx.sparks(s.x, s.y, 5, [0xffc0e0, 0xff3c8c, 0xffffff], 70, 0, Math.PI * 2, 0.2);
    this.kill(s);
  }

  update(dt: number): void {
    const g = this.g;
    const p = g.player;
    const hbY = p.y - PLAYER.hitboxHH;
    for (const s of this.list) {
      if (!s.active) continue;
      s.age += dt;
      s.life -= dt;
      if (s.life <= 0) {
        this.kill(s);
        continue;
      }
      s.vy += s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.kind === 'wave') {
        s.y = GROUND_Y;
        if (Math.random() < 0.6) g.fx.p(s.x + rand(-6, 6), GROUND_Y - rand(0, 4), rand(-20, 20), -rand(20, 60), 0.3, Math.random() < 0.5 ? 0xff3c8c : 0xffc0e0, { add: true, grav: 200 });
        if (s.x < -20 || s.x > ARENA_W + 20) {
          this.kill(s);
          continue;
        }
      } else if (s.kind === 'mortar' || s.kind === 'debris') {
        if (s.kind === 'debris') s.spr.rotation += dt * 6;
        if (s.y >= GROUND_Y - 4) {
          const r = s.kind === 'mortar' ? 26 : 20;
          g.fx.explosion(s.x, GROUND_Y - 6, r, [0xff8ab0, 0xff3c8c, 0x6a0c2c]);
          g.cam.shake(0.12);
          audio.play(s.kind === 'mortar' ? 'explosion_small' : 'debris', { vol: 0.7 });
          if (circleBox(s.x, GROUND_Y - 4, r, p.x, hbY, 6, PLAYER.hitboxHH - 2)) p.hurt(s.dmg, s.x, s.kind);
          if (s.kind === 'debris') g.combat.explode(s.x, GROUND_Y - 6, r, 40 * g.director.hpMul, 'debris', true);
          this.kill(s);
          continue;
        }
      } else if (s.y > GROUND_Y + 4 || s.y < -80 || s.x < -40 || s.x > ARENA_W + 40) {
        this.kill(s);
        continue;
      }
      // hit player (waves only hurt when the player is standing low)
      const cy = s.kind === 'wave' ? GROUND_Y - 6 : s.y;
      if (circleBox(s.x, cy, s.kind === 'wave' ? 5 : s.r, p.x, hbY, 5, PLAYER.hitboxHH - 3)) {
        if (p.hurt(s.dmg, s.x, s.kind)) {
          if (s.kind !== 'wave') this.kill(s);
        }
        if (!s.active) continue;
      }
      s.spr.setPosition(Math.round(s.x), Math.round(s.y));
      if (s.kind === 'orb' || s.kind === 'big' || s.kind === 'mortar' || s.kind === 'wave') s.spr.setFrame(Math.floor(s.age * 10) % 2);
    }
  }

  clear(): void {
    for (const s of this.list) this.kill(s);
  }
}
