// Boss sprites: the Gate Warden (heavy mech beast) and Orbis (rift eye).

import { PixelBuf, Sheet, flat } from './pixel';
import { C, M } from './palette';
import { ring } from './enemiesArt';

export const WARDEN_FW = 124;
export const WARDEN_FH = 106;
/** Chest core position inside a warden frame (before lean offsets). */
export const WARDEN_CORE = { x: 60, y: 47 };

export const WARDEN_ANIM = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  slamUp: [6],
  slamDown: [7],
  charge: [8],
  stun: [9],
  mortar: [10],
};

interface WardenPose {
  bob: number;
  legA: number;
  legB: number;
  arms: 'idle' | 'up' | 'down' | 'back';
  lean: number;
  slump: number;
  cannonGlow: boolean;
  visorDim?: boolean;
}

function warden(p: WardenPose): PixelBuf {
  const b = new PixelBuf(WARDEN_FW, WARDEN_FH);
  const ox = p.lean;
  const oy = p.bob + p.slump;
  // back cannons
  const cg = p.cannonGlow ? M.glowHi : M.glow;
  b.thick(40 + ox, 32 + oy, 33 + ox, 11 + oy, 7, M.steelDark);
  b.thick(52 + ox, 30 + oy, 50 + ox, 8 + oy, 7, M.steelDark);
  b.circle(33 + ox, 11 + oy, 3, M.steel);
  b.circle(50 + ox, 8 + oy, 3, M.steel);
  b.set(33 + ox, 10 + oy, cg);
  b.set(50 + ox, 7 + oy, cg);
  if (p.cannonGlow) {
    b.circle(33 + ox, 10 + oy, 1.5, M.glowHi);
    b.circle(50 + ox, 7 + oy, 1.5, M.glowHi);
  }
  // back arm (far)
  const farFist =
    p.arms === 'up' ? [38, 8] : p.arms === 'down' ? [34, 94] : p.arms === 'back' ? [22, 58] : [30, 70];
  b.ellipse(40 + ox, 34 + oy, 12, 10, M.steelDark);
  b.thick(38 + ox, 40 + oy, farFist[0] + ox * 0.5, farFist[1] + (p.arms === 'down' ? 0 : oy), 9, M.steelDark);
  b.ellipse(farFist[0] + ox * 0.5, farFist[1] + (p.arms === 'down' ? 0 : oy), 9, 8, M.steelDark);
  // legs
  const legY = 64 + oy;
  const footY = 98;
  b.thick(50, legY, 42 + p.legA, 80 + oy * 0.5, 11, M.steelDark);
  b.thick(42 + p.legA, 80 + oy * 0.5, 46 + p.legA, footY - 2, 9, M.steelDark);
  b.rect(37 + p.legA, footY - 3, 17, 6, M.steel);
  b.thick(68, legY, 76 + p.legB, 80 + oy * 0.5, 12, M.steel);
  b.thick(76 + p.legB, 80 + oy * 0.5, 72 + p.legB, footY - 2, 10, M.steel);
  b.rect(64 + p.legB, footY - 3, 19, 6, M.steelDark);
  b.set(79 + p.legB, 80 + oy * 0.5, M.glow);
  // pelvis & torso
  b.ellipse(59 + ox * 0.5, 64 + oy, 14, 7, M.enemyDark);
  b.poly(
    [
      [38 + ox, 28 + oy],
      [82 + ox, 28 + oy],
      [75 + ox, 66 + oy],
      [44 + ox, 66 + oy],
    ],
    M.steel,
  );
  for (let i = 0; i < 4; i++) b.rect(46 + ox, 56 + oy + i * 2 - 6, 28, 1, M.enemy);
  b.circle(WARDEN_CORE.x + ox, WARDEN_CORE.y + oy, 9.5, M.steelDark);
  // cracks with rift glow
  b.line(44 + ox, 34 + oy, 49 + ox, 40 + oy, M.glow);
  b.line(76 + ox, 36 + oy, 72 + ox, 42 + oy, M.glow);
  // head
  const hx = 62 + ox + (p.lean > 0 ? 4 : 0);
  const hy = 24 + oy + (p.lean > 0 ? 6 : 0) + (p.slump > 0 ? 4 : 0);
  b.taper(hx - 6, hy - 5, hx - 12, hy - 17, 4, 1, M.bone);
  b.taper(hx + 6, hy - 5, hx + 12, hy - 17, 4, 1, M.bone);
  b.ellipse(hx, hy, 10, 7, M.steelDark);
  b.rect(hx, hy - 2, 9, 3, p.visorDim ? M.steel : M.glow);
  if (!p.visorDim) b.rect(hx + 5, hy - 2, 3, 1, M.glowHi);
  // front arm (near)
  const nearFist =
    p.arms === 'up' ? [88, 6] : p.arms === 'down' ? [96, 94] : p.arms === 'back' ? [70, 60] : [96, 72];
  b.ellipse(82 + ox, 33 + oy, 14, 11, M.steel);
  for (let i = 0; i < 3; i++) {
    b.poly(
      [
        [76 + ox + i * 6, 25 + oy],
        [80 + ox + i * 6, 25 + oy],
        [79 + ox + i * 6, 17 + oy - (i === 1 ? 3 : 0)],
      ],
      M.bone,
    );
  }
  const nfy = nearFist[1] + (p.arms === 'down' ? 0 : oy);
  b.thick(86 + ox, 40 + oy, nearFist[0] + ox * 0.5, nfy, 10, M.steel);
  b.ellipse(nearFist[0] + ox * 0.5, nfy, 11, 10, M.steel);
  for (let i = -1; i <= 1; i++) b.set(nearFist[0] + ox * 0.5 + 6, nfy + i * 3, M.glow);
  b.resolve().outline(C.ink);
  return b;
}

