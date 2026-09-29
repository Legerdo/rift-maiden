import Phaser from 'phaser';
// Only the four Galmuri faces the game uses are bundled (woff2).
import galmuri7 from 'galmuri/dist/Galmuri7.woff2?url';
import galmuri9 from 'galmuri/dist/Galmuri9.woff2?url';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri14 from 'galmuri/dist/Galmuri14.woff2?url';
import { GAME_W, GAME_H } from './core/constants';
import { installScaling } from './core/scaling';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { HubScene } from './scenes/HubScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { PauseScene } from './scenes/PauseScene';
import { SettingsScene } from './scenes/SettingsScene';
import { ResultScene } from './scenes/ResultScene';

async function loadFonts(): Promise<void> {
  const faces: [string, string][] = [
    ['Galmuri7', galmuri7],
    ['Galmuri9', galmuri9],
    ['Galmuri11', galmuri11],
    ['Galmuri14', galmuri14],
  ];
  try {
    const loads = faces.map(([name, url]) => {
      const ff = new FontFace(name, `url(${url}) format('woff2')`);
      document.fonts.add(ff);
      return ff.load();
    });
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 5000))]);
  } catch {
    /* fall back to system fonts */
  }
}

async function start(): Promise<void> {
  await loadFonts();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#07050d',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      zoom: 1,
    },
    fps: { target: 60, min: 30 },
    input: { activePointers: 1 },
    render: { powerPreference: 'high-performance', batchSize: 4096 },
    scene: [BootScene, TitleScene, HubScene, GameScene, HudScene, LevelUpScene, PauseScene, SettingsScene, ResultScene],
  });
  game.events.once(Phaser.Core.Events.READY, () => installScaling(game));
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}

void start();
