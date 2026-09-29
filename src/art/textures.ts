// Generates every texture at boot and registers it with Phaser.

import Phaser from 'phaser';
import { Sheet } from './pixel';
import { buildBody, buildHead, buildArm, type GunKind } from './heroine';
import { buildEnemy } from './enemiesArt';
import { buildWarden, buildWardenCore, buildOrbis, buildOrbisShard, buildRiftTear } from './bossArt';
import { buildFx } from './fxArt';
import { buildIcons, buildPips, buildDigits, DIGITS } from './uiArt';
import { buildBackground } from './bgArt';
import type { EnemyId } from '../data/enemies';
import type { BgTheme } from '../data/zones';

function addSheet(scene: Phaser.Scene, key: string, sheet: Sheet): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, sheet.canvas);
  if (!tex) return;
  for (let i = 0; i < sheet.count; i++) tex.add(i, 0, i * sheet.fw, 0, sheet.fw, sheet.fh);
}

function addCanvas(scene: Phaser.Scene, key: string, c: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

const ENEMY_IDS: EnemyId[] = ['crawler', 'charger', 'gunner', 'flyer', 'watcher', 'shield', 'summoner', 'exploder', 'capsule'];

export function generateAllTextures(scene: Phaser.Scene): void {
  addSheet(scene, 'hero_body', buildBody());
  addSheet(scene, 'hero_head', buildHead());
  const guns: GunKind[] = ['smg', 'shotgun', 'rail', 'beam'];
  for (const g of guns) {
    const s = new Sheet(46, 16, 1);
    s.put(0, buildArm(g));
    addSheet(scene, `arm_${g}`, s);
  }
  for (const id of ENEMY_IDS) {
    const { normal, elite } = buildEnemy(id);
    addSheet(scene, `en_${id}`, normal);
    addSheet(scene, `en_${id}_elite`, elite);
  }
  addSheet(scene, 'boss_warden', buildWarden());
  addSheet(scene, 'boss_core', buildWardenCore());
  addSheet(scene, 'boss_orbis', buildOrbis());
  addSheet(scene, 'orbis_shard', buildOrbisShard());
  addSheet(scene, 'rift_tear', buildRiftTear());
  const fx = buildFx();
  for (const [k, s] of Object.entries(fx)) addSheet(scene, k, s);
  addSheet(scene, 'icons', buildIcons());
  addSheet(scene, 'pips', buildPips());

  // 1x1 white pixel for rect-style sprites
  const px = document.createElement('canvas');
  px.width = 2;
  px.height = 2;
  const pctx = px.getContext('2d')!;
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, 2, 2);
  addCanvas(scene, 'px', px);

  // Bitmap digit fonts
  for (const large of [false, true]) {
    const key = large ? 'num_l' : 'num_s';
    const { canvas, cw, ch } = buildDigits(large);
    addCanvas(scene, key, canvas);
    const cfg = {
      image: key,
      width: cw,
      height: ch,
      chars: DIGITS,
      charsPerRow: DIGITS.length,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    };
    // Parse returns the full cache entry ({ data, frame, texture }).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = Phaser.GameObjects.RetroFont.Parse(scene, cfg as any) as unknown;
    scene.cache.bitmapFont.add(key, entry);
  }
}

const bgBuilt = new Set<BgTheme>();

/** Background canvases are large, so they are built lazily per zone. */
export function ensureBackground(scene: Phaser.Scene, theme: BgTheme): void {
  if (bgBuilt.has(theme) && scene.textures.exists(`bg_${theme}_sky`)) return;
  const l = buildBackground(theme);
  addCanvas(scene, `bg_${theme}_sky`, l.sky);
  addCanvas(scene, `bg_${theme}_far`, l.far);
  addCanvas(scene, `bg_${theme}_mid`, l.mid);
  addCanvas(scene, `bg_${theme}_near`, l.near);
  addCanvas(scene, `bg_${theme}_ground`, l.ground);
  bgBuilt.add(theme);
}
