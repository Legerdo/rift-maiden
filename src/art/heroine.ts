// Sera – the Rift Maiden. Built as a layered puppet:
//   [ponytail + scarf tails (runtime verlet)] < body frame < head < gun arm
// Head is hand-pixelled ASCII; body frames are posed with 2-bone IK legs so
// run/jump/dash poses stay consistent. Everything faces right; the game flips.

import { PixelBuf, Sheet, mat, flat } from './pixel';
import { C, M } from './palette';

export const HERO_FW = 64;
export const HERO_FH = 64;
/** Frame pixel that sits on the world position (feet). */
export const HERO_ORIGIN = { x: 32, y: 62 };

export const HEAD_W = 24;
export const HEAD_H = 23;
/** Neck point inside the head texture. */
export const HEAD_NECK = { x: 16, y: 20 };
/** Ponytail root (ribbon) inside the head texture. */
export const HEAD_HAIR_ROOT = { x: 5, y: 5 };

export const ARM_W = 46;
export const ARM_H = 16;
export const ARM_PIVOT = { x: 6, y: 8 };

export interface HeroAnchors {
  head: { x: number; y: number };
  shoulder: { x: number; y: number };
  scarf: { x: number; y: number };
}

export const HERO_ANIM = {
  idle: [0, 1, 2, 3],
  run: [4, 5, 6, 7, 8, 9],
  jump: [10],
  fall: [11],
  dash: [12],
  hit: [13],
  skill: [14, 15],
  land: [16],
  kneel: [17],
  victory: [18],
};

export const HEAD_FRAME = { normal: 0, blink: 1, hurt: 2, focus: 3, happy: 4 };

// ---------------------------------------------------------------------------
// Head (22x21 art, 1px padding for the outline)
// ---------------------------------------------------------------------------
const HEAD_ROWS = [
  '........vwwwwv........',
  '......vwwWWWWwwv......',
  '.....vwwwwwwwwwwv.....',
  '...RrwwWWWWWWWWwwv....',
  '..RRRwWwwwwwwwwWwwv...',
  '..rRRvwwwwwwwwwwwwwv..',
  '...rvvwwwwwwvwwwwwvwv.',
  '...vvvwwwwwvwvwwwvwvw.',
  '..vVvwwwwwvwSvwwvSvwv.',
  '..vVwwwwwvwSSSvwSSSvw.',
  '..vVwwwKKKvSSSSSSSSSw.',
  '..vvwwKkcKvSeeeSSSeeS.',
  '..vvwwKccKvSHEESSSHES.',
  '..vvvwwKKwvSEeESSSEeS.',
  '..vvvwwwwwvSCCCSSSCCS.',
  '...vvvwwwwwsSbbSSSSbS.',
  '...vvvvwwwwsSSSSSmSSs.',
  '....vvvwwwwwsSSSSSSs..',
  '....vvvvwww..ssSSss...',
  '.....vvvww............',
  '......vvv.............',
];

function headMap(): Record<string, number> {
  return {
    W: flat(C.hairHi),
    w: flat(C.hairMid),
    v: flat(C.hairLo),
    V: flat(C.hairDeep),
    S: flat(C.skin),
    s: flat(C.skinLo),
    b: flat(C.blush),
    e: flat(C.lash),
    E: flat(C.eye),
    C: flat(C.eyeGlow),
    H: flat(0xffffff),
    m: flat(C.mouth),
    R: flat(C.scarf),
    r: flat(C.scarfLo),
    K: flat(C.gunDeep),
    k: flat(C.gun),
    c: flat(C.cyan),
  };
}

function setCh(rows: string[], x: number, y: number, ch: string): void {
  const r = rows[y];
  rows[y] = r.substring(0, x) + ch + r.substring(x + 1);
}

