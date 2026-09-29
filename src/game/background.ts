// Parallax layers + ambient weather per zone (rain / dust / embers).

import Phaser from 'phaser';
import { ARENA_W, DEPTH, GAME_H, GAME_W, GROUND_Y } from '../core/constants';
import { rand } from '../core/rng';
import { ensureBackground } from '../art/textures';
import { PARALLAX, BG_MARGIN } from '../art/bgArt';
import type { BgTheme } from '../data/zones';

interface Mote {
  x: number;
  y: number;
  v: number;
  s: number;
  ph: number;
}

export class Background {
  private scene: Phaser.Scene;
  private layers: Phaser.GameObjects.Image[] = [];
  private ambient: Phaser.GameObjects.Graphics;
  private fence: Phaser.GameObjects.Graphics;
  private motes: Mote[] = [];
  theme: BgTheme = 'neon';
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ambient = scene.add.graphics().setDepth(DEPTH.BG_NEAR + 0.5).setScrollFactor(0);
    this.fence = scene.add.graphics().setDepth(DEPTH.GROUND + 0.5);
  }

  build(theme: BgTheme): void {
    const s = this.scene;
    this.theme = theme;
    for (const l of this.layers) l.destroy();
    this.layers = [];
    ensureBackground(s, theme);
    const add = (key: string, depth: number, sf: number, y = 0) => {
      const img = s.add.image(-BG_MARGIN, y, key).setOrigin(0, 0).setDepth(depth).setScrollFactor(sf, sf === 0 ? 0 : 1);
      this.layers.push(img);
      return img;
    };
    add(`bg_${theme}_sky`, DEPTH.SKY, 0);
    add(`bg_${theme}_far`, DEPTH.BG_FAR, PARALLAX.far);
    add(`bg_${theme}_mid`, DEPTH.BG_MID, PARALLAX.mid);
    add(`bg_${theme}_near`, DEPTH.BG_NEAR, PARALLAX.near);
    add(`bg_${theme}_ground`, DEPTH.GROUND, 1, GROUND_Y - 2);
    this.motes = [];
    const n = theme === 'neon' ? 70 : theme === 'lab' ? 36 : 44;
    for (let i = 0; i < n; i++) this.motes.push({ x: rand(0, GAME_W), y: rand(0, GAME_H), v: rand(0.6, 1.4), s: Math.random() < 0.3 ? 2 : 1, ph: rand(0, 6) });
    this.drawFence();
  }

  private drawFence(): void {
    const g = this.fence;
    g.clear();
    const col = this.theme === 'lab' ? 0x3a9a7a : this.theme === 'rift' ? 0xc080ff : 0x6ef4ff;
    for (const x of [2, ARENA_W - 8]) {
      g.fillStyle(0x0e0a1a, 1);
      g.fillRect(x, GROUND_Y - 70, 6, 72);
      g.fillStyle(0x2a2048, 1);
      g.fillRect(x + 1, GROUND_Y - 70, 1, 70);
      g.fillStyle(col, 1);
      for (let y = GROUND_Y - 64; y < GROUND_Y - 4; y += 12) g.fillRect(x + 2, y, 2, 4);
    }
  }

  update(dt: number, camX: number): void {
    this.t += dt;
    const g = this.ambient;
    g.clear();
    // fence shimmer
    for (const x of [8, ARENA_W - 8]) {
      const sx = x - camX;
      if (sx < -10 || sx > GAME_W + 10) continue;
      g.fillStyle(this.theme === 'rift' ? 0xc080ff : 0x6ef4ff, 0.08 + Math.sin(this.t * 4) * 0.04);
      g.fillRect(Math.round(sx) - 1, 0, 2, GROUND_Y);
    }
    for (const m of this.motes) {
      if (this.theme === 'neon') {
        // rain
        m.y += 260 * m.v * dt;
        m.x -= 60 * m.v * dt;
        if (m.y > GROUND_Y + 4) {
          m.y = rand(-20, 0);
          m.x = rand(0, GAME_W + 60);
        }
        g.fillStyle(0x8a88c8, 0.35);
        g.fillRect(Math.round(m.x), Math.round(m.y), 1, 4 * m.s);
      } else if (this.theme === 'lab') {
        m.y += 8 * m.v * dt;
        m.x += Math.sin(this.t + m.ph) * 6 * dt;
        if (m.y > GROUND_Y) m.y = rand(20, 40);
        g.fillStyle(0x8ad0c0, 0.25 + Math.sin(this.t * 2 + m.ph) * 0.12);
        g.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
      } else {
        m.y -= 22 * m.v * dt;
        m.x += Math.sin(this.t * 1.5 + m.ph) * 10 * dt;
        if (m.y < 0) {
          m.y = GROUND_Y + rand(0, 10);
          m.x = rand(0, GAME_W);
        }
        g.fillStyle(Math.sin(m.ph + this.t * 3) > 0 ? 0xff8a3c : 0xc080ff, 0.55);
        g.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
      }
    }
    // lab light flicker
    if (this.theme === 'lab' && Math.sin(this.t * 0.9) > 0.97 && Math.random() < 0.3) {
      g.fillStyle(0x000000, 0.25);
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
  }

  destroy(): void {
    for (const l of this.layers) l.destroy();
    this.ambient.destroy();
    this.fence.destroy();
  }
}
