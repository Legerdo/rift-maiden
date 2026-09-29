// UI pixel icons (upgrade/skill/weapon glyphs) and HUD pips.

import { PixelBuf, Sheet, flat } from './pixel';
import { C } from './palette';

const G: Record<string, string[]> = {
  pierce: ['....o.......', '....o.......', '.xx.o..xx...', 'xxxxoxxxxxw.', '.xx.o..xx...', '....o.......', '....o.......'],
  split: ['.......xxw', '......x...', 'xxxxxx....', 'xxxxxx....', '......x...', '.......xxw'],
  ricochet: ['w.........', '.x.....x..', '..x...x.x.', '...x.x...x', '....x.....', 'oooooooooo'],
  multishot: ['......xxxw', '..........', 'xxxxxxxxxw', '..........', '......xxxw'],
  crit: ['....xx....', '..xxxxxx..', '.xx....xx.', 'xx..ww..xx', 'xx..ww..xx', '.xx....xx.', '..xxxxxx..', '....xx....'],
  explosive: ['...x..x...', 'x..xxxx..x', '.xxowwoxx.', '..xwwwwx..', '.xxowwoxx.', 'x..xxxx..x', '...x..x...'],
  focus: ['..xxxxxx..', '.x......x.', 'x..oooo..x', 'x..owwo..x', 'x..oooo..x', '.x......x.', '..xxxxxx..'],
  overheat: ['....x.....', '...xx..x..', '..xxx.xx..', '.xxoxxxx..', '.xxooxxxx.', 'xxowwoxxx.', 'xxowwwoxx.', '.xxoooxx..', '..xxxxx...'],
  pointblank: ['x..x..x', '.xxxxx.', 'xxwwwxx', 'xxwwwxx', '.xxxxx.', 'x..x..x'],
  drone: ['xxx..xxx', '...oo...', '.xxxxxx.', 'xxxwwxxx', '.xxxxxx.', '..o..o..'],
  drone_ai: ['xxx..xxx', '...oo...', '.xxxxxx.', 'xxwxxwxx', '.xxxxxx.', '..o..o..', '........', '.oooooo.'],
  magnet: ['ww....ww', 'xx....xx', 'xx....xx', 'xx....xx', 'xxx..xxx', '.xxxxxx.', '..xxxx..'],
  barrier: ['xxxxxxxx', 'xoooooox', 'xowwwwox', 'xowwwwox', '.xoooox.', '.xoooox.', '..xoox..', '...xx...'],
  vitality: ['.xx..xx.', 'xwwxxxxx', 'xwxxxxxx', 'xxxxxxxx', '.xxxxxx.', '..xxxx..', '...xx...'],
  phase_dash: ['x...x.....', '.x...x....', '..x...x...', '...x...x..', '..x...x...', '.x...x....', 'x...x.....'],
  skill_cd: ['xxxxxxxx', '.xwwwwx.', '..xwwx..', '...xx...', '..xoox..', '.xoooox.', 'xxxxxxxx'],
  skill_echo: ['..x...x...', '.x..x..x..', 'x..x.x..x.', 'x..x.w..x.', 'x..x.x..x.', '.x..x..x..', '..x...x...'],
  sg_recoil: ['....x....', '...xxx...', '..xxxxx..', '....x....', '....x....', '..o.o.o..', '.o.ooo.o.'],
  prism: ['....x.....', '...xwx..o.', '..xwwwx.o.', '.xwwwwwxoo', 'xxxxxxxxx.'],
  chain: ['.....xx', '....xx.', '...xx..', '..xxxxx', '....xx.', '...xx..', '..xx...', '.xx....'],
  missile: ['......xxw', '.....xxxw', '....xxx..', '..xxxx...', '.oxxx....', 'oo.x.....', 'o........'],
  frost: ['....x....', '..x.x.x..', '...xxx...', 'xxxxwxxxx', '...xxx...', '..x.x.x..', '....x....'],
  corpse_blast: ['..xxxxx..', '.xxxxxxx.', 'xxwwxwwxx', 'xxwwxwwxx', '.xxxxxxx.', '..x.x.x..', '..xxxxx..'],
  orbit: ['...xxxx...', '.xx....xx.', 'x...oo...w', 'x..oooo..x', 'w...oo...x', '.xx....xx.', '...xxxx...'],
  dash_strike: ['.........xw', '........xx.', '.......xx..', '..o...xx...', '.o...xx....', 'o...xx.....', '...xx......', '..xx.......'],
  adrenaline: ['..........', '....x.....', '...x.x....', 'xxx..x..xx', '.....x.x..', '......x...'],
  w_smg: ['..xxxxxxxxw', '.xxxxxxxx..', 'xxxooxx....', 'xx..xx.....', 'xx..xx.....'],
  w_shotgun: ['xxxxxxxxxxxw', '.xxxxxooxxxx', 'xxx.........', 'xx..........'],
  w_rail: ['....xxxx....', 'xxxxxxxxxoxw', 'xxxxxxxxxoxw', 'xx..xx......'],
  w_beam: ['........x...', 'xxxxxx.xwx..', 'xxxxxxxwwwxw', 'xxxxxx.xwx..', 'xx......x...'],
  sk_shockwave: ['..xxxxxx..', '.x......x.', 'x..oooo..x', 'x.o.ww.o.x', 'x..oooo..x', '.x......x.', '..xxxxxx..'],
  sk_overdrive: ['....x....', '...xxx...', '..xx.xx..', '.xx...xx.', '....x....', '...xxx...', '..xx.xx..', '.xx...xx.'],
  sk_orbital: ['..xxxx..', '..xwwx..', '..xwwx..', '..xwwx..', '..xwwx..', '.oxwwxo.', 'oooooooo'],
  sk_singularity: ['..xxxxx..', '.x.....x.', 'x..xxx..x', 'x.x.w.x.x', 'x.x..x..x', '.x.xx...x', '..x....x.', '...xxxx..'],
  reroll: ['..xxxx.x', '.x....xx', 'x....xxx', 'x.......', '.......x', 'xxx....x', 'xx....x.', 'x.xxxx..'],
  startpick: ['xxxxxxx', 'x.....x', 'x..w..x', 'x.www.x', 'x..w..x', 'x.....x', 'xxxxxxx'],
  revive: ['...xx...', '...xx...', 'xxxxxxxx', 'xxxwwxxx', '...xx...', '...xx...', '...xx...'],
  shard: ['...xx...', '..xwox..', '.xwoxxx.', 'xwoxxxxx', '.xoxxxx.', '..xxxx..', '...xx...'],
  lock: ['..xxxx..', '.x....x.', '.x....x.', 'xxxxxxxx', 'xxxwwxxx', 'xxxwwxxx', 'xxxxxxxx'],
  star: ['...x...', '...x...', 'xxxwxxx', '.xxxxx.', '.xx.xx.', 'x.....x'],
  execute: ['o.......o', '.o.xxx.o.', '..oxxxo..', '.xxowoxx.', '.xwxoxwx.', '.xxo.oxx.', '..o.x.o..', '.o.xxx.o.', 'o.......o'],
  big_shot: ['....oo....', '..xxxxxx..', '.xxwwxxxxw', 'xxxwxxxxxw', '.xxxxxxxxw', '..xxxxxx..', '....oo....'],
  sentry: ['..xxxxx...', '.xxowxxxxx', '.xxxxxxxxx', '..xxxxx...', '....x.....', '...x.x....', '..x...x...', '.x.....x..'],
  retaliate: ['o..x..o', '.o.x.o.', '..xxx..', 'xxxwxxx', '..xxx..', '.o.x.o.', 'o..x..o'],
  sk_plus: ['..x..', '..x..', 'xxwxx', '..x..', '..x..'],
  awaken: ['....x....', '.x..x..x.', '..xxwxx..', '..xwwwx..', 'xxwwwwwxx', '..xwwwx..', '..xxwxx..', '.x..x..x.', '....x....'],
  c_glass: ['..xxxx..', '.xwwwwx.', 'xw.o..wx', 'xw..o.wx', 'xw.o..wx', '.xw..wx.', '..xwwx..', '...xx...'],
  c_frenzy: ['x.x.x.x', '.xxxxx.', 'xxoxoxx', 'xxxxxxx', '.xowox.', '..xxx..'],
  c_hunter: ['...xx...', '..xwwx..', '.xwoowx.', 'xwoxxowx', '.xwoowx.', '..xwwx..', '...xx...'],
  ov_up: ['...x...', '..xwx..', '.xxwxx.', 'x..x..x', '..xwx..', '.xxwxx.', 'x..x..x'],
};

