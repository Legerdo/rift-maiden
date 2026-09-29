// Enemy sprite generation. Each archetype has a silhouette that reads at a
// glance: dome bug, horned beast, hooded gunner, wasp, eyeball, tower shield,
// robed priest, glowing blob. All drawn facing right with 2px padding.

import { PixelBuf, Sheet, flat } from './pixel';
import { C, M } from './palette';
import type { EnemyId } from '../data/enemies';

export interface EnemyArt {
  fw: number;
  fh: number;
  /** Sprite origin (0..1). Ground enemies use bottom-centre. */
  ox: number;
  oy: number;
  anims: Record<string, number[]>;
  fps: number;
}

export const ENEMY_ART: Record<EnemyId, EnemyArt> = {
  crawler: { fw: 32, fh: 22, ox: 0.5, oy: 20 / 22, anims: { walk: [0, 1, 2, 3] }, fps: 10 },
  charger: { fw: 48, fh: 36, ox: 0.5, oy: 34 / 36, anims: { walk: [0, 1, 2, 3], windup: [4], charge: [5], stun: [6] }, fps: 8 },
  gunner: { fw: 30, fh: 44, ox: 0.5, oy: 42 / 44, anims: { walk: [0, 1, 2, 3], aim: [4], fire: [5] }, fps: 7 },
  flyer: { fw: 32, fh: 24, ox: 0.5, oy: 0.5, anims: { fly: [0, 1, 2, 1], dive: [3] }, fps: 16 },
  watcher: { fw: 30, fh: 30, ox: 0.5, oy: 0.5, anims: { float: [0, 1, 2, 1], charge: [3] }, fps: 6 },
  shield: { fw: 42, fh: 48, ox: 0.5, oy: 46 / 48, anims: { walk: [0, 1, 2, 3], bash: [4] }, fps: 6 },
  summoner: { fw: 32, fh: 48, ox: 0.5, oy: 46 / 48, anims: { float: [0, 1], cast: [2, 3] }, fps: 4 },
  exploder: { fw: 26, fh: 26, ox: 0.5, oy: 24 / 26, anims: { roll: [0, 1, 2, 1], fuse: [3, 4] }, fps: 10 },
  rift: { fw: 26, fh: 46, ox: 0.5, oy: 0.5, anims: { idle: [0, 1, 2, 1] }, fps: 8 },
  capsule: { fw: 24, fh: 28, ox: 0.5, oy: 26 / 28, anims: { idle: [0, 1] }, fps: 3 },
};

function capsule(f: number): PixelBuf {
  const b = new PixelBuf(24, 28);
  b.poly(
    [
      [6, 6],
      [18, 6],
      [21, 12],
      [21, 24],
      [3, 24],
      [3, 12],
    ],
    M.steel,
  );
  b.rect(5, 14, 14, 3, M.cyan);
  b.rect(7, 19, 10, 2, M.steelDark);
  b.rect(10, 2, 4, 4, M.steelDark);
  b.set(11, 1, f === 0 ? M.white : M.cyan);
  b.set(12, 1, f === 0 ? M.white : M.cyan);
  b.rect(2, 24, 20, 2, M.steelDark);
  b.set(6, 9, M.white);
  return fin(b);
}

export function ring(b: PixelBuf, cx: number, cy: number, r0: number, r1: number, m: number, from = 0, to = Math.PI * 2): void {
  const R = Math.ceil(r1 + 1);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d < r0 || d > r1) continue;
      let a = Math.atan2(y + 0.5, x + 0.5);
      if (a < 0) a += Math.PI * 2;
      if (a < from || a > to) continue;
      b.set(Math.floor(cx) + x, Math.floor(cy) + y, m);
    }
  }
}

function fin(b: PixelBuf, outline = C.ink): PixelBuf {
  b.resolve().outline(outline);
  return b;
}

const LEG_OFF = [-2, 0, 2, 0];