function headVariant(kind: keyof typeof HEAD_FRAME): string[] {
  const rows = HEAD_ROWS.slice();
  const eyes: [number, number][] = [];
  for (let y = 11; y <= 14; y++) {
    for (const x of [12, 13, 14, 18, 19]) eyes.push([x, y]);
  }
  const clearEyes = () => eyes.forEach(([x, y]) => setCh(rows, x, y, 'S'));
  switch (kind) {
    case 'normal':
      break;
    case 'blink':
      clearEyes();
      for (const x of [12, 13, 14, 18, 19]) setCh(rows, x, 13, 'e');
      setCh(rows, 11, 13, 'e');
      break;
    case 'hurt':
      clearEyes();
      // > <
      setCh(rows, 12, 11, 'e');
      setCh(rows, 13, 12, 'e');
      setCh(rows, 14, 12, 'e');
      setCh(rows, 12, 13, 'e');
      setCh(rows, 19, 11, 'e');
      setCh(rows, 18, 12, 'e');
      setCh(rows, 19, 13, 'e');
      setCh(rows, 16, 16, 'm');
      setCh(rows, 17, 16, 'm');
      setCh(rows, 17, 17, 'm');
      break;
    case 'focus':
      for (const x of [12, 13, 14]) {
        setCh(rows, x, 12, 'C');
        setCh(rows, x, 13, 'E');
      }
      setCh(rows, 12, 12, 'H');
      setCh(rows, 18, 12, 'H');
      setCh(rows, 19, 12, 'C');
      setCh(rows, 19, 13, 'E');
      setCh(rows, 17, 16, 'S');
      setCh(rows, 16, 16, 'm');
      break;
    case 'happy':
      clearEyes();
      // ^ ^
      setCh(rows, 12, 13, 'e');
      setCh(rows, 13, 12, 'e');
      setCh(rows, 14, 13, 'e');
      setCh(rows, 18, 13, 'e');
      setCh(rows, 19, 12, 'e');
      setCh(rows, 16, 16, 'm');
      setCh(rows, 17, 16, 'm');
      setCh(rows, 13, 15, 'b');
      break;
  }
  return rows;
}