/** Per-frame (lean, bob+slump) offsets so overlays can follow the chest. */
export const WARDEN_OFFS: [number, number][] = [];

export function buildWarden(): Sheet {
  const poses: WardenPose[] = [
    { bob: 0, legA: 0, legB: 0, arms: 'idle', lean: 0, slump: 0, cannonGlow: false },
    { bob: 1, legA: 0, legB: 0, arms: 'idle', lean: 0, slump: 0, cannonGlow: false },
    { bob: 0, legA: -4, legB: 4, arms: 'idle', lean: 1, slump: 0, cannonGlow: false },
    { bob: -2, legA: 0, legB: 0, arms: 'idle', lean: 1, slump: 0, cannonGlow: false },
    { bob: 0, legA: 4, legB: -4, arms: 'idle', lean: 1, slump: 0, cannonGlow: false },
    { bob: -2, legA: 0, legB: 0, arms: 'idle', lean: 1, slump: 0, cannonGlow: false },
    { bob: -3, legA: -2, legB: 2, arms: 'up', lean: -2, slump: 0, cannonGlow: false },
    { bob: 6, legA: -5, legB: 5, arms: 'down', lean: 2, slump: 0, cannonGlow: false },
    { bob: 2, legA: -6, legB: 6, arms: 'back', lean: 6, slump: 0, cannonGlow: false },
    { bob: 0, legA: -3, legB: 3, arms: 'down', lean: 1, slump: 9, cannonGlow: false, visorDim: true },
    { bob: 1, legA: -3, legB: 3, arms: 'idle', lean: -1, slump: 0, cannonGlow: true },
  ];
  const sheet = new Sheet(WARDEN_FW, WARDEN_FH, poses.length);
  WARDEN_OFFS.length = 0;
  poses.forEach((p, i) => {
    WARDEN_OFFS.push([p.lean, p.bob + p.slump]);
    sheet.put(i, warden(p));
  });
  return sheet;
}

/** Chest core overlay: 0 = shut, 1 = open, 2 = open & hot. */
export function buildWardenCore(): Sheet {
  const sheet = new Sheet(22, 22, 3);
  for (let f = 0; f < 3; f++) {
    const b = new PixelBuf(22, 22);
    if (f === 0) {
      b.circle(11, 11, 8, M.steel);
      b.line(5, 11, 17, 11, M.steelDark);
      b.line(11, 5, 11, 17, M.steelDark);
      b.set(11, 11, M.glow);
    } else {
      b.circle(11, 11, 8, M.enemyDark);
      b.circle(11, 11, 6, f === 2 ? flat(C.enemyGlowHi) : flat(C.enemyGlow));
      b.circle(11, 11, 3, f === 2 ? M.white : M.glowHi);
      b.set(9, 8, M.white);
    }
    b.resolve().outline(C.ink);
    sheet.put(f, b);
  }
  return sheet;
}

