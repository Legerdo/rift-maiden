// Danger telegraphs: every enemy attack that can hurt the player is announced
// with a blinking red/pink marker before it lands.

import Phaser from 'phaser';
import { DEPTH, GROUND_Y } from '../core/constants';

interface Tele {
  kind: 'line' | 'circle' | 'column' | 'ground';
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  t: number;
  dur: number;
  color: number;
  width: number;
}

export class Telegraph {
  private g: Phaser.GameObjects.Graphics;
  private list: Tele[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.TELEGRAPH);
  }

  line(x: number, y: number, x2: number, y2: number, dur: number, color = 0xff5c7a, width = 1): void {
    this.list.push({ kind: 'line', x, y, x2, y2, r: 0, t: 0, dur, color, width });
  }

  circle(x: number, y: number, r: number, dur: number, color = 0xff5c7a): void {
    this.list.push({ kind: 'circle', x, y, x2: 0, y2: 0, r, t: 0, dur, color, width: 1 });
  }

  /** Vertical danger column (falling debris, orbital strikes). */
  column(x: number, w: number, dur: number, color = 0xff5c7a): void {
    this.list.push({ kind: 'column', x, y: 0, x2: 0, y2: 0, r: w, t: 0, dur, color, width: 1 });
  }

  /** Ground impact marker (mortar shells). */
  ground(x: number, r: number, dur: number, color = 0xff5c7a): void {
    this.list.push({ kind: 'ground', x, y: GROUND_Y, x2: 0, y2: 0, r, t: 0, dur, color, width: 1 });
  }

  clear(): void {
    this.list.length = 0;
    this.g.clear();
  }

  update(dt: number): void {
    this.time += dt;
    const g = this.g;
    g.clear();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      q.t += dt;
      if (q.t >= q.dur) {
        this.list.splice(i, 1);
        continue;
      }
      const prog = q.t / q.dur;
      // blink faster as impact approaches
      const blink = Math.sin(this.time * (14 + prog * 30)) > -0.2 ? 1 : 0.35;
      const a = (0.45 + prog * 0.5) * blink;
      switch (q.kind) {
        case 'line': {
          const len = Math.hypot(q.x2 - q.x, q.y2 - q.y);
          const nx = (q.x2 - q.x) / (len || 1);
          const ny = (q.y2 - q.y) / (len || 1);
          g.fillStyle(q.color, a);
          for (let s = 0; s < len; s += 6) {
            const x = Math.round(q.x + nx * s);
            const y = Math.round(q.y + ny * s);
            g.fillRect(x - Math.floor(q.width / 2), y - Math.floor(q.width / 2), Math.max(1, q.width) + 2, Math.max(1, q.width));
          }
          break;
        }
        case 'circle': {
          g.lineStyle(1, q.color, a);
          g.strokeCircle(Math.round(q.x), Math.round(q.y), Math.round(q.r * (1.3 - prog * 0.3)));
          break;
        }
        case 'column': {
          const w = Math.round(q.r);
          g.fillStyle(q.color, a * 0.18);
          g.fillRect(Math.round(q.x - w / 2), 0, w, GROUND_Y);
          g.fillStyle(q.color, a);
          g.fillRect(Math.round(q.x - w / 2), 0, 1, GROUND_Y);
          g.fillRect(Math.round(q.x + w / 2) - 1, 0, 1, GROUND_Y);
          const sw = Math.round(w * (0.4 + prog * 0.6));
          g.fillRect(Math.round(q.x - sw / 2), GROUND_Y - 2, sw, 2);
          break;
        }
        case 'ground': {
          const r = Math.round(q.r * (0.5 + prog * 0.5));
          g.fillStyle(q.color, a * 0.25);
          g.fillEllipse(Math.round(q.x), GROUND_Y - 1, r * 2, 6);
          g.fillStyle(q.color, a);
          g.fillRect(Math.round(q.x) - r, GROUND_Y - 1, 2, 2);
          g.fillRect(Math.round(q.x) + r - 2, GROUND_Y - 1, 2, 2);
          g.fillRect(Math.round(q.x) - 1, GROUND_Y - 6 - Math.round((1 - prog) * 10), 2, 4);
          break;
        }
      }
    }
  }
}