function crawler(f: number): PixelBuf {
  const b = new PixelBuf(32, 22);
  const bob = f % 2 === 1 ? -1 : 0;
  for (let k = 0; k < 3; k++) {
    const bx = 10 + k * 5;
    const off = LEG_OFF[(f + k * 2) % 4];
    b.thick(bx, 15 + bob, bx + off - 1, 18, 2, M.enemyDark);
    b.set(bx + off - 2, 19, M.enemyDark);
  }
  b.ellipse(15.5, 11 + bob, 10, 6, M.enemy);
  b.ellipse(15.5, 14 + bob, 9, 2.5, M.enemyDark);
  for (const sx of [9, 14, 19]) {
    b.poly(
      [
        [sx - 2, 7 + bob],
        [sx + 2, 7 + bob],
        [sx - 1, 2 + bob],
      ],
      M.enemyDark,
    );
  }
  b.set(11, 9 + bob, M.glow);
  b.set(12, 10 + bob, M.glow);
  b.set(17, 8 + bob, M.glow);
  b.set(18, 9 + bob, M.glow);
  b.rect(22, 9 + bob, 3, 2, M.eye);
  b.set(23, 9 + bob, M.eyeHi);
  b.line(25, 12 + bob, 28, 14 + bob, M.bone);
  b.line(25, 14 + bob, 27, 16 + bob, M.bone);
  return fin(b);
}

function charger(f: number): PixelBuf {
  const b = new PixelBuf(48, 36);
  let bob = f < 4 && f % 2 === 1 ? -1 : 0;
  let lean = 0;
  let rear = 0;
  let headDrop = 0;
  if (f === 4) rear = 2;
  if (f === 5) lean = 3;
  if (f === 6) {
    headDrop = 3;
    bob = 1;
  }
  const legPos = [10, 15, 28, 33];
  legPos.forEach((lx, k) => {
    let off = f < 4 ? LEG_OFF[(f + k) % 4] : 0;
    if (f === 5) off = k < 2 ? -4 : 4;
    const mt = k % 2 === 0 ? M.enemyDark : M.enemy;
    b.thick(lx + lean, 22 + bob, lx + off + lean, 31, 4, mt);
    b.rect(lx + off + lean - 2, 31, 5, 2, M.bone);
  });
  b.taper(6 + lean, 16 + bob + rear, 1 + lean, 11 + bob + rear, 3, 1, M.enemy);
  b.ellipse(20 + lean, 17 + bob + rear * 0.5, 15, 9, M.enemy);
  b.ellipse(18 + lean, 12 + bob + rear * 0.5, 12, 5, M.enemyDark);
  for (let i = 0; i < 5; i++) b.set(10 + i * 4 + lean, 10 - (i === 2 ? 2 : i === 1 || i === 3 ? 1 : 0) + bob, M.glow);
  const hy = 19 + bob + headDrop;
  b.ellipse(36 + lean, hy, 7, 6, M.enemyDark);
  b.poly(
    [
      [33 + lean, hy - 7],
      [44 + lean, hy - 3],
      [44 + lean, hy + 5],
      [34 + lean, hy + 6],
    ],
    M.bone,
  );
  const hornMat = f === 4 ? M.glowHi : M.bone;
  b.taper(40 + lean, hy - 5, 46 + lean, hy - 14 + headDrop, 4, 1.5, hornMat);
  if (f === 6) {
    b.set(38 + lean, hy - 2, M.white);
    b.set(40 + lean, hy, M.white);
    b.set(40 + lean, hy - 2, M.white);
    b.set(38 + lean, hy, M.white);
  } else {
    b.rect(38 + lean, hy - 2, 2, 2, f === 4 || f === 5 ? M.eyeHi : M.eye);
  }
  return fin(b);
}

function gunner(f: number): PixelBuf {
  const b = new PixelBuf(30, 44);
  const off = f < 4 ? LEG_OFF[f] : 0;
  const bob = f < 4 && f % 2 === 1 ? -1 : 0;
  b.thick(12, 30, 11 - off, 40, 3, M.enemyDark);
  b.thick(16, 30, 17 + off, 40, 3, M.enemyDark);
  b.rect(9 - off, 40, 4, 1, M.enemyDark);
  b.rect(16 + off, 40, 4, 1, M.enemyDark);
  b.poly(
    [
      [9, 16 + bob],
      [20, 16 + bob],
      [22, 31 + bob],
      [7, 31 + bob],
    ],
    M.robe,
  );
  for (const tx of [8, 12, 16, 20]) {
    b.poly(
      [
        [tx - 1.5, 31 + bob],
        [tx + 1.5, 31 + bob],
        [tx, 34 + bob + (tx % 8 === 0 ? 1 : 0)],
      ],
      M.robe,
    );
  }
  b.line(14, 18 + bob, 14, 29 + bob, flat(C.enemyLo));
  b.ellipse(14.5, 11 + bob, 6, 6, M.robe);
  b.ellipse(16.5, 12 + bob, 3, 3, M.black);
  // glowing head core (weak point)
  b.circle(16.5, 12 + bob, 2, M.glow);
  b.set(16, 11 + bob, M.glowHi);
  const recoil = f === 5 ? -2 : 0;
  const raise = f === 4 ? -1 : 0;
  b.thick(18, 20 + bob, 25 + recoil, 21 + bob + raise, 4, M.steel);
  b.rect(25 + recoil, 19 + bob + raise, 4, 4, M.steelDark);
  if (f === 4) {
    b.circle(29.5 + recoil, 21 + bob + raise, 1.8, M.glowHi);
  } else {
    b.set(29 + recoil, 20 + bob + raise, M.glow);
    b.set(29 + recoil, 21 + bob + raise, M.glow);
  }
  return fin(b);
}

