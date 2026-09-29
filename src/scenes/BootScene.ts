import Phaser from 'phaser';
import { generateAllTextures, ensureBackground } from '../art/textures';
import { applyAudioSettings, validateLoadout, store } from '../core/app';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const t0 = performance.now();
    generateAllTextures(this);
    ensureBackground(this, 'neon');
    validateLoadout();
    applyAudioSettings();
    store.save();
    const el = document.getElementById('boot-msg');
    if (el) el.remove();
    if (import.meta.env.DEV) console.info(`[boot] textures generated in ${Math.round(performance.now() - t0)}ms`);
    this.scene.start('Title');
  }
}