export function buildHead(): Sheet {
  const kinds: (keyof typeof HEAD_FRAME)[] = ['normal', 'blink', 'hurt', 'focus', 'happy'];
  const sheet = new Sheet(HEAD_W, HEAD_H, kinds.length);
  const map = headMap();
  kinds.forEach((k, i) => {
    const b = new PixelBuf(HEAD_W, HEAD_H);
    b.ascii(headVariant(k), map, 1, 1);
    b.resolve().outline(C.ink);
    sheet.put(i, b);
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------
const TORSO = [
  '...RRRRR...',
  '..RRrRRRR..',
  '.DNNRrRNND.',
  'DNNTTRTTNND',
  'DNcTTrTTcND',
  'DNNTTTTTNND',
  '.DNNTTTNND.',
  '.DNNTTTNND.',
  '.DNNNTNNND.',
  '..DNNTNND..',
  '..kkkgkkk..',
  '..DNNNNND..',
  '...DNNND...',
];

const GA = 59; // ankle y when standing on the ground
const THIGH = 9;
const SHIN = 8;

interface LegPose {
  ax: number;
  ay: number;
  foot: number;
}

interface Pose {
  hx: number;
  hy: number;
  tdx?: number;
  tdy?: number;
  back: LegPose;
  front: LegPose;
  /** Back arm elbow / hand relative to the back shoulder. */
  arm: [number, number, number, number];
  flare?: number;
  sway?: number;
  headDy?: number;
}

function solveKnee(hx: number, hy: number, ax: number, ay: number): [number, number] {
  let dx = ax - hx;
  let dy = ay - hy;
  let d = Math.hypot(dx, dy);
  const maxD = THIGH + SHIN - 0.05;
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  }
  const a = Math.atan2(dy, dx);
  const cosB = (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * Math.max(0.001, d));
  const b = Math.acos(Math.max(-1, Math.min(1, cosB)));
  return [hx + Math.cos(a - b) * THIGH, hy + Math.sin(a - b) * THIGH];
}

const matSockBack = mat(C.sock, C.sockLo, 0x100c1a);
const matBootBack = mat(C.bootLo, 0xb4b4d0, 0x7c7ca0);
const matSkinBack = mat(C.skinLo, C.skinLo, 0xd08c7c);
const matBelt = flat(0x1a1428);

function drawLeg(b: PixelBuf, hx: number, hy: number, leg: LegPose, back: boolean): void {
  const [kx, ky] = solveKnee(hx, hy, leg.ax, leg.ay);
  const skin = back ? matSkinBack : M.skin;
  const sock = back ? matSockBack : M.sock;
  const boot = back ? matBootBack : M.boot;
  // Thigh: skin just under the skirt, stocking below.
  b.taper(hx, hy, kx, ky, 4.6, 3.6, sock);
  const sx = hx + (kx - hx) * 0.55;
  const sy = hy + (ky - hy) * 0.55;
  b.taper(hx, hy, sx, sy, 4.6, 4.0, skin);
  // Knee-high boot
  b.taper(kx, ky, leg.ax, leg.ay, 3.9, 3.3, boot);
  b.circle(kx, ky + 0.5, 2.1, boot);
  // Foot
  const tx = leg.ax + Math.cos(leg.foot) * 4;
  const ty = leg.ay + Math.sin(leg.foot) * 4;
  b.thick(leg.ax, leg.ay, tx, ty, 3.6, boot);
  b.circle(leg.ax - 0.5, leg.ay, 1.9, boot);
  if (Math.abs(leg.foot) < 0.15) {
    // glowing sole
    for (let x = Math.round(leg.ax - 2); x <= Math.round(tx + 1); x++) b.set(x, Math.round(leg.ay + 2), back ? M.cyanLo : M.cyan);
  } else {
    b.set(tx + 1, ty + 1, back ? M.cyanLo : M.cyan);
  }
  // boot LED
  if (!back) b.set(kx + 2, ky + 1, M.cyan);
}

function drawSkirt(b: PixelBuf, cx: number, sy: number, flare: number, sway: number): void {
  const top = [cx - 4, sy];
  const top2 = [cx + 4, sy];
  const bot2 = [cx + 7 + flare + sway, sy + 5];
  const bot = [cx - 6 - flare + sway, sy + 5];
  b.poly([top, top2, bot2, bot], M.jacketDark);
  // pleats
  for (const f of [-0.6, -0.2, 0.2, 0.6]) {
    const x0 = cx + 0.5 + f * 4.5;
    const x1 = cx + 0.5 + sway + f * (7.5 + flare);
    b.line(x0, sy + 1, x1, sy + 4, M.jacket);
  }
  // hem
  const hemMat = flat(C.shirt);
  for (let x = Math.round(bot[0]); x <= Math.round(bot2[0]) - 1; x++) b.set(x, sy + 5, hemMat);
}

function drawBackArm(b: PixelBuf, sx: number, sy: number, arm: Pose['arm']): void {
  const ex = sx + arm[0];
  const ey = sy + arm[1];
  const hx = sx + arm[2];
  const hy = sy + arm[3];
  b.thick(sx, sy, ex, ey, 3.6, M.jacketDark);
  b.thick(ex, ey, hx, hy, 3, M.jacketDark);
  b.circle(hx, hy, 1.6, M.glove);
}

function composeBody(p: Pose): { buf: PixelBuf; anchors: HeroAnchors } {
  const b = new PixelBuf(HERO_FW, HERO_FH);
  const tdx = p.tdx ?? 0;
  const tdy = p.tdy ?? 0;
  const tl = Math.round(p.hx - 5 + tdx);
  const tt = Math.round(p.hy - 13 + tdy);
  const backShoulder = { x: tl + 2, y: tt + 4 };
  drawBackArm(b, backShoulder.x, backShoulder.y, p.arm);
  drawLeg(b, p.hx - 2, p.hy, p.back, true);
  drawLeg(b, p.hx + 2, p.hy, p.front, false);
  const tmap: Record<string, number> = {
    R: M.scarf,
    r: flat(C.scarfLo),
    N: M.jacket,
    D: M.jacketDark,
    T: M.shirt,
    c: M.cyan,
    k: matBelt,
    g: M.gun,
  };
  drawSkirt(b, Math.round(p.hx + tdx * 0.5), tt + 11, p.flare ?? 0, p.sway ?? 0);
  b.ascii(TORSO, tmap, tl, tt);
  b.resolve().outline(C.ink);
  return {
    buf: b,
    anchors: {
      head: { x: tl + 5, y: tt + 1 + (p.headDy ?? 0) },
      shoulder: { x: tl + 8, y: tt + 4 },
      scarf: { x: tl + 3, y: tt + 2 },
    },
  };
}

function runPose(i: number): Pose {
  const phi = (i / 6) * Math.PI * 2;
  const legAt = (ph: number): LegPose => {
    const x = 31 + 7 * Math.cos(ph);
    const s = Math.sin(ph);
    const lift = s < 0 ? 5.5 * -s : 0;
    const foot = lift > 0.5 ? (Math.cos(ph) < 0 ? 0.9 : 0.15) : 0;
    return { ax: x, ay: GA - lift, foot };
  };
  const hy = Math.round(44 - Math.abs(Math.sin(phi)) * 1.4);
  const c = Math.cos(phi);
  return {
    hx: 31,
    hy,
    tdx: 1,
    front: legAt(phi),
    back: legAt(phi + Math.PI),
    arm: [1.5 * c - 1, 5, 3 * c, 9],
    flare: 1 + (i % 3 === 1 ? 1 : 0),
    sway: -1,
  };
}

const POSES: Pose[] = [
  // idle 0..3
  { hx: 31, hy: 43, back: { ax: 28, ay: GA, foot: 0 }, front: { ax: 35, ay: GA, foot: 0 }, arm: [-1, 6, 0, 11] },
  { hx: 31, hy: 43, back: { ax: 28, ay: GA, foot: 0 }, front: { ax: 35, ay: GA, foot: 0 }, arm: [-1, 6, 0, 11], sway: 1 },
  { hx: 31, hy: 44, back: { ax: 28, ay: GA, foot: 0 }, front: { ax: 35, ay: GA, foot: 0 }, arm: [-1, 6, 0, 11] },
  { hx: 31, hy: 44, back: { ax: 28, ay: GA, foot: 0 }, front: { ax: 35, ay: GA, foot: 0 }, arm: [-1, 6, 0, 11], sway: -1 },
  // run 4..9
  runPose(0),
  runPose(1),
  runPose(2),
  runPose(3),
  runPose(4),
  runPose(5),
  // jump 10
  { hx: 31, hy: 42, back: { ax: 27, ay: 57, foot: 0.8 }, front: { ax: 37, ay: 51, foot: 0.3 }, arm: [-3, 4, -5, 8], flare: 2 },
  // fall 11
  { hx: 31, hy: 42, back: { ax: 28, ay: 58, foot: 0.7 }, front: { ax: 35, ay: 56, foot: 0.6 }, arm: [-3, 2, -4, -3], flare: 2, sway: 1 },
  // dash 12
  { hx: 31, hy: 44, tdx: 3, back: { ax: 19, ay: 55, foot: 0.9 }, front: { ax: 39, ay: 54, foot: 0.2 }, arm: [-4, 3, -9, 4], flare: 1, sway: -3 },
  // hit 13
  { hx: 30, hy: 43, tdx: -2, back: { ax: 25, ay: 58, foot: 0.3 }, front: { ax: 34, ay: GA, foot: 0 }, arm: [-4, -1, -8, -4], flare: 1, sway: 2 },
  // skill 14..15
  { hx: 31, hy: 44, back: { ax: 25, ay: GA, foot: 0 }, front: { ax: 37, ay: GA, foot: 0 }, arm: [0, -5, 1, -11], flare: 1 },
  { hx: 31, hy: 44, back: { ax: 25, ay: GA, foot: 0 }, front: { ax: 37, ay: GA, foot: 0 }, arm: [0, -5, 2, -12], flare: 2 },
  // land 16
  { hx: 31, hy: 47, back: { ax: 26, ay: GA, foot: 0 }, front: { ax: 36, ay: GA, foot: 0 }, arm: [-2, 5, -1, 10], flare: 2 },
  // kneel 17
  { hx: 30, hy: 51, tdx: 2, back: { ax: 20, ay: 60, foot: 0.1 }, front: { ax: 37, ay: GA, foot: 0 }, arm: [0, 6, 2, 11], flare: 2, headDy: 2 },
  // victory 18
  { hx: 31, hy: 43, back: { ax: 28, ay: GA, foot: 0 }, front: { ax: 35, ay: GA, foot: 0 }, arm: [0, -5, -1, -11] },
];

export const HERO_ANCHORS: HeroAnchors[] = [];

export function buildBody(): Sheet {
  const sheet = new Sheet(HERO_FW, HERO_FH, POSES.length);
  HERO_ANCHORS.length = 0;
  POSES.forEach((p, i) => {
    const { buf, anchors } = composeBody(p);
    HERO_ANCHORS.push(anchors);
    sheet.put(i, buf);
  });
  return sheet;
}

// ---------------------------------------------------------------------------
// Gun arms (pivot at the shoulder, pointing +x)
// ---------------------------------------------------------------------------
const matCrystal = mat(0xe8ffff, 0x6ef4ff, 0x1fa8d2);
const matRedGrip = M.scarf;

function armBase(b: PixelBuf): void {
  const px = ARM_PIVOT.x;
  const py = ARM_PIVOT.y;
  b.thick(px, py, px + 7, py, 4, M.jacket);
  b.set(px + 8, py - 1, M.cyan);
  b.set(px + 8, py, M.cyan);
  b.set(px + 8, py + 1, M.cyan);
}

function hand(b: PixelBuf, x: number, y: number): void {
  b.circle(x, y, 2, M.glove);
}

export type GunKind = 'smg' | 'shotgun' | 'rail' | 'beam';

/** Muzzle distance from pivot along the aim for each gun sprite. */
export const GUN_MUZZLE: Record<GunKind, number> = {
  smg: 26,
  shotgun: 31,
  rail: 36,
  beam: 31,
};

export function buildArm(kind: GunKind): PixelBuf {
  const b = new PixelBuf(ARM_W, ARM_H);
  armBase(b);
  const y = ARM_PIVOT.y;
  switch (kind) {
    case 'smg':
      b.rect(15, y - 2, 12, 4, M.gun);
      b.rect(16, y - 3, 10, 1, M.gunDark);
      b.rect(27, y - 1, 5, 2, M.gunDark);
      b.rect(19, y + 2, 3, 4, M.gunDark);
      for (let x = 17; x <= 23; x++) b.set(x, y - 1, M.cyan);
      hand(b, 15, y + 1);
      break;
    case 'shotgun':
      b.rect(14, y - 2, 14, 5, M.gun);
      b.rect(27, y - 2, 10, 3, M.gunDark);
      b.rect(28, y + 1, 6, 2, matRedGrip);
      b.rect(16, y - 3, 8, 1, M.gunDark);
      b.set(20, y, flat(0xffb040));
      b.set(22, y, flat(0xffb040));
      hand(b, 15, y + 1);
      break;
    case 'rail':
      b.rect(14, y - 2, 17, 5, M.gun);
      b.rect(19, y - 4, 7, 2, M.gunDark);
      b.rect(30, y - 3, 11, 2, M.gunDark);
      b.rect(30, y + 1, 11, 2, M.gunDark);
      for (let x = 31; x <= 39; x += 2) {
        b.set(x, y - 1, M.cyan);
        b.set(x, y, M.cyan);
      }
      b.rect(16, y + 3, 3, 3, M.gunDark);
      hand(b, 15, y + 1);
      break;
    case 'beam':
      b.ellipse(21, y + 0.5, 7, 3, M.gun);
      b.poly(
        [
          [27, y - 4],
          [34, y + 0.5],
          [27, y + 5],
        ],
        matCrystal,
      );
      b.rect(33, y - 2, 3, 5, M.gunDark);
      b.set(24, y - 1, M.cyan);
      b.set(26, y - 1, M.cyan);
      hand(b, 15, y + 1);
      break;
  }
  b.resolve().outline(C.ink);
  return b;
}