interface IconDef {
  glyph: string;
  main: number;
  alt: number;
  gold?: boolean;
}

const CY = 0x6ef4ff;
const YE = 0xffe860;
const OR = 0xffa040;
const RD = 0xff5c7a;
const GR = 0x9cff8a;
const PU = 0xc890ff;
const WH = 0xe8e8f8;
const IC = 0xa8ecff;
const GD = 0xffcf4a;

export const ICONS: Record<string, IconDef> = {
  pierce: { glyph: 'pierce', main: YE, alt: CY },
  split: { glyph: 'split', main: YE, alt: CY },
  ricochet: { glyph: 'ricochet', main: CY, alt: WH },
  multishot: { glyph: 'multishot', main: YE, alt: CY },
  crit: { glyph: 'crit', main: RD, alt: YE },
  explosive: { glyph: 'explosive', main: OR, alt: YE },
  focus: { glyph: 'focus', main: WH, alt: RD },
  overheat: { glyph: 'overheat', main: OR, alt: YE },
  pointblank: { glyph: 'pointblank', main: RD, alt: YE },
  drone: { glyph: 'drone', main: GR, alt: WH },
  magnet: { glyph: 'magnet', main: CY, alt: RD },
  barrier: { glyph: 'barrier', main: CY, alt: 0x3a7ad0 },
  vitality: { glyph: 'vitality', main: RD, alt: WH },
  phase_dash: { glyph: 'phase_dash', main: CY, alt: WH },
  combo_heal: { glyph: 'vitality', main: 0xff8ad0, alt: YE },
  skill_cd: { glyph: 'skill_cd', main: PU, alt: YE },
  skill_echo: { glyph: 'skill_echo', main: PU, alt: WH },
  tracer: { glyph: 'pierce', main: GR, alt: YE },
  sg_recoil: { glyph: 'sg_recoil', main: OR, alt: YE },
  rail_super: { glyph: 'chain', main: CY, alt: WH },
  prism: { glyph: 'prism', main: CY, alt: PU },
  chain: { glyph: 'chain', main: 0xb8f4ff, alt: YE },
  missile: { glyph: 'missile', main: WH, alt: OR },
  frost: { glyph: 'frost', main: IC, alt: WH },
  corpse_blast: { glyph: 'corpse_blast', main: OR, alt: RD },
  orbit: { glyph: 'orbit', main: CY, alt: WH },
  drone_ai: { glyph: 'drone_ai', main: GR, alt: CY },
  drone_overdrive: { glyph: 'drone', main: RD, alt: YE },
  dash_strike: { glyph: 'dash_strike', main: WH, alt: CY },
  adrenaline: { glyph: 'adrenaline', main: RD, alt: YE },
  f_storm: { glyph: 'chain', main: GD, alt: WH, gold: true },
  f_legion: { glyph: 'missile', main: GD, alt: GR, gold: true },
  f_zero: { glyph: 'frost', main: GD, alt: IC, gold: true },
  f_reaction: { glyph: 'explosive', main: GD, alt: RD, gold: true },
  f_phantom: { glyph: 'dash_strike', main: GD, alt: CY, gold: true },
  w_smg: { glyph: 'w_smg', main: WH, alt: CY },
  w_shotgun: { glyph: 'w_shotgun', main: WH, alt: RD },
  w_rail: { glyph: 'w_rail', main: WH, alt: CY },
  w_beam: { glyph: 'w_beam', main: WH, alt: CY },
  sk_shockwave: { glyph: 'sk_shockwave', main: CY, alt: WH },
  sk_overdrive: { glyph: 'sk_overdrive', main: YE, alt: OR },
  sk_orbital: { glyph: 'sk_orbital', main: CY, alt: YE },
  sk_singularity: { glyph: 'sk_singularity', main: PU, alt: WH },
  reroll: { glyph: 'reroll', main: CY, alt: WH },
  startpick: { glyph: 'startpick', main: YE, alt: WH },
  revive: { glyph: 'revive', main: GR, alt: WH },
  shard: { glyph: 'shard', main: C.shard, alt: C.shardHi },
  heal: { glyph: 'vitality', main: RD, alt: WH },
  lock: { glyph: 'lock', main: 0x8a80b0, alt: WH },
  execute: { glyph: 'execute', main: WH, alt: RD },
  big_shot: { glyph: 'big_shot', main: YE, alt: OR },
  sentry: { glyph: 'sentry', main: WH, alt: GR },
  retaliate: { glyph: 'retaliate', main: CY, alt: RD },
  sk_shock_plus: { glyph: 'sk_shockwave', main: CY, alt: YE, gold: true },
  sk_od_plus: { glyph: 'sk_overdrive', main: YE, alt: OR, gold: true },
  sk_orb_plus: { glyph: 'sk_orbital', main: CY, alt: YE, gold: true },
  sk_sing_plus: { glyph: 'sk_singularity', main: PU, alt: WH, gold: true },
  awaken: { glyph: 'awaken', main: GD, alt: WH },
  c_glass: { glyph: 'c_glass', main: RD, alt: 0x6a1a2a },
  c_frenzy: { glyph: 'c_frenzy', main: RD, alt: YE },
  c_hunter: { glyph: 'c_hunter', main: RD, alt: GD },
  ov_power: { glyph: 'ov_up', main: OR, alt: WH },
  ov_rate: { glyph: 'ov_up', main: YE, alt: WH },
  ov_crit: { glyph: 'ov_up', main: RD, alt: WH },
  ov_life: { glyph: 'ov_up', main: GR, alt: WH },
  ov_cd: { glyph: 'ov_up', main: PU, alt: WH },
  fallback_heal: { glyph: 'vitality', main: RD, alt: WH },
  fallback_shard: { glyph: 'shard', main: C.shard, alt: C.shardHi },
};