export const ORBIS_FW = 100;
export const ORBIS_FH = 100;

function orbis(f: number): PixelBuf {
  const b = new PixelBuf(ORBIS_FW, ORBIS_FH);
  const cx = 50;
  const cy = 50;
  const pts: number[][] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.1;
    const r = i % 2 === 0 ? 43 : 35 + ((i * 7) % 5);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  b.poly(pts, M.enemyDark);
  const inner: number[][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.3;
    const r = i % 2 === 0 ? 31 : 27;
    inner.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  b.poly(inner, M.crystal);
  b.ellipse(cx, cy, 24, 19, M.black);
  // rift cracks
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    b.line(cx + Math.cos(a) * 26, cy + Math.sin(a) * 21, cx + Math.cos(a) * 40, cy + Math.sin(a) * 38, M.glow);
  }
  if (f === 2) {
    // closed lids
    b.ellipse(cx, cy, 21, 15, M.enemy);
    b.line(cx - 20, cy, cx + 20, cy, M.black);
    b.line(cx - 16, cy + 2, cx + 16, cy + 2, flat(C.enemyLo));
  } else {
    b.ellipse(cx, cy, 20, 15, M.bone);
    const ir = f === 1 ? 10 : f === 3 ? 11 : 9;
    b.circle(cx, cy, ir, f === 3 ? flat(0xffe0f0) : flat(C.enemyGlow));
    b.circle(cx, cy, ir - 3, f === 3 ? M.white : flat(C.enemyGlowHi));
    b.rect(cx - 1, cy - (f === 3 ? 5 : 8), 3, f === 3 ? 10 : 16, M.black);
    b.set(cx - 6, cy - 6, M.white);
    b.set(cx - 5, cy - 6, M.white);
    b.set(cx - 6, cy - 5, M.white);
  }
  b.resolve().outline(C.ink);
  return b;
}

export const ORBIS_ANIM = { idle: [0, 1], closed: [2], charge: [3] };

export function buildOrbis(): Sheet {
  const sheet = new Sheet(ORBIS_FW, ORBIS_FH, 4);
  for (let i = 0; i < 4; i++) sheet.put(i, orbis(i));
  return sheet;
}

/** Orbiting shield shards: 0 idle, 1 pulse, 2 cracked. */
export function buildOrbisShard(): Sheet {
  const sheet = new Sheet(22, 30, 3);
  for (let f = 0; f < 3; f++) {
    const b = new PixelBuf(22, 30);
    b.poly(
      [
        [11, 2],
        [19, 14],
        [11, 27],
        [3, 14],
      ],
      M.crystal,
    );
    b.poly(
      [
        [11, 7],
        [15, 14],
        [11, 22],
        [7, 14],
      ],
      f === 1 ? flat(C.enemyGlowHi) : flat(C.enemyGlow),
    );
    b.set(11, 12, M.white);
    if (f === 2) {
      b.line(8, 8, 13, 16, M.black);
      b.line(13, 16, 10, 23, M.black);
    }
    b.resolve().outline(C.ink);
    sheet.put(f, b);
  }
  return sheet;
}

/** Rift tear hazard (zone 3). */
export function buildRiftTear(): Sheet {
  const sheet = new Sheet(26, 46, 3);
  for (let f = 0; f < 3; f++) {
    const b = new PixelBuf(26, 46);
    const pts: number[][] = [];
    const wob = [0, 1, -1][f];
    for (let i = 0; i <= 10; i++) {
      const y = 3 + i * 4;
      const w = Math.sin((i / 10) * Math.PI) * (8 + wob) + ((i * 3 + f) % 3) - 1;
      pts.push([13 + w, y]);
    }
    for (let i = 10; i >= 0; i--) {
      const y = 3 + i * 4;
      const w = Math.sin((i / 10) * Math.PI) * (8 - wob) + ((i * 5 + f) % 3) - 1;
      pts.push([13 - w, y]);
    }
    b.poly(pts, M.glow);
    const inner = pts.map(([x, y]) => [13 + (x - 13) * 0.6, 23 + (y - 23) * 0.9]);
    b.poly(inner, M.black);
    b.line(13, 8, 13, 38, flat(0x3a1850));
    b.resolve().outline(C.ink);
    sheet.put(f, b);
  }
  return sheet;
}
