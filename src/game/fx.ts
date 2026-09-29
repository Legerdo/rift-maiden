// Effects: pixel particles, sprite effects, lines/rings, damage numbers and
// floating text. Particles are plain rects drawn into Graphics layers so they
// stay pixel-crisp and cheap. Intensity is always scaled by the event's power.

import Phaser from 'phaser';
import { DEPTH, GROUND_Y } from '../core/constants';
import { rand, pick } from '../core/rng';
import { store } from '../core/app';
import { txt } from '../ui/ui';
import { cssHex } from '../art/pixel';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  grav: number;
  drag: number;
  add: boolean;
  shrink: boolean;
  streak: boolean;
  bounce: boolean;
}

interface AnimFx {
  spr: Phaser.GameObjects.Sprite;
  frames: number;
  fps: number;
  t: number;
  vx: number;
  vy: number;
  active: boolean;
  fade: boolean;
  life: number;
}

interface LineFx {
  pts: number[];
  color: number;
  width: number;
  life: number;
  max: number;
  core: number;
}

interface RingFx {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: number;
  width: number;
}

interface DmgNum {
  t: Phaser.GameObjects.BitmapText;
  life: number;
  max: number;
  vy: number;
  uid: number;
  value: number;
  active: boolean;
  big: boolean;
  x: number;
  y: number;
}

interface FloatText {
  t: Phaser.GameObjects.Text;
  life: number;
  max: number;
  vy: number;
  active: boolean;
}

interface Ghost {
  spr: Phaser.GameObjects.Sprite;
  life: number;
  max: number;
  active: boolean;
  a0: number;
}

const MAX_PARTICLES = 1100;

export class Fx {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Graphics;
  private ga: Phaser.GameObjects.Graphics;
  private gl: Phaser.GameObjects.Graphics;
  private parts: Particle[] = [];
  private free: Particle[] = [];
  private anims: AnimFx[] = [];
  private lines: LineFx[] = [];
  private rings: RingFx[] = [];
  private nums: DmgNum[] = [];
  private texts: FloatText[] = [];
  private ghosts: Ghost[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(DEPTH.PARTICLE);
    this.ga = scene.add.graphics().setDepth(DEPTH.PARTICLE_ADD).setBlendMode(Phaser.BlendModes.ADD);
    this.gl = scene.add.graphics().setDepth(DEPTH.PARTICLE_ADD + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  get particleCount(): number {
    return this.parts.length;
  }

  // ------------------------------------------------------------------ spawn
  p(x: number, y: number, vx: number, vy: number, life: number, color: number, o: Partial<Particle> = {}): void {
    if (this.parts.length >= MAX_PARTICLES) return;
    const q = this.free.pop() ?? ({} as Particle);
    q.x = x;
    q.y = y;
    q.vx = vx;
    q.vy = vy;
    q.life = life;
    q.max = life;
    q.color = color;
    q.size = o.size ?? 1;
    q.grav = o.grav ?? 0;
    q.drag = o.drag ?? 0;
    q.add = o.add ?? false;
    q.shrink = o.shrink ?? false;
    q.streak = o.streak ?? false;
    q.bounce = o.bounce ?? false;
    this.parts.push(q);
  }

  /** Radial burst of sparks. */
  sparks(x: number, y: number, n: number, colors: number[], speed: number, angle = 0, spread = Math.PI * 2, life = 0.25): void {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * rand(0.4, 1.1);
      this.p(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.2), pick(colors), {
        add: true,
        drag: 5,
        streak: s > 120,
        size: Math.random() < 0.25 ? 2 : 1,
      });
    }
  }