export const ICON_NAMES = Object.keys(ICONS);
export const ICON_INDEX: Record<string, number> = Object.fromEntries(ICON_NAMES.map((n, i) => [n, i]));
export const ICON_SIZE = 16;

export function buildIcons(): Sheet {
  const sheet = new Sheet(ICON_SIZE, ICON_SIZE, ICON_NAMES.length);
  ICON_NAMES.forEach((name, i) => {
    const def = ICONS[name];
    const rows = G[def.glyph];
    const b = new PixelBuf(ICON_SIZE, ICON_SIZE);
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const h = rows.length;
    const ox = Math.floor((ICON_SIZE - w) / 2);
    const oy = Math.floor((ICON_SIZE - h) / 2);
    b.ascii(rows, { x: flat(def.main), o: flat(def.alt), w: flat(0xffffff) }, ox, oy);
    if (def.gold) {
      b.ascii(['x', 'w', 'x'].map((r, k) => (k === 1 ? 'xwx' : '.x.')), { x: flat(GD), w: flat(0xffffff) }, 12, 0);
    }
    b.resolve().outline(C.ink);
    sheet.put(i, b);
  });
  return sheet;
}

/** HUD pips: 0 heart full, 1 heart empty, 2 shield, 3 dash ready, 4 dash empty. */
export function buildPips(): Sheet {
  const sheet = new Sheet(9, 9, 5);
  const heart = ['.xx.xx.', 'xwxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
  const shield = ['.xxxxx.', 'xwwxxxx', 'xwxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
  const dash = ['xx.xx.', '.xx.xx', '..xx.x', '.xx.xx', 'xx.xx.'];
  for (let f = 0; f < 5; f++) {
    const b = new PixelBuf(9, 9);
    if (f === 0) b.ascii(heart, { x: flat(C.heal), w: flat(0xffd0d8) }, 1, 1);
    else if (f === 1) b.ascii(heart, { x: flat(0x3a2440), w: flat(0x4a3050) }, 1, 1);
    else if (f === 2) b.ascii(shield, { x: flat(0x6ef4ff), w: flat(0xffffff) }, 1, 1);
    else b.ascii(dash, { x: flat(f === 3 ? 0x6ef4ff : 0x2a3a5a) }, 1, 2);
    b.resolve().outline(C.ink);
    sheet.put(f, b);
  }
  return sheet;
}

/** Pixel digit fonts for damage numbers (retro font layout). */
export const DIGITS = '0123456789+x!';

const DIGITS_S: Record<string, string[]> = {
  '0': ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'],
  '1': ['.x.', 'xx.', '.x.', '.x.', 'xxx'],
  '2': ['xxx', '..x', 'xxx', 'x..', 'xxx'],
  '3': ['xxx', '..x', '.xx', '..x', 'xxx'],
  '4': ['x.x', 'x.x', 'xxx', '..x', '..x'],
  '5': ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  '6': ['xxx', 'x..', 'xxx', 'x.x', 'xxx'],
  '7': ['xxx', '..x', '.x.', '.x.', '.x.'],
  '8': ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'],
  '9': ['xxx', 'x.x', 'xxx', '..x', 'xxx'],
  '+': ['...', '.x.', 'xxx', '.x.', '...'],
  x: ['...', 'x.x', '.x.', 'x.x', '...'],
  '!': ['.x.', '.x.', '.x.', '...', '.x.'],
};

const DIGITS_L: Record<string, string[]> = {
  '0': ['.xxx.', 'xx.xx', 'xx.xx', 'xx.xx', 'xx.xx', 'xx.xx', '.xxx.'],
  '1': ['..xx.', '.xxx.', '..xx.', '..xx.', '..xx.', '..xx.', '.xxxx'],
  '2': ['.xxx.', 'xx.xx', '...xx', '..xx.', '.xx..', 'xx...', 'xxxxx'],
  '3': ['xxxx.', '...xx', '...xx', '.xxx.', '...xx', '...xx', 'xxxx.'],
  '4': ['...xx', '..xxx', '.x.xx', 'x..xx', 'xxxxx', '...xx', '...xx'],
  '5': ['xxxxx', 'xx...', 'xxxx.', '...xx', '...xx', 'xx.xx', '.xxx.'],
  '6': ['.xxx.', 'xx...', 'xxxx.', 'xx.xx', 'xx.xx', 'xx.xx', '.xxx.'],
  '7': ['xxxxx', '...xx', '..xx.', '..xx.', '.xx..', '.xx..', '.xx..'],
  '8': ['.xxx.', 'xx.xx', 'xx.xx', '.xxx.', 'xx.xx', 'xx.xx', '.xxx.'],
  '9': ['.xxx.', 'xx.xx', 'xx.xx', '.xxxx', '...xx', '...xx', '.xxx.'],
  '+': ['.....', '..x..', '..x..', 'xxxxx', '..x..', '..x..', '.....'],
  x: ['.....', 'xx.xx', '.xxx.', '..x..', '.xxx.', 'xx.xx', '.....'],
  '!': ['.xx..', '.xx..', '.xx..', '.xx..', '.....', '.xx..', '.xx..'],
};

/** Build a fixed-width digit strip. White glyphs + dark outline so tint works. */
export function buildDigits(large: boolean): { canvas: HTMLCanvasElement; cw: number; ch: number } {
  const src = large ? DIGITS_L : DIGITS_S;
  const gw = large ? 5 : 3;
  const gh = large ? 7 : 5;
  const cw = gw + 2;
  const ch = gh + 2;
  const sheet = new Sheet(cw, ch, DIGITS.length);
  DIGITS.split('').forEach((d, i) => {
    const b = new PixelBuf(cw, ch);
    b.ascii(src[d], { x: flat(0xffffff) }, 1, 1);
    b.resolve().outline(0x1a0a14);
    sheet.put(i, b);
  });
  return { canvas: sheet.canvas, cw, ch };
}
