// Projectiles, pickups and effect sprites.

import { PixelBuf, Sheet, flat, mat } from './pixel';
import { C, M } from './palette';

type Draw = (b: PixelBuf, f: number) => void;

function sheet(w: number, h: number, frames: number, draw: Draw, outline: number | null = C.ink): Sheet {
  const s = new Sheet(w, h, frames);
  for (let f = 0; f < frames; f++) {
    const b = new PixelBuf(w, h);
    draw(b, f);
    b.resolve();
    if (outline !== null) b.outline(outline);
    s.put(f, b);
  }
  return s;
}

const Y = flat(0xffe860, true);
const Y2 = flat(0xfff6c0, true);
const O = flat(0xffa040, true);
const W = flat(0xffffff, true);
const CY = flat(0x6ef4ff, true);
const CY2 = flat(0xc8fcff, true);
const G = flat(0x9cff8a, true);
const G2 = flat(0xe0ffd8, true);
const ICE = flat(0xa8ecff, true);
const PINK = flat(C.eShot);
const PINK_HI = flat(C.eShotHi);
const RIM = flat(C.eShotRim);

export function buildFx(): Record<string, Sheet> {
  const out: Record<string, Sheet> = {};

  // ---- Player projectiles (no dark outline: they glow) ----
  out.shot_smg = sheet(10, 4, 1, (b) => {
    b.rect(0, 1, 3, 2, O);
    b.rect(3, 1, 4, 2, Y);
    b.rect(6, 1, 4, 2, Y2);
    b.rect(8, 1, 2, 2, W);
  }, null);
  out.shot_pellet = sheet(5, 5, 1, (b) => {
    b.circle(2.5, 2.5, 2.5, O);
    b.circle(2.5, 2.5, 1.5, Y2);
    b.set(2, 2, W);
  }, null);
  out.shot_shard = sheet(4, 4, 1, (b) => {
    b.rect(0, 1, 4, 2, Y);
    b.rect(1, 0, 2, 4, Y);
    b.rect(1, 1, 2, 2, W);
  }, null);
  out.shot_drone = sheet(7, 3, 1, (b) => {
    b.rect(0, 0, 7, 3, G);
    b.rect(3, 1, 4, 1, G2);
  }, null);
  out.shot_homing = sheet(6, 6, 1, (b) => {
    b.poly([[3, 0], [6, 3], [3, 6], [0, 3]], CY);
    b.rect(2, 2, 2, 2, W);
  }, null);
  out.shot_ice = sheet(6, 4, 1, (b) => {
    b.poly([[0, 2], [3, 0], [6, 2], [3, 4]], ICE);
    b.set(3, 2, W);
  }, null);
  out.shot_missile = sheet(12, 6, 1, (b) => {
    b.rect(2, 1, 8, 4, mat(0xffffff, 0xd8dcf0, 0x9098b8));
    b.rect(10, 2, 2, 2, flat(0xff4466));
    b.rect(0, 0, 3, 1, M.gunDark);
    b.rect(0, 5, 3, 1, M.gunDark);
    b.set(5, 2, M.cyan);
  });
  out.shot_mini = sheet(8, 4, 1, (b) => {
    b.rect(1, 1, 6, 2, mat(0xffffff, 0xd8dcf0, 0x9098b8));
    b.rect(7, 1, 1, 2, flat(0xff4466));
  });
  // ---- Enemy projectiles: hot pink core, white centre, dark rim ----
  out.e_orb = sheet(11, 11, 2, (b, f) => {
    b.circle(5.5, 5.5, 5, RIM);
    b.circle(5.5, 5.5, 4, PINK);
    b.circle(5.5, 5.5, f === 0 ? 2 : 2.6, PINK_HI);
    b.set(5, 5, W);
  }, null);
  out.e_orb_big = sheet(17, 17, 2, (b, f) => {
    b.circle(8.5, 8.5, 8, RIM);
    b.circle(8.5, 8.5, 6.8, PINK);
    b.circle(8.5, 8.5, f === 0 ? 3.5 : 4.3, PINK_HI);
    b.circle(8.5, 8.5, 1.8, W);
  }, null);
  out.e_mortar = sheet(12, 12, 2, (b, f) => {
    b.circle(6, 6, 5, M.steelDark);
    b.rect(1, 5, 10, 2, f === 0 ? PINK : PINK_HI);
    b.set(4, 3, W);
  });
  out.e_wave = sheet(18, 18, 2, (b, f) => {
    b.poly([[0, 17], [4, 6 - f], [9, 1], [14, 6 - f], [18, 17]], RIM);
    b.poly([[2, 17], [5, 8 - f], [9, 4], [13, 8 - f], [16, 17]], PINK);
    b.poly([[5, 17], [7, 11], [9, 8], [11, 11], [13, 17]], PINK_HI);
    b.rect(8, 12, 2, 5, W);
  }, null);
  out.debris = sheet(20, 16, 2, (b, f) => {
    b.poly(f === 0 ? [[2, 4], [9, 1], [18, 5], [16, 14], [5, 15]] : [[1, 7], [7, 1], [17, 3], [19, 12], [8, 15]], M.steel);
    b.line(6, 6, 12, 10, M.steelDark);
    b.set(13, 4, M.glow);
  });

  // ---- Pickups ----
  const xpMat = mat(C.xpHi, C.xp, C.xpLo);
  out.xp_s = sheet(7, 9, 2, (b, f) => {
    b.poly([[3.5, 0], [6.5, 4.5], [3.5, 9], [0.5, 4.5]], xpMat);
    b.set(3, 3, f === 0 ? M.white : flat(C.xpHi));
  });
  out.xp_m = sheet(9, 12, 2, (b, f) => {
    b.poly([[4.5, 0], [8.5, 6], [4.5, 12], [0.5, 6]], xpMat);
    b.set(3, 4, M.white);
    b.set(4, 3, f === 0 ? M.white : flat(C.xpHi));
  });
  out.xp_l = sheet(12, 16, 2, (b, f) => {
    b.poly([[6, 0], [11.5, 8], [6, 16], [0.5, 8]], xpMat);
    b.poly([[6, 3], [9, 8], [6, 13], [3, 8]], flat(C.xpHi));
    b.set(5, 5, f === 0 ? M.white : flat(C.xpHi));
  });
  const shardMat = mat(C.shardHi, C.shard, C.shardLo);
  out.shard = sheet(9, 12, 2, (b, f) => {
    b.poly([[4.5, 0], [8.5, 4], [6, 12], [3, 12], [0.5, 4]], shardMat);
    b.line(4, 2, 4, 9, flat(C.shardHi));
    if (f === 1) b.set(2, 3, M.white);
  });
  out.heal = sheet(11, 10, 2, (b, f) => {
    const hm = mat(0xffa0b0, C.heal, 0xb02040);
    b.circle(3, 3.5, 3, hm);
    b.circle(8, 3.5, 3, hm);
    b.poly([[0, 4], [11, 4], [5.5, 10]], hm);
    b.set(3, 2, f === 0 ? M.white : flat(0xffd0d8));
  });
  out.core = sheet(15, 15, 4, (b, f) => {
    b.circle(7.5, 7.5, 6.5, mat(0xffffff, 0xffe070, 0xd09020));
    b.circle(7.5, 7.5, 4, flat([0x6ef4ff, 0xc890ff, 0xffcf4a, 0x9cff8a][f]));
    b.circle(7.5, 7.5, 2, M.white);
  });

  // ---- Muzzle flashes (additive) ----
  out.muzzle_small = sheet(12, 12, 3, (b, f) => {
    if (f === 0) {
      b.circle(6, 6, 4, Y);
      b.circle(6, 6, 2.5, W);
      b.rect(6, 5, 6, 2, Y2);
    } else if (f === 1) {
      b.circle(6, 6, 3, O);
      b.circle(6, 6, 1.5, Y2);
      b.rect(7, 5, 5, 1, Y);
    } else b.circle(6, 6, 1.5, O);
  }, null);
  out.muzzle_big = sheet(20, 20, 3, (b, f) => {
    const r = [8, 6, 3][f];
    b.circle(10, 10, r, O);
    b.circle(10, 10, r * 0.7, Y);
    if (f < 2) b.circle(10, 10, r * 0.4, W);
    if (f === 0) {
      b.poly([[10, 6], [20, 10], [10, 14]], Y2);
      b.line(10, 10, 4, 2, Y);
      b.line(10, 10, 4, 18, Y);
    }
  }, null);
  out.muzzle_rail = sheet(18, 18, 3, (b, f) => {
    const r = [7, 5, 2][f];
    b.circle(9, 9, r, CY);
    b.circle(9, 9, r * 0.55, W);
    if (f === 0) {
      b.rect(0, 8, 18, 2, CY2);
      b.rect(8, 0, 2, 18, CY);
    }
  }, null);
  out.muzzle_beam = sheet(12, 12, 2, (b, f) => {
    b.circle(6, 6, f === 0 ? 5 : 4, CY);
    b.circle(6, 6, f === 0 ? 3 : 2.5, W);
  }, null);

  // ---- Impacts / explosions ----
  out.hit_spark = sheet(13, 13, 4, (b, f) => {
    const L = [6, 5, 3, 1][f];
    const col = f < 2 ? W : Y;
    b.line(6 - L, 6, 6 + L, 6, col);
    b.line(6, 6 - L, 6, 6 + L, col);
    if (f < 3) {
      const d = Math.round(L * 0.6);
      b.line(6 - d, 6 - d, 6 + d, 6 + d, Y);
      b.line(6 - d, 6 + d, 6 + d, 6 - d, Y);
    }
    if (f === 0) b.circle(6.5, 6.5, 2, W);
  }, null);
  const E1 = flat(0xffffff, true);
  const E2 = flat(0xfff0a0, true);
  const E3 = flat(0xffb040, true);
  const E4 = flat(0xe0503a, true);
  const E5 = flat(0x6a3a4a, true);
  const E6 = flat(0x3a2838, true);
  out.explosion = sheet(48, 48, 7, (b, f) => {
    const cx = 24;
    const cy = 24;
    const radii = [9, 15, 19, 21, 21, 19, 15];
    const r = radii[f];
    if (f <= 1) {
      b.circle(cx, cy, r, E2);
      b.circle(cx, cy, r * 0.7, E1);
    } else if (f <= 3) {
      b.circle(cx, cy, r, E4);
      b.circle(cx, cy - 1, r * 0.8, E3);
      b.circle(cx, cy - 2, r * 0.5, E2);
      if (f === 2) b.circle(cx, cy - 2, r * 0.25, E1);
    } else {
      // smoke break-up
      const puffs = [
        [-9, -6],
        [8, -7],
        [-6, 7],
        [9, 6],
        [0, -12],
        [0, 0],
      ];
      for (const [dx, dy] of puffs) {
        const pr = (f === 4 ? 8 : f === 5 ? 6.5 : 4.5) - (dx === 0 && dy === 0 ? 0 : 1);
        b.circle(cx + dx * (1 + (f - 4) * 0.25), cy + dy * (1 + (f - 4) * 0.25) - (f - 4) * 2, pr, f === 6 ? E6 : E5);
      }
      if (f === 4) b.circle(cx, cy - 2, 6, E4);
    }
  }, null);
  out.smoke = sheet(12, 12, 4, (b, f) => {
    const r = [3, 4.5, 5, 4][f];
    b.circle(6, 6, r, flat(f < 2 ? 0x8a8098 : 0x5a5068, true));
    if (f < 2) b.circle(5, 5, r * 0.5, flat(0xb0a8c0, true));
  }, null);
  out.ice_burst = sheet(20, 20, 3, (b, f) => {
    const L = [9, 7, 4][f];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.line(10, 10, 10 + Math.cos(a) * L, 10 + Math.sin(a) * L, ICE);
    }
    b.circle(10, 10, 3 - f, W);
  }, null);

  // ---- Allies ----
  out.drone = sheet(16, 12, 2, (b, f) => {
    b.ellipse(8, 6, 6, 4, mat(0xffffff, 0xd8dcf0, 0x8890b0));
    b.rect(4, 5, 8, 2, M.gunDark);
    b.rect(9, 5, 2, 2, flat(0x9cff8a));
    if (f === 0) b.line(1, 1, 6, 1, M.gunDark);
    else b.line(10, 1, 15, 1, M.gunDark);
    b.set(8, 2, M.gunDark);
  });
  out.turret = sheet(18, 18, 2, (b, f) => {
    b.line(4, 17, 9, 11, M.gunDark);
    b.line(14, 17, 9, 11, M.gunDark);
    b.line(9, 17, 9, 11, M.gunDark);
    b.ellipse(9, 8, 5, 4, mat(0xffffff, 0xd8dcf0, 0x8890b0));
    b.rect(10, 7, 7, 2, M.gunDark);
    b.rect(7, 7, 2, 2, f === 0 ? flat(0x9cff8a) : flat(0xe0ffd8));
    b.rect(5, 3, 8, 1, M.gunDark);
  });
  out.crown = sheet(11, 9, 2, (b, f) => {
    b.poly([[0, 8], [0, 2], [3, 5], [5.5, 0], [8, 5], [11, 2], [11, 8]], flat(f === 0 ? 0xffcf4a : 0xfff0a0));
    b.set(5, 5, flat(0xff4466));
  });
  out.orbit_blade = sheet(12, 12, 1, (b) => {
    b.poly([[1, 6], [6, 0], [11, 3], [7, 5], [11, 9], [6, 12]], CY);
    b.poly([[3, 6], [6, 2], [8, 4], [6, 6], [8, 8], [6, 10]], W);
  }, 0x0a3a4a);
  out.singularity = sheet(28, 28, 4, (b, f) => {
    ring(b, 14, 14, 9 + (f % 2), 12, flat(0x6ef4ff, true), (f * Math.PI) / 2, (f * Math.PI) / 2 + Math.PI * 1.4);
    b.circle(14, 14, 8, flat(0x1a2a5a));
    b.circle(14, 14, 5, flat(0x0a0a1a));
    b.circle(14, 14, 2, W);
  }, null);
  out.phantom = sheet(8, 8, 1, (b) => b.circle(4, 4, 3.5, CY), null);

  // ---- UI-ish world sprites ----
  out.crosshair = sheet(15, 15, 2, (b, f) => {
    const col = f === 0 ? W : flat(0xff8aa0, true);
    const gap = 3;
    b.rect(7, 0, 1, 7 - gap, col);
    b.rect(7, 8 + gap, 1, 7 - gap, col);
    b.rect(0, 7, 7 - gap, 1, col);
    b.rect(8 + gap, 7, 7 - gap, 1, col);
    b.set(7, 7, f === 0 ? CY : col);
  }, 0x120a1a);
  out.warn = sheet(9, 9, 2, (b, f) => {
    b.poly([[4.5, 0], [9, 9], [0, 9]], f === 0 ? flat(0xffcf4a) : flat(0xff5c7a));
    b.rect(4, 3, 1, 3, M.black);
    b.set(4, 7, M.black);
  });
  out.arrow = sheet(7, 9, 1, (b) => {
    b.poly([[0, 0], [7, 4.5], [0, 9], [2, 4.5]], flat(0xff5c7a));
  });
  return out;
}

function ring(b: PixelBuf, cx: number, cy: number, r0: number, r1: number, m: number, from: number, to: number): void {
  const R = Math.ceil(r1 + 1);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d < r0 || d > r1) continue;
      let a = Math.atan2(y + 0.5, x + 0.5);
      if (a < 0) a += Math.PI * 2;
      let aa = a;
      while (aa < from) aa += Math.PI * 2;
      if (aa > to) continue;
      b.set(Math.floor(cx) + x, Math.floor(cy) + y, m);
    }
  }
}
