// Integer (or fit) scaling of the 480x270 canvas with nearest-neighbour
// filtering. Integer scaling is the default so pixels stay perfectly square.

import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants';
import { store } from './app';

export function computeZoom(vw: number, vh: number, integer: boolean): number {
  const fit = Math.min(vw / GAME_W, vh / GAME_H);
  if (integer) return Math.max(1, Math.floor(fit));
  return Math.max(0.5, Math.floor(fit * 100) / 100);
}

export function applyScale(game: Phaser.Game): void {
  const z = computeZoom(window.innerWidth, window.innerHeight, store.data.settings.integerScale);
  if (game.scale.zoom !== z) game.scale.setZoom(z);
  else game.scale.refresh();
}

export function installScaling(game: Phaser.Game): void {
  const run = () => applyScale(game);
  window.addEventListener('resize', run);
  document.addEventListener('fullscreenchange', () => {
    store.data.settings.fullscreen = !!document.fullscreenElement;
    run();
  });
  run();
}

export async function setFullscreen(on: boolean): Promise<void> {
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* fullscreen may be refused without a user gesture */
  }
}