  /** Chunky debris that falls and bounces. */
  debris(x: number, y: number, colors: number[], n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = rand(60, 170) * power;
      this.p(x + rand(-4, 4), y + rand(-4, 4), Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.0), pick(colors), {
        grav: 520,
        drag: 1,
        size: Math.random() < 0.4 ? 2 : Math.random() < 0.2 ? 3 : 1,
        bounce: true,
      });
    }
  }

  dust(x: number, y: number, n: number, dir = 0): void {
    for (let i = 0; i < n; i++) {
      const vx = (dir !== 0 ? -dir * rand(20, 70) : rand(-50, 50)) + rand(-10, 10);
      this.p(x + rand(-4, 4), y - rand(0, 2), vx, -rand(8, 30), rand(0.25, 0.5), pick([0x8a80a8, 0x6a6088, 0xa8a0c0]), {
        drag: 4,
        size: Math.random() < 0.5 ? 2 : 1,
      });
    }
  }

  shell(x: number, y: number, facing: number): void {
    this.p(x, y, -facing * rand(40, 80), -rand(70, 120), rand(0.5, 0.8), pick([0xffd060, 0xc89a3c]), {
      grav: 600,
      bounce: true,
      size: 1,
    });
  }

  glow(x: number, y: number, n: number, color: number, speed = 40, life = 0.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.2, 1) * speed;
      this.p(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.2), color, { add: true, drag: 2, size: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  anim(key: string, x: number, y: number, frames: number, fps: number, o: { rot?: number; scale?: number; add?: boolean; depth?: number; flipX?: boolean; vx?: number; vy?: number; fade?: boolean; tint?: number } = {}): Phaser.GameObjects.Sprite {
    let a = this.anims.find((q) => !q.active);
    if (!a) {
      const spr = this.scene.add.sprite(0, 0, key, 0);
      a = { spr, frames: 1, fps: 1, t: 0, vx: 0, vy: 0, active: false, fade: false, life: 0 };
      this.anims.push(a);
    }
    a.spr.setTexture(key, 0);
    a.spr.setPosition(x, y);
    a.spr.setRotation(o.rot ?? 0);
    a.spr.setScale(o.scale ?? 1);
    a.spr.setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    a.spr.setDepth(o.depth ?? DEPTH.PARTICLE);
    a.spr.setFlipX(!!o.flipX);
    a.spr.setAlpha(1);
    if (o.tint !== undefined) a.spr.setTint(o.tint);
    else a.spr.clearTint();
    a.spr.setVisible(true).setActive(true);
    a.frames = frames;
    a.fps = fps;
    a.t = 0;
    a.vx = o.vx ?? 0;
    a.vy = o.vy ?? 0;
    a.fade = !!o.fade;
    a.life = frames / fps;
    a.active = true;
    return a.spr;
  }

  hitSpark(x: number, y: number, power: number, angle: number, color = 0xfff0a0): void {
    this.anim('hit_spark', x, y, 4, 40, { add: true, depth: DEPTH.PARTICLE_ADD, rot: Math.random() < 0.5 ? 0 : Math.PI / 4, scale: power > 2.5 ? 2 : 1 });
    const n = Math.min(12, Math.round(2 + power * 2));
    this.sparks(x, y, n, [0xffffff, color, 0xffe860], 90 + power * 40, angle, 1.6, 0.18 + power * 0.03);
  }

  explosion(x: number, y: number, radius: number, colors: number[] = [0xffe860, 0xffa040, 0xe0503a]): void {
    // Keep the screen readable: only a handful of full explosion sprites at once.
    let live = 0;
    for (const a of this.anims) if (a.active && a.spr.texture.key === 'explosion') live++;
    if (live >= 7 && radius < 50) {
      this.ring(x, y, radius * 0.3, radius, 0.18, 0xffe0a0, 1);
      this.sparks(x, y, 5, [0xffffff, ...colors], 100, 0, Math.PI * 2, 0.2);
      return;
    }
    const scale = radius > 44 ? 2 : 1;
    this.anim('explosion', x, y, 7, 22, { add: false, depth: DEPTH.PARTICLE_ADD, scale, rot: pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) });
    this.ring(x, y, radius * 0.3, radius * 1.15, 0.22, 0xfff0c0, 2);
    this.sparks(x, y, Math.round(8 + radius * 0.3), [0xffffff, ...colors], 120 + radius * 3, 0, Math.PI * 2, 0.3);
    this.debris(x, y, [0x4a3a4a, 0x2a2030, colors[1]], Math.round(3 + radius * 0.1), 0.9);
    for (let i = 0; i < 3; i++) this.anim('smoke', x + rand(-radius * 0.5, radius * 0.5), y + rand(-radius * 0.4, radius * 0.2), 4, 7, { vy: -18, depth: DEPTH.PARTICLE, fade: true });
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: number, width = 1): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  line(pts: number[], color: number, width: number, life: number, core = 0xffffff): void {
    this.lines.push({ pts, color, width, life, max: life, core });
  }

  lightning(x0: number, y0: number, x1: number, y1: number, color = 0xb8f4ff): void {
    const pts: number[] = [x0, y0];
    const segs = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 10));
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push(x0 + (x1 - x0) * t + rand(-5, 5), y0 + (y1 - y0) * t + rand(-5, 5));
    }
    pts.push(x1, y1);
    this.line(pts, color, 2, 0.14);
    this.sparks(x1, y1, 4, [0xffffff, color], 80, 0, Math.PI * 2, 0.15);
  }

  afterimage(key: string, frame: number, x: number, y: number, flipX: boolean, ox: number, oy: number, tint: number, alpha = 0.6, life = 0.22, depth: number = DEPTH.PLAYER - 1, rot = 0): void {
    let gh = this.ghosts.find((q) => !q.active);
    if (!gh) {
      gh = { spr: this.scene.add.sprite(0, 0, key, frame), life: 0, max: 1, active: false, a0: 1 };
      this.ghosts.push(gh);
    }
    gh.spr.setTexture(key, frame).setPosition(Math.round(x), Math.round(y)).setOrigin(ox, oy).setFlipX(flipX).setRotation(rot);
    gh.spr.setTintFill(tint).setAlpha(alpha).setDepth(depth).setVisible(true).setBlendMode(Phaser.BlendModes.ADD);
    gh.life = life;
    gh.max = life;
    gh.a0 = alpha;
    gh.active = true;
  }

  dmg(x: number, y: number, value: number, crit: boolean, uid: number, color?: number): void {
    if (!store.data.settings.damageNumbers) return;
    const v = Math.max(1, Math.round(value));
    // merge rapid hits on the same target into one number
    if (uid >= 0) {
      const ex = this.nums.find((n) => n.active && n.uid === uid && n.max - n.life < 0.22 && n.big === crit);
      if (ex) {
        ex.value += v;
        ex.t.setText(String(ex.value));
        ex.life = ex.max;
        ex.t.setScale(ex.big ? 1.5 : 1.25);
        return;
      }
    }
    let n = this.nums.find((q) => !q.active);
    if (!n) {
      if (this.nums.length > 70) return;
      const t = this.scene.add.bitmapText(0, 0, 'num_s', '0').setDepth(DEPTH.DMG_NUM).setOrigin(0.5, 1);
      n = { t, life: 0, max: 0.6, vy: 0, uid: -1, value: 0, active: false, big: false, x: 0, y: 0 };
      this.nums.push(n);
    }
    n.big = crit;
    n.t.setFont(crit ? 'num_l' : 'num_s');
    n.t.setLetterSpacing(-1);
    n.t.setText(String(v));
    n.t.setTint(color ?? (crit ? 0xffd84a : 0xffffff));
    n.t.setVisible(true).setAlpha(1).setScale(crit ? 1.6 : 1.3);
    n.x = x + rand(-4, 4);
    n.y = y;
    n.t.setPosition(Math.round(n.x), Math.round(n.y));
    n.life = crit ? 0.75 : 0.55;
    n.max = n.life;
    n.vy = crit ? -46 : -34;
    n.uid = uid;
    n.value = v;
    n.active = true;
  }

  text(x: number, y: number, s: string, color: number, font: 'small' | 'body' | 'big' = 'small', life = 0.9): void {
    let f = this.texts.find((q) => !q.active);
    if (!f) {
      if (this.texts.length > 10) {
        f = this.texts.reduce((a, b) => (a.life < b.life ? a : b));
      } else {
        const t = txt(this.scene, 0, 0, '', { font, ox: 0.5, oy: 1, depth: DEPTH.DMG_NUM + 1 });
        f = { t, life: 0, max: 1, vy: 0, active: false };
        this.texts.push(f);
      }
    }
    // stack above other live texts so messages never overlap
    let guard = 0;
    let moved = true;
    while (moved && guard++ < 6) {
      moved = false;
      for (const o of this.texts) {
        if (o === f || !o.active) continue;
        const h = Math.max(12, o.t.height * o.t.scaleY);
        if (Math.abs(o.t.x - x) < 80 && y > o.t.y - h - 1 && y < o.t.y + 14) {
          y = o.t.y - h - 2;
          moved = true;
        }
      }
    }
    f.t.setFontFamily(font === 'small' ? 'Galmuri9' : font === 'body' ? 'Galmuri11' : 'Galmuri14');
    f.t.setFontSize(font === 'small' ? 10 : font === 'body' ? 12 : 15);
    f.t.setText(s).setColor(cssHex(color)).setPosition(Math.round(x), Math.round(y)).setVisible(true).setAlpha(1).setScale(1.4);
    f.life = life;
    f.max = life;
    f.vy = -22;
    f.active = true;
  }

  // ----------------------------------------------------------------- update
  update(dt: number): void {
    // particles
    const g = this.g;
    const ga = this.ga;
    g.clear();
    ga.clear();
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        this.free.push(q);
        continue;
      }
      if (q.drag) {
        const k = Math.max(0, 1 - q.drag * dt);
        q.vx *= k;
        q.vy *= k;
      }
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.bounce && q.y > GROUND_Y - 1) {
        q.y = GROUND_Y - 1;
        q.vy *= -0.35;
        q.vx *= 0.6;
      }
      const t = q.life / q.max;
      const gg = q.add ? ga : g;
      const size = q.shrink ? Math.max(1, Math.round(q.size * t)) : q.size;
      gg.fillStyle(q.color, q.add ? Math.min(1, t * 1.6) : 1);
      if (q.streak) {
        // short motion streak
        const len = Math.min(5, Math.hypot(q.vx, q.vy) * 0.018);
        const nx = q.vx / (Math.hypot(q.vx, q.vy) || 1);
        const ny = q.vy / (Math.hypot(q.vx, q.vy) || 1);
        for (let k = 0; k < len; k++) gg.fillRect(Math.round(q.x - nx * k), Math.round(q.y - ny * k), 1, 1);
      } else gg.fillRect(Math.round(q.x - size / 2), Math.round(q.y - size / 2), size, size);
    }

    // sprite anims
    for (const a of this.anims) {
      if (!a.active) continue;
      a.t += dt;
      const f = Math.floor(a.t * a.fps);
      if (f >= a.frames) {
        a.active = false;
        a.spr.setVisible(false).setActive(false);
        continue;
      }
      a.spr.setFrame(f);
      a.spr.x += a.vx * dt;
      a.spr.y += a.vy * dt;
      if (a.fade) a.spr.setAlpha(1 - a.t / a.life);
    }

    // lines & rings
    const gl = this.gl;
    gl.clear();
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.lines.splice(i, 1);
        continue;
      }
      const t = l.life / l.max;
      const w = Math.max(1, Math.round(l.width * (0.5 + t * 0.5)));
      gl.lineStyle(w + 2, l.color, 0.45 * t);
      this.strokePts(gl, l.pts);
      gl.lineStyle(Math.max(1, w - 1), l.core, Math.min(1, t * 1.5));
      this.strokePts(gl, l.pts);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
      gl.lineStyle(r.width, r.color, 1 - t);
      gl.strokeCircle(Math.round(r.x), Math.round(r.y), Math.max(1, Math.round(rad)));
    }

    // damage numbers
    for (const n of this.nums) {
      if (!n.active) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.active = false;
        n.t.setVisible(false);
        continue;
      }
      n.y += n.vy * dt;
      n.vy *= 1 - 3 * dt;
      const t = n.life / n.max;
      const sc = n.t.scaleX + ((n.big ? 1 : 1) - n.t.scaleX) * Math.min(1, dt * 18);
      n.t.setScale(sc);
      n.t.setPosition(Math.round(n.x), Math.round(n.y));
      n.t.setAlpha(t < 0.35 ? t / 0.35 : 1);
    }
    for (const f of this.texts) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.t.setVisible(false);
        continue;
      }
      f.t.y += f.vy * dt;
      f.vy *= 1 - 2.5 * dt;
      const sc = f.t.scaleX + (1 - f.t.scaleX) * Math.min(1, dt * 16);
      f.t.setScale(sc);
      const t = f.life / f.max;
      f.t.setAlpha(t < 0.3 ? t / 0.3 : 1);
    }
    for (const gh of this.ghosts) {
      if (!gh.active) continue;
      gh.life -= dt;
      if (gh.life <= 0) {
        gh.active = false;
        gh.spr.setVisible(false);
        continue;
      }
      gh.spr.setAlpha(gh.a0 * (gh.life / gh.max));
    }
  }

  private strokePts(gl: Phaser.GameObjects.Graphics, pts: number[]): void {
    gl.beginPath();
    gl.moveTo(Math.round(pts[0]), Math.round(pts[1]));
    for (let i = 2; i < pts.length; i += 2) gl.lineTo(Math.round(pts[i]), Math.round(pts[i + 1]));
    gl.strokePath();
  }

  clearAll(): void {
    for (const q of this.parts) this.free.push(q);
    this.parts.length = 0;
    this.lines.length = 0;
    this.rings.length = 0;
    for (const a of this.anims) {
      a.active = false;
      a.spr.setVisible(false);
    }
    for (const n of this.nums) {
      n.active = false;
      n.t.setVisible(false);
    }
    for (const f of this.texts) {
      f.active = false;
      f.t.setVisible(false);
    }
  }
}
