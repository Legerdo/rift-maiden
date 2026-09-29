// Tiny verlet rope used for Sera's ponytail and scarf tails (secondary motion).

export class Rope {
  xs: number[];
  ys: number[];
  pxs: number[];
  pys: number[];
  seg: number;
  n: number;

  constructor(n: number, seg: number, x: number, y: number) {
    this.n = n;
    this.seg = seg;
    this.xs = new Array(n).fill(x);
    this.ys = new Array(n).fill(y);
    this.pxs = new Array(n).fill(x);
    this.pys = new Array(n).fill(y);
    for (let i = 0; i < n; i++) {
      this.xs[i] = x - i * seg;
      this.pxs[i] = this.xs[i];
      this.ys[i] = y;
      this.pys[i] = y;
    }
  }

  reset(x: number, y: number, dirX: number): void {
    for (let i = 0; i < this.n; i++) {
      this.xs[i] = this.pxs[i] = x - dirX * i * this.seg;
      this.ys[i] = this.pys[i] = y + i * 0.5;
    }
  }

  /**
   * @param rx,ry anchor position
   * @param gx,gy acceleration (gravity + wind) in px/s^2
   */
  step(rx: number, ry: number, gx: number, gy: number, dt: number, damping = 0.86): void {
    const dt2 = dt * dt;
    this.xs[0] = rx;
    this.ys[0] = ry;
    this.pxs[0] = rx;
    this.pys[0] = ry;
    for (let i = 1; i < this.n; i++) {
      const x = this.xs[i];
      const y = this.ys[i];
      const vx = (x - this.pxs[i]) * damping;
      const vy = (y - this.pys[i]) * damping;
      this.pxs[i] = x;
      this.pys[i] = y;
      this.xs[i] = x + vx + gx * dt2;
      this.ys[i] = y + vy + gy * dt2;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < this.n; i++) {
        const dx = this.xs[i] - this.xs[i - 1];
        const dy = this.ys[i] - this.ys[i - 1];
        const d = Math.hypot(dx, dy) || 0.0001;
        const diff = (d - this.seg) / d;
        this.xs[i] -= dx * diff;
        this.ys[i] -= dy * diff;
      }
    }
  }
}