function flyer(f: number): PixelBuf {
  const b = new PixelBuf(32, 24);
  // wings behind body
  if (f === 0) b.ellipse(14, 4.5, 6, 3, M.wing);
  else if (f === 1) b.ellipse(12, 7, 7, 2.5, M.wing);
  else if (f === 2) b.ellipse(10, 9.5, 7, 2, M.wing);
  else b.ellipse(12, 6, 5, 2, M.wing);
  b.taper(4, 14, 1, 17, 2, 1, M.bone);
  b.ellipse(9.5, 13, 6, 4, M.enemy);
  b.line(7, 10, 7, 16, M.toxic);
  b.line(10, 9, 10, 17, M.toxic);
  b.ellipse(16, 11, 4, 4, M.enemyDark);
  b.ellipse(22, 11, 3.5, 3.5, M.enemy);
  b.rect(23, 10, 2, 2, f === 3 ? M.eyeHi : M.eye);
  b.line(15, 14, 13, 19, M.enemyDark);
  b.line(18, 14, 19, 19, M.enemyDark);
  // front wing
  if (f === 0) b.ellipse(17, 5, 5, 2.5, M.wing);
  else if (f === 1) b.ellipse(16, 8, 6, 2, M.wing);
  return fin(b);
}

function watcher(f: number): PixelBuf {
  const b = new PixelBuf(30, 30);
  const sway = [0, 1, 2, 1][f % 4];
  b.taper(12, 20, 9 + sway, 28, 3, 1, M.enemy);
  b.taper(15, 21, 15, 29 - (sway % 2), 3, 1, M.enemy);
  b.taper(18, 20, 21 - sway, 28, 3, 1, M.enemy);
  ring(b, 15, 14, 9, 11, M.steelDark);
  b.circle(15, 14, 8.5, M.bone);
  const irisR = f === 3 ? 5 : 4;
  b.circle(17, 14, irisR, f === 3 ? flat(C.enemyGlowHi) : flat(C.enemyGlow));
  b.rect(17, 11 + (f === 3 ? 1 : 0), 2, f === 3 ? 4 : 6, M.black);
  b.set(13, 10, M.white);
  b.set(14, 10, M.white);
  b.set(13, 11, M.white);
  b.set(15, 3, M.glow);
  b.set(15, 25, M.glow);
  b.set(4, 14, M.glow);
  b.set(26, 14, M.glow);
  return fin(b);
}

function shield(f: number): PixelBuf {
  const b = new PixelBuf(42, 48);
  const off = f < 4 ? LEG_OFF[f] : 0;
  const bob = f < 4 && f % 2 === 1 ? -1 : 0;
  const push = f === 4 ? 3 : 0;
  b.thick(13, 33, 12 - off, 43, 5, M.steelDark);
  b.thick(20, 33, 21 + off, 43, 5, M.steelDark);
  b.rect(9 - off, 43, 7, 2, M.steel);
  b.rect(18 + off, 43, 7, 2, M.steel);
  b.poly(
    [
      [8, 14 + bob],
      [24, 14 + bob],
      [26, 34 + bob],
      [6, 34 + bob],
    ],
    M.steel,
  );
  b.rect(10, 22 + bob, 12, 3, M.enemy);
  b.rect(11, 28 + bob, 10, 2, M.enemyDark);
  b.ellipse(16, 10 + bob, 5, 5, M.steelDark);
  b.rect(17, 9 + bob, 4, 2, M.glow);
  b.taper(12, 7 + bob, 9, 2 + bob, 3, 1, M.bone);
  b.thick(22, 20 + bob, 28 + push, 24 + bob, 4, M.steelDark);
  const sx = 28 + push;
  b.rect(sx, 5 + bob, 9, 39, M.steel);
  b.rect(sx + 1, 7 + bob, 7, 35, M.steelDark);
  b.rect(sx + 2, 8 + bob, 5, 33, M.steel);
  b.line(sx + 4, 15 + bob, sx + 4, 32 + bob, M.glow);
  b.line(sx + 2, 20 + bob, sx + 6, 20 + bob, M.glow);
  b.line(sx + 2, 27 + bob, sx + 6, 27 + bob, M.glow);
  b.set(sx + 4, 12 + bob, M.glowHi);
  b.poly(
    [
      [sx + 2, 5 + bob],
      [sx + 7, 5 + bob],
      [sx + 4.5, 1 + bob],
    ],
    M.steelDark,
  );
  return fin(b);
}

