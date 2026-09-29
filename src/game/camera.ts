// Camera rig: smooth follow with aim look-ahead, trauma-based shake,
// directional kick impulses and short zoom punches. Output is pixel-snapped.

import Phaser from 'phaser';
import { ARENA_W, GAME_W } from '../core/constants';
import { clamp, damp } from '../core/mathx';
import { store } from '../core/app';

export class CameraRig {
  cam: Phaser.Cameras.Scene2D.Camera;
  x = 0;
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  private zoomPunch = 0;
  private t = 0;
  /** Optional extra focus point (boss framing). */
  focusX: number | null = null;
  focusWeight = 0;

  constructor(cam: Phaser.Cameras.Scene2D.Camera) {
    this.cam = cam;
  }

  private get shakeScale(): number {
    const s = store.data.settings.shake;
    return s === 0 ? 0 : s === 1 ? 0.45 : 1;
  }

  /** Add shake trauma (0..1). Shake amplitude grows with trauma^2. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  kick(dx: number, dy: number): void {
    const s = this.shakeScale;
    this.kickX += dx * s;
    this.kickY += dy * s;
  }

  punch(amount: number): void {
    if (this.shakeScale === 0) return;
    this.zoomPunch = Math.max(this.zoomPunch, amount);
  }

  snapTo(x: number): void {
    this.x = clamp(x - GAME_W / 2, 0, ARENA_W - GAME_W);
  }

  update(realDt: number, targetX: number, aimDir: number, vx: number): void {
    this.t += realDt;
    let tx = targetX + aimDir * 26 + vx * 0.12;
    if (this.focusX !== null && this.focusWeight > 0) tx = tx + (this.focusX - tx) * this.focusWeight;
    const want = clamp(tx - GAME_W / 2, 0, ARENA_W - GAME_W);
    this.x += (want - this.x) * damp(7, realDt);

    this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    const k = Math.exp(-realDt * 18);
    this.kickX *= k;
    this.kickY *= k;
    this.zoomPunch = Math.max(0, this.zoomPunch - realDt * 0.35);

    const amp = this.trauma * this.trauma * 7 * this.shakeScale;
    const sx = amp > 0.05 ? (Math.sin(this.t * 91.3) + Math.sin(this.t * 57.7)) * 0.5 * amp : 0;
    const sy = amp > 0.05 ? (Math.sin(this.t * 83.1 + 1.3) + Math.sin(this.t * 43.9)) * 0.5 * amp : 0;

    this.cam.scrollX = Math.round(this.x + sx + this.kickX);
    this.cam.scrollY = Math.round(sy + this.kickY);
    this.cam.setZoom(1 + this.zoomPunch);
  }
}
