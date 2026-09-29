// Parallax backgrounds for the three zones, painted with integer rects and
// ordered dithering so they stay pixel-crisp. Backgrounds are kept dark and
// desaturated so enemies, bullets and the heroine always pop in front.

import { SeededRng } from '../core/rng';
import { cssHex, hexLerp } from './pixel';
import type { BgTheme } from '../data/zones';
import { GAME_W, GAME_H, ARENA_W, GROUND_Y } from '../core/constants';

export interface BgLayers {
  sky: HTMLCanvasElement;
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  near: HTMLCanvasElement;
  ground: HTMLCanvasElement;
}

export const PARALLAX = { far: 0.15, mid: 0.4, near: 0.7 };
export const BG_MARGIN = 16;

export function layerWidth(factor: number): number {
  return Math.ceil(GAME_W + (ARENA_W - GAME_W) * factor) + BG_MARGIN * 2;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: number): void {
  ctx.fillStyle = cssHex(col);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, col: number): void {
  rect(ctx, x, y, 1, 1, col);
}

/** Vertical dithered gradient through a list of colour stops. */
function gradient(ctx: CanvasRenderingContext2D, w: number, h: number, stops: { at: number; c: number }[]): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1].at) i++;
    const a = stops[i];
    const b = stops[i + 1];
    const lt = Math.max(0, Math.min(1, (t - a.at) / Math.max(0.0001, b.at - a.at)));
    // quantise into 4 steps and dither between them
    const q = lt * 4;
    const base = Math.floor(q);
    const frac = q - base;
    for (let x = 0; x < w; x++) {
      const th = (BAYER[y & 3][x & 3] + 0.5) / 16;
      const step = Math.min(4, base + (frac > th ? 1 : 0));
      const col = hexLerp(a.c, b.c, step / 4);
      const k = (y * w + x) * 4;
      d[k] = (col >> 16) & 255;
      d[k + 1] = (col >> 8) & 255;
      d[k + 2] = col & 255;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function dither(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, col: number, density: number): void {
  ctx.fillStyle = cssHex(col);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if ((BAYER[y & 3][x & 3] + 0.5) / 16 < density) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function ditherCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: number, density: number): void {
  ctx.fillStyle = cssHex(col);
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1) continue;
      if ((BAYER[y & 3][x & 3] + 0.5) / 16 < density * (1 - d * d)) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function jagged(ctx: CanvasRenderingContext2D, rng: SeededRng, x0: number, y0: number, x1: number, y1: number, width: number, col: number, segs = 14): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const nx = x0 + (x1 - x0) * t + (i > 0 && i < segs ? rng.range(-6, 6) : 0);
    const ny = y0 + (y1 - y0) * t + (i > 0 && i < segs ? rng.range(-5, 5) : 0);
    pts.push([nx, ny]);
  }
  for (let i = 0; i < pts.length - 1; i++) line(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width, col);
  return pts;
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, col: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  ctx.fillStyle = cssHex(col);
  const hw = Math.floor(width / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    ctx.fillRect(x - hw, y - hw, Math.max(1, width), Math.max(1, width));
  }
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: number): void {
  ctx.fillStyle = cssHex(col);
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][], col: number): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  ctx.fillStyle = cssHex(col);
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.ceil(xs[i] - 0.5);
      const x1 = Math.floor(xs[i + 1] - 0.5);
      if (x1 >= x0) ctx.fillRect(x0, y, x1 - x0 + 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Neon ruins
// ---------------------------------------------------------------------------
function neon(): BgLayers {
  const rng = new SeededRng(1337);
  const H = GAME_H;
  // Sky
  const [sky, s] = canvas(GAME_W + BG_MARGIN * 2, H);
  gradient(s, sky.width, H, [
    { at: 0, c: 0x050814 },
    { at: 0.45, c: 0x0c1430 },
    { at: 0.75, c: 0x18204a },
    { at: 1, c: 0x22244e },
  ]);
  for (let i = 0; i < 140; i++) {
    const x = rng.int(0, sky.width - 1);
    const y = rng.int(0, 150);
    px(s, x, y, rng.chance(0.15) ? 0xffffff : rng.chance(0.5) ? 0x9a90d0 : 0x5a5090);
  }
  circle(s, 392, 58, 24, 0x222a50);
  circle(s, 392, 58, 21, 0xd8ccf4);
  circle(s, 399, 54, 19, 0xb8a8e0);
  circle(s, 404, 51, 17, 0x222a50);
  ditherCircle(s, 392, 58, 34, 0x2a3268, 0.22);
  // rift crack in the sky
  jagged(s, rng, 40, 18, 230, 96, 3, 0x3a2470, 16);
  jagged(s, new SeededRng(5), 40, 18, 230, 96, 1, 0xa888e8, 16);
  dither(s, 0, 200, sky.width, 30, 0x2a2e5a, 0.25);

  // Far skyline
  const fw = 560 + BG_MARGIN * 2;
  const [far, f] = canvas(fw, H);
  let x = 0;
  while (x < fw) {
    const w = rng.int(14, 38);
    const h = rng.int(50, 130);
    const top = GROUND_Y - h;
    rect(f, x, top, w, h + 10, 0x0e1228);
    if (rng.chance(0.3)) poly(f, [[x, top], [x + w, top], [x + w, top - rng.int(4, 14)]], 0x0e1228);
    if (rng.chance(0.25)) rect(f, x + (w >> 1), top - rng.int(8, 20), 1, 20, 0x0e1228);
    for (let wy = top + 5; wy < GROUND_Y - 6; wy += 5) {
      for (let wx = x + 3; wx < x + w - 3; wx += 4) {
        if (rng.chance(0.08)) px(f, wx, wy, rng.chance(0.5) ? 0x3a5a7a : 0x7a5a48);
      }
    }
    x += w + rng.int(0, 6);
  }
  dither(f, 0, 170, fw, 60, 0x1c2244, 0.2);

  // Mid buildings with neon
  const mw = 680 + BG_MARGIN * 2;
  const [mid, m] = canvas(mw, H);
  x = -10;
  while (x < mw) {
    const w = rng.int(40, 80);
    const h = rng.int(70, 150);
    const top = GROUND_Y - h;
    rect(m, x, top, w, h + 10, 0x141a36);
    rect(m, x, top, 2, h + 10, 0x222a50);
    rect(m, x, top, w, 2, 0x222a50);
    if (rng.chance(0.5)) {
      // broken top
      const cut = rng.int(6, 20);
      m.globalCompositeOperation = 'destination-out';
      poly(m, [[x + w - cut, top - 1], [x + w + 1, top - 1], [x + w + 1, top + cut]], 0x000000);
      m.globalCompositeOperation = 'source-over';
    }
    for (let wy = top + 8; wy < GROUND_Y - 16; wy += 9) {
      for (let wx = x + 5; wx < x + w - 6; wx += 8) {
        const lit = rng.chance(0.18);
        rect(m, wx, wy, 3, 4, lit ? (rng.chance(0.5) ? 0x3a8a98 : 0x9a7a4a) : 0x0f1430);
      }
    }
    if (rng.chance(0.55)) {
      const sw = rng.int(18, 30);
      const sh = rng.int(8, 14);
      const sx = x + rng.int(4, Math.max(5, w - sw - 4));
      const sy = top + rng.int(10, 40);
      const col = rng.chance(0.5) ? 0x3aa8b8 : 0xc08a3a;
      rect(m, sx - 1, sy - 1, sw + 2, sh + 2, 0x0a0c1c);
      rect(m, sx, sy, sw, sh, 0x0e1226);
      rect(m, sx, sy, sw, 1, col);
      rect(m, sx, sy + sh - 1, sw, 1, col);
      rect(m, sx, sy, 1, sh, col);
      rect(m, sx + sw - 1, sy, 1, sh, col);
      for (let k = 0; k < 3; k++) rect(m, sx + 3 + k * Math.floor(sw / 3.5), sy + 3, 2, sh - 6, col);
      dither(m, sx - 4, sy - 4, sw + 8, sh + 8, col, 0.08);
    }
    x += w + rng.int(4, 18);
  }
  // hanging cables
  for (let i = 0; i < 8; i++) {
    const cx0 = rng.int(0, mw - 80);
    const cx1 = cx0 + rng.int(40, 90);
    const cy = rng.int(70, 130);
    for (let t = 0; t <= 1; t += 0.01) {
      const xx = cx0 + (cx1 - cx0) * t;
      const yy = cy + Math.sin(t * Math.PI) * rng.range(6, 7);
      px(m, xx, yy, 0x080a18);
    }
  }
  // Near structures (sides of the screen, low)
  const nw = 820 + BG_MARGIN * 2;
  const [near, n] = canvas(nw, H);
  x = 0;
  while (x < nw) {
    const kind = rng.int(0, 2);
    if (kind === 0) {
      // overpass pillar
      const w = rng.int(18, 26);
      rect(n, x, 120, w, GROUND_Y - 120 + 10, 0x0a0d1e);
      rect(n, x + 2, 120, 2, GROUND_Y - 120, 0x1c2240);
      rect(n, x - 20, 112, w + 40, 10, 0x0a0d1e);
      rect(n, x - 20, 112, w + 40, 1, 0x252c50);
    } else if (kind === 1) {
      // street lamp
      rect(n, x + 4, 150, 2, GROUND_Y - 150, 0x0a0c1a);
      rect(n, x + 4, 150, 10, 2, 0x0a0c1a);
      rect(n, x + 11, 152, 4, 2, 0xffd08a);
      dither(n, x + 3, 154, 20, 30, 0x5a4020, 0.12);
    } else {
      // fence
      const w = rng.int(40, 70);
      for (let fx = 0; fx < w; fx += 3) {
        line(n, x + fx, 196, x + fx + 6, GROUND_Y, 1, 0x0a0c1c);
        line(n, x + fx + 6, 196, x + fx, GROUND_Y, 1, 0x0a0c1c);
      }
      rect(n, x, 195, w, 1, 0x1a1e38);
    }
    x += rng.int(70, 150);
  }
  // Ground
  const ground = groundCanvas((g, gw) => {
    rect(g, 0, 0, gw, 56, 0x1c2034);
    rect(g, 0, 0, gw, 2, 0x4a5280);
    rect(g, 0, 2, gw, 1, 0x30365a);
    dither(g, 0, 3, gw, 10, 0x141828, 0.25);
    for (let i = 0; i < gw; i += 40) rect(g, i + 8, 20, 16, 2, 0x3e4468);
    for (let i = 0; i < 26; i++) {
      let cx = rng.int(0, gw);
      let cy = rng.int(6, 50);
      for (let k = 0; k < 14; k++) {
        px(g, cx, cy, 0x10121e);
        cx += rng.int(-1, 2);
        cy += rng.int(-1, 1);
      }
    }
    for (let i = 0; i < 12; i++) {
      const pxx = rng.int(20, gw - 40);
      const pyy = rng.int(10, 40);
      const pw = rng.int(14, 30);
      rect(g, pxx, pyy, pw, 3, 0x121630);
      rect(g, pxx + 2, pyy + 1, rng.int(3, 8), 1, rng.chance(0.5) ? 0x3a8a98 : 0x9a7a4a);
    }
    for (let i = 0; i < 40; i++) rect(g, rng.int(0, gw), rng.int(4, 54), rng.int(1, 3), rng.int(1, 2), 0x30365a);
  });
  return { sky, far, mid, near, ground };
}

function groundCanvas(draw: (g: CanvasRenderingContext2D, w: number) => void): HTMLCanvasElement {
  const w = ARENA_W + BG_MARGIN * 2;
  const [c, g] = canvas(w, 56);
  draw(g, w);
  return c;
}

// ---------------------------------------------------------------------------
// Collapsed laboratory
// ---------------------------------------------------------------------------
function lab(): BgLayers {
  const rng = new SeededRng(4242);
  const H = GAME_H;
  const [sky, s] = canvas(GAME_W + BG_MARGIN * 2, H);
  gradient(s, sky.width, H, [
    { at: 0, c: 0x040a0c },
    { at: 0.3, c: 0x0a181c },
    { at: 0.8, c: 0x10262a },
    { at: 1, c: 0x16302e },
  ]);
  for (let y = 40; y < H; y += 36) rect(s, 0, y, sky.width, 1, 0x081416);
  for (let xx = 10; xx < sky.width; xx += 48) rect(s, xx, 30, 1, H, 0x081416);
  // broken window with night outside
  rect(s, 150, 44, 160, 70, 0x0a0c20);
  dither(s, 150, 44, 160, 70, 0x1a1c3a, 0.3);
  for (let i = 0; i < 20; i++) px(s, rng.int(152, 306), rng.int(46, 110), 0x8a88c0);
  jagged(s, rng, 150, 60, 250, 114, 1, 0x2a4a58, 8);
  jagged(s, rng, 210, 44, 300, 100, 1, 0x2a4a58, 8);
  rect(s, 148, 42, 164, 2, 0x1a3034);
  rect(s, 148, 114, 164, 3, 0x1a3034);
  rect(s, 228, 44, 3, 70, 0x1a3034);
  rect(s, 0, 0, sky.width, 26, 0x030708);
  for (let xx = 30; xx < sky.width; xx += 90) {
    rect(s, xx, 26, 1, 8, 0x0a1416);
    rect(s, xx - 3, 34, 7, 2, 0xd09a3a);
    dither(s, xx - 10, 36, 21, 14, 0x3a2a10, 0.15);
  }

  const fw = 560 + BG_MARGIN * 2;
  const [far, f] = canvas(fw, H);
  for (let xx = 10; xx < fw; xx += rng.int(50, 80)) {
    const w = rng.int(22, 34);
    const top = rng.int(70, 110);
    rect(f, xx, top, w, GROUND_Y - top, 0x0c1e20);
    circle(f, xx + w / 2, top, w / 2, 0x0c1e20);
    rect(f, xx + 3, top + 4, w - 6, GROUND_Y - top - 12, 0x0e2a28);
    dither(f, xx + 3, top + 4, w - 6, GROUND_Y - top - 12, 0x1e5a48, rng.range(0.1, 0.35));
    rect(f, xx + 5, top + 6, 1, GROUND_Y - top - 20, 0x2a5a58);
    rect(f, xx - 2, GROUND_Y - 14, w + 4, 14, 0x0a1618);
    if (rng.chance(0.4)) {
      // broken glass
      poly(f, [[xx + 3, top + 20], [xx + w - 3, top + 12], [xx + w - 3, top + 30]], 0x0c1e20);
    }
  }
  const mw = 680 + BG_MARGIN * 2;
  const [mid, m] = canvas(mw, H);
  // catwalk
  rect(m, 0, 118, mw, 4, 0x142628);
  rect(m, 0, 118, mw, 1, 0x2a4a48);
  for (let xx = 0; xx < mw; xx += 12) {
    line(m, xx, 122, xx + 6, 132, 1, 0x142628);
    line(m, xx + 12, 122, xx + 6, 132, 1, 0x142628);
  }
  rect(m, 0, 132, mw, 2, 0x142628);
  for (let i = 0; i < 6; i++) {
    const py = rng.int(50, 110);
    rect(m, 0, py, mw, 3, 0x0e1c1e);
    rect(m, 0, py, mw, 1, 0x1e3a3a);
  }
  for (let xx = 20; xx < mw; xx += rng.int(60, 110)) {
    rect(m, xx, 30, 5, GROUND_Y - 30, 0x0e1c1e);
    rect(m, xx, 30, 1, GROUND_Y - 30, 0x1e3a3a);
    if (rng.chance(0.6)) {
      rect(m, xx - 3, 140, 11, 6, 0x0a1618);
      rect(m, xx, 142, 3, 2, rng.chance(0.5) ? 0xd09a3a : 0x3a9a7a);
    }
  }
  const nw = 820 + BG_MARGIN * 2;
  const [near, n] = canvas(nw, H);
  for (let xx = 0; xx < nw; xx += rng.int(110, 180)) {
    const w = rng.int(16, 24);
    rect(n, xx, 0, w, GROUND_Y + 10, 0x081214);
    rect(n, xx + 1, 0, 1, GROUND_Y, 0x16282a);
    for (let yy = GROUND_Y - 30; yy < GROUND_Y; yy += 6) {
      for (let k = 0; k < w; k += 6) poly(n, [[xx + k, yy], [xx + k + 3, yy], [xx + k + 6, yy + 6], [xx + k + 3, yy + 6]], 0x5a5020);
    }
    if (rng.chance(0.5)) {
      rect(n, xx + w + 10, GROUND_Y - 22, 26, 22, 0x0a1618);
      rect(n, xx + w + 10, GROUND_Y - 22, 26, 1, 0x1e3a3a);
      rect(n, xx + w + 14, GROUND_Y - 16, 4, 2, 0x3a9a7a);
    }
  }
  const ground = groundCanvas((g, gw) => {
    rect(g, 0, 0, gw, 56, 0x1a2a2c);
    rect(g, 0, 0, gw, 2, 0x4a6a68);
    for (let xx = 0; xx < gw; xx += 12) poly(g, [[xx, 2], [xx + 6, 2], [xx + 10, 6], [xx + 4, 6]], 0x5a5020);
    rect(g, 0, 6, gw, 1, 0x0e1a1c);
    for (let xx = 0; xx < gw; xx += 32) {
      rect(g, xx, 7, 1, 49, 0x0e1a1c);
      px(g, xx + 3, 10, 0x4a6a68);
      px(g, xx + 28, 10, 0x4a6a68);
      px(g, xx + 3, 50, 0x4a6a68);
    }
    rect(g, 0, 30, gw, 1, 0x0e1a1c);
    for (let i = 0; i < 30; i++) px(g, rng.int(0, gw), rng.int(8, 54), 0x8ad0d0);
    for (let i = 0; i < 8; i++) {
      const xx = rng.int(0, gw - 30);
      rect(g, xx, rng.int(12, 44), rng.int(10, 24), 2, 0x1e6a4a);
    }
  });
  return { sky, far, mid, near, ground };
}

// ---------------------------------------------------------------------------
// Rift core
// ---------------------------------------------------------------------------
function rift(): BgLayers {
  const rng = new SeededRng(9001);
  const H = GAME_H;
  const [sky, s] = canvas(GAME_W + BG_MARGIN * 2, H);
  gradient(s, sky.width, H, [
    { at: 0, c: 0x0a0310 },
    { at: 0.4, c: 0x1e0620 },
    { at: 0.8, c: 0x340a26 },
    { at: 1, c: 0x40102a },
  ]);
  dither(s, 0, 20, sky.width, 60, 0x2a0a30, 0.2);
  dither(s, 100, 120, 300, 50, 0x3a1030, 0.2);
  // The great rift
  const pts = jagged(s, rng, -10, 70, sky.width + 10, 40, 7, 0x3a1860, 18);
  for (let i = 0; i < pts.length - 1; i++) line(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4, 0x8a50c0);
  for (let i = 0; i < pts.length - 1; i++) line(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1, 0xf0dcff);
  for (let i = 0; i < 90; i++) px(s, rng.int(0, sky.width), rng.int(0, 180), rng.chance(0.3) ? 0xd0a0ff : 0x6a3a8a);

  const fw = 560 + BG_MARGIN * 2;
  const [far, f] = canvas(fw, H);
  for (let i = 0; i < 9; i++) {
    const cx = rng.int(0, fw);
    const cy = rng.int(90, 170);
    const w = rng.int(30, 60);
    poly(f, [[cx - w / 2, cy], [cx + w / 2, cy], [cx + w / 3, cy + 12], [cx, cy + rng.int(20, 34)], [cx - w / 3, cy + 10]], 0x180818);
    rect(f, cx - w / 2, cy - 2, w, 3, 0x2a1030);
    if (rng.chance(0.5)) rect(f, cx - 6, cy - rng.int(10, 26), 8, 24, 0x180818);
  }
  const mw = 680 + BG_MARGIN * 2;
  const [mid, m] = canvas(mw, H);
  for (let i = 0; i < 10; i++) {
    const cx = rng.int(0, mw);
    const cy = rng.int(60, 180);
    const w = rng.int(16, 34);
    const h = rng.int(20, 50);
    const sk = rng.range(-8, 8);
    poly(m, [[cx, cy], [cx + w, cy + sk], [cx + w, cy + h + sk], [cx, cy + h]], 0x220c28);
    for (let wy = 4; wy < h - 4; wy += 7) for (let wx = 4; wx < w - 4; wx += 6) if (rng.chance(0.3)) px(m, cx + wx, cy + wy + sk * (wx / w), 0x6a2a5a);
  }
  for (let xx = 0; xx < mw; xx += rng.int(40, 90)) {
    const h = rng.int(30, 70);
    poly(m, [[xx, GROUND_Y + 4], [xx + 8, GROUND_Y - h], [xx + 16, GROUND_Y + 4]], 0x2a1238);
    line(m, xx + 8, GROUND_Y - h, xx + 8, GROUND_Y, 1, 0x5a2a80);
  }
  const nw = 820 + BG_MARGIN * 2;
  const [near, n] = canvas(nw, H);
  for (let xx = 0; xx < nw; xx += rng.int(120, 200)) {
    const h = rng.int(70, 130);
    const w = rng.int(18, 30);
    poly(n, [[xx, GROUND_Y + 6], [xx + w * 0.4, GROUND_Y - h], [xx + w, GROUND_Y + 6]], 0x1a0a28);
    line(n, xx + w * 0.4, GROUND_Y - h + 2, xx + w * 0.2, GROUND_Y, 1, 0x6a3aa0);
    poly(n, [[xx + w, GROUND_Y + 6], [xx + w + 6, GROUND_Y - h * 0.45], [xx + w + 12, GROUND_Y + 6]], 0x1a0a28);
  }
  const ground = groundCanvas((g, gw) => {
    rect(g, 0, 0, gw, 56, 0x1a0c1c);
    rect(g, 0, 0, gw, 2, 0x4a2a5a);
    dither(g, 0, 2, gw, 12, 0x2a1430, 0.3);
    for (let i = 0; i < 22; i++) {
      let cx = rng.int(0, gw);
      let cy = rng.int(3, 50);
      for (let k = 0; k < 22; k++) {
        px(g, cx, cy, rng.chance(0.15) ? 0xc080ff : 0x7a3ab0);
        cx += rng.int(-1, 2);
        cy += rng.int(-1, 1);
        if (cy < 3) cy = 3;
      }
    }
    for (let i = 0; i < 10; i++) {
      const xx = rng.int(0, gw - 20);
      rect(g, xx, rng.int(10, 46), rng.int(8, 18), 2, 0x0e060e);
    }
  });
  return { sky, far, mid, near, ground };
}

export function buildBackground(theme: BgTheme): BgLayers {
  if (theme === 'lab') return lab();
  if (theme === 'rift') return rift();
  return neon();
}
