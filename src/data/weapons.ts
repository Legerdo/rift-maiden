// Main weapon definitions. All numbers are base values before upgrades.

export type WeaponId = 'smg' | 'shotgun' | 'rail' | 'beam';
export type FireMode = 'projectile' | 'hitscan' | 'beam';

export interface WeaponDef {
  id: WeaponId;
  mode: FireMode;
  /** Trigger pulls per second (projectile / hitscan). */
  fireRate: number;
  damage: number;
  projectiles: number;
  /** Total cone in radians. Pellets are random inside it, multishot fans evenly. */
  spread: number;
  speed: number;
  speedJitter: number;
  life: number;
  radius: number;
  pierce: number;
  knockback: number;
  critChance: number;
  /** Arm recoil in pixels. */
  recoil: number;
  /** Camera impulse (px) opposite to aim. */
  kick: number;
  /** Screen shake trauma added per shot. */
  shake: number;
  /** Pushback applied to the player (px/s). */
  selfPush: number;
  /** Micro hit-stop in ms when this weapon connects. */
  hitstop: number;
  shotTex: string;
  muzzleTex: string;
  sfx: string;
  shellEject: boolean;
  /** Extra projectiles (or rail lines) per multishot level. */
  multishotAdd: number;
  gunTex: string;
  /** Muzzle offset from the shoulder pivot along the aim direction. */
  muzzleDist: number;
  color: number;
  // Beam / hitscan parameters
  range: number;
  tickRate: number;
  heatPerSec: number;
  coolPerSec: number;
  icon: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  smg: {
    id: 'smg',
    mode: 'projectile',
    fireRate: 10,
    damage: 6,
    projectiles: 1,
    spread: 0.07,
    speed: 540,
    speedJitter: 25,
    life: 0.6,
    radius: 3,
    pierce: 0,
    knockback: 28,
    critChance: 0.06,
    recoil: 2,
    kick: 0.7,
    shake: 0,
    selfPush: 0,
    hitstop: 0,
    shotTex: 'shot_smg',
    muzzleTex: 'muzzle_small',
    sfx: 'smg',
    shellEject: true,
    multishotAdd: 1,
    gunTex: 'arm_smg',
    muzzleDist: 27,
    color: 0xffe860,
    range: 0,
    tickRate: 0,
    heatPerSec: 0,
    coolPerSec: 0,
    icon: 'w_smg',
  },
  shotgun: {
    id: 'shotgun',
    mode: 'projectile',
    fireRate: 1.7,
    damage: 8,
    projectiles: 7,
    spread: 0.44,
    speed: 480,
    speedJitter: 95,
    life: 0.34,
    radius: 3,
    pierce: 0,
    knockback: 170,
    critChance: 0.05,
    recoil: 7,
    kick: 3.2,
    shake: 0.2,
    selfPush: 95,
    hitstop: 25,
    shotTex: 'shot_pellet',
    muzzleTex: 'muzzle_big',
    sfx: 'shotgun',
    shellEject: true,
    multishotAdd: 2,
    gunTex: 'arm_shotgun',
    muzzleDist: 31,
    color: 0xffb040,
    range: 0,
    tickRate: 0,
    heatPerSec: 0,
    coolPerSec: 0,
    icon: 'w_shotgun',
  },
  rail: {
    id: 'rail',
    mode: 'hitscan',
    fireRate: 1.15,
    damage: 60,
    projectiles: 1,
    spread: 0.08,
    speed: 0,
    speedJitter: 0,
    life: 0,
    radius: 4,
    pierce: 999,
    knockback: 110,
    critChance: 0.1,
    recoil: 8,
    kick: 3.8,
    shake: 0.24,
    selfPush: 70,
    hitstop: 45,
    shotTex: 'shot_smg',
    muzzleTex: 'muzzle_rail',
    sfx: 'rail',
    shellEject: false,
    multishotAdd: 1,
    gunTex: 'arm_rail',
    muzzleDist: 35,
    color: 0x6ef4ff,
    range: 720,
    tickRate: 0,
    heatPerSec: 0,
    coolPerSec: 0,
    icon: 'w_rail',
  },
  beam: {
    id: 'beam',
    mode: 'beam',
    fireRate: 0,
    damage: 5.4,
    projectiles: 1,
    spread: 0,
    speed: 0,
    speedJitter: 0,
    life: 0,
    radius: 3,
    pierce: 1,
    knockback: 6,
    critChance: 0.05,
    recoil: 1,
    kick: 0.25,
    shake: 0,
    selfPush: 0,
    hitstop: 0,
    shotTex: 'shot_smg',
    muzzleTex: 'muzzle_beam',
    sfx: 'beam',
    shellEject: false,
    multishotAdd: 0,
    gunTex: 'arm_beam',
    muzzleDist: 31,
    color: 0x8ff8ff,
    range: 215,
    tickRate: 12,
    heatPerSec: 27,
    coolPerSec: 48,
    icon: 'w_beam',
  },
};

export const WEAPON_ORDER: WeaponId[] = ['smg', 'shotgun', 'rail', 'beam'];

/** Meta unlock id required for each weapon (undefined = always available). */
export const WEAPON_UNLOCK: Record<WeaponId, string | undefined> = {
  smg: undefined,
  shotgun: 'w_shotgun',
  rail: 'w_rail',
  beam: 'w_beam',
};
