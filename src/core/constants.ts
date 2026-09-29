// Global layout / rendering constants. Logical resolution is 480x270 (16:9),
// scaled up by an integer factor with nearest-neighbour filtering.

export const GAME_W = 480;
export const GAME_H = 270;

/** Width of the playable arena (camera scrolls horizontally). */
export const ARENA_W = 960;
/** Y coordinate of the floor surface. */
export const GROUND_Y = 226;
/** Highest point flyers are allowed to go. */
export const SKY_TOP = 34;

export const DEPTH = {
  SKY: 0,
  BG_FAR: 1,
  BG_MID: 2,
  BG_NEAR: 3,
  GROUND: 4,
  HAZARD: 6,
  PICKUP: 10,
  BOSS: 18,
  ENEMY: 20,
  TELEGRAPH: 26,
  PLAYER_BACK: 29,
  PLAYER: 30,
  PLAYER_HEAD: 31,
  PLAYER_FRONT: 32,
  PLAYER_SHOT: 33,
  PARTICLE: 35,
  PARTICLE_ADD: 36,
  ENEMY_SHOT: 40,
  DMG_NUM: 45,
  FOREGROUND: 50,
  CURSOR: 100,
} as const;

export const FONT = {
  tiny: 'Galmuri7',
  small: 'Galmuri9',
  body: 'Galmuri11',
  big: 'Galmuri14',
} as const;

export const FONT_PX = {
  tiny: 8,
  small: 10,
  body: 12,
  big: 15,
} as const;

export type FontKind = keyof typeof FONT;

export const SAVE_KEY = 'riftmaiden.save.v1';