function summoner(f: number): PixelBuf {
  const b = new PixelBuf(32, 48);
  const cast = f >= 2;
  const sway = f % 2 === 0 ? 0 : 1;
  for (const [x0, x1] of [
    [9, 7],
    [14, 13 + sway],
    [19, 21 - sway],
    [23, 25],
  ]) {
    b.taper(x0, 38, x1, 45, 3, 1, M.robe);
  }
  b.poly(
    [
      [10, 14],
      [21, 14],
      [25, 40],
      [6, 40],
    ],
    M.robe,
  );
  const trim = flat(0xc89a3c);
  b.line(7, 39, 24, 39, trim);
  b.line(15, 16, 15, 38, trim);
  b.ellipse(15.5, 10, 6, 6, M.robe);
  b.ellipse(17, 11, 3, 3, M.black);
  b.set(16, 11, M.eye);
  b.set(18, 11, M.eye);
  for (const [cx, h] of [
    [11, 3],
    [15, 5],
    [19, 3],
  ]) {
    b.poly(
      [
        [cx - 1.5, 5],
        [cx + 1.5, 5],
        [cx, 5 - h],
      ],
      M.crystal,
    );
  }
  const staffTop = cast ? 4 : 7;
  b.thick(25, staffTop + 4, 25, 42, 2, M.bone);
  const cr = cast ? (f === 3 ? 4 : 3.5) : 2.5;
  b.poly(
    [
      [25.5, staffTop - cr],
      [25.5 + cr * 0.8, staffTop + 1],
      [25.5, staffTop + cr + 2],
      [25.5 - cr * 0.8, staffTop + 1],
    ],
    M.crystal,
  );
  b.set(25, staffTop + 1, cast ? M.white : M.glowHi);
  b.thick(19, 20, 24, 22, 3, M.robe);
  if (cast) b.thick(11, 20, 6, 12, 3, M.robe);
  return fin(b);
}

function exploder(f: number): PixelBuf {
  const b = new PixelBuf(26, 26);
  const fuse = f >= 3;
  const squash = [0, 1, 0, 0, 1][f];
  const r = fuse ? 9 : 8;
  b.ellipse(10, 22, 2, 1.5, M.lava);
  b.ellipse(16, 22, 2, 1.5, M.lava);
  b.ellipse(13, 14 + squash * 0.5, r + squash * 0.5, r - squash * 0.5, fuse ? M.lava : M.hot);
  const crack = fuse ? M.white : flat(0xfff0a0);
  b.line(8, 10, 11, 13, crack);
  b.line(11, 13, 10, 17, crack);
  b.line(16, 8, 15, 12, crack);
  b.line(15, 12, 18, 15, crack);
  b.rect(10, 12 + squash, 2, 2, M.black);
  b.rect(15, 12 + squash, 2, 2, M.black);
  if (fuse) {
    b.set(13, 5, M.white);
    b.set(13, 4, M.eyeHi);
  }
  return fin(b);
}

const DRAWERS: Partial<Record<EnemyId, (f: number) => PixelBuf>> = {
  crawler,
  charger,
  gunner,
  flyer,
  watcher,
  shield,
  summoner,
  exploder,
  capsule,
};

function frameCount(id: EnemyId): number {
  let n = 0;
  for (const a of Object.values(ENEMY_ART[id].anims)) for (const i of a) n = Math.max(n, i + 1);
  return n;
}

/** Normal and elite (gold-rimmed) sheets for an enemy. */
export function buildEnemy(id: EnemyId): { normal: Sheet; elite: Sheet } {
  const art = ENEMY_ART[id];
  const n = frameCount(id);
  const normal = new Sheet(art.fw, art.fh, n);
  const elite = new Sheet(art.fw, art.fh, n);
  const draw = DRAWERS[id];
  if (!draw) throw new Error(`no drawer for ${id}`);
  for (let i = 0; i < n; i++) {
    const b = draw(i);
    normal.put(i, b);
    const e = b.clone();
    e.recolor(C.ink, 0xffc83c);
    e.outline(0x5a2a08);
    elite.put(i, e);
  }
  return { normal, elite };
}
