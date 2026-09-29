export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `v` toward `target` by at most `step`. */
export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

/** Smallest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rotateToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Circle vs axis-aligned box (box given by centre + half extents). */
export function circleBox(
  cx: number,
  cy: number,
  r: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): boolean {
  const nx = clamp(cx, bx - hw, bx + hw);
  const ny = clamp(cy, by - hh, by + hh);
  return dist2(cx, cy, nx, ny) <= r * r;
}

/**
 * Segment vs AABB (slab method). Returns entry distance along the segment in
 * [0, len] or -1 when there is no hit.
 */
export function segmentBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  len: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
  pad = 0,
): number {
  let tmin = 0;
  let tmax = len;
  const minX = bx - hw - pad;
  const maxX = bx + hw + pad;
  const minY = by - hh - pad;
  const maxY = by + hh + pad;
  if (Math.abs(dx) < 1e-6) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let t1 = (minX - x0) / dx;
    let t2 = (maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-6) {
    if (y0 < minY || y0 > maxY) return -1;
  } else {
    let t1 = (minY - y0) / dy;
    let t2 = (maxY - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Distance from point to segment. */
export function pointSegDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - x0) * vx + (py - y0) * vy) / l2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, py, x0 + vx * t, y0 + vy * t);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
