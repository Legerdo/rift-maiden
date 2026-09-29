import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../core/constants';
import { formatTime } from '../core/mathx';
import { t, upgradeName } from '../localization/i18n';
import { txt, drawPanel, Button } from '../ui/ui';
import { C } from '../art/palette';
import { ICON_INDEX } from '../art/uiArt';
import { UPGRADE_MAP } from '../data/upgrades';
import { audio } from '../audio/audio';
import type { GameScene } from './GameScene';

export class PauseScene extends Phaser.Scene {
  private g!: GameScene;
  private confirm = false;
  private giveBtn!: Button;
  private tip!: Phaser.GameObjects.Text;

  constructor() {
    super('Pause');
  }

  init(data: { game: GameScene }): void {
    this.g = data.game;
    this.confirm = false;
  }

  create(): void {
    this.scene.bringToTop();
    this.input.setDefaultCursor('default');
    const g = this.add.graphics();
    g.fillStyle(0x07050d, 0.7);
    g.fillRect(0, 0, GAME_W, GAME_H);
    const px = 40;
    const py = 30;
    const pw = GAME_W - 80;
    const ph = GAME_H - 60;
    drawPanel(g, px, py, pw, ph, { edge: C.uiEdgeHi });
    txt(this, GAME_W / 2, py + 14, t('pause.title'), { font: 'big', ox: 0.5, oy: 0.5 });

    const bx = px + 70;
    new Button(this, bx, py + 50, t('pause.resume'), () => this.resume(), { w: 110, h: 20, font: 'body', edge: C.uiCyan });
    new Button(this, bx, py + 76, t('pause.settings'), () => {
      this.scene.pause();
      this.scene.launch('Settings', { from: 'Pause' });
    }, { w: 110, h: 18 });
    this.giveBtn = new Button(this, bx, py + 100, t('pause.giveup'), () => this.giveUp(), { w: 110, h: 18, color: C.uiBad });
    this.tip = txt(this, bx, py + 114, '', { font: 'small', ox: 0.5, color: C.uiBad });

    const r = this.g.run;
    const lines = [
      `${t('res.time')}  ${formatTime(r.time)}`,
      `${t('res.kills')}  ${r.kills}`,
      `${t('res.level')}  ${r.level}`,
      `${t('res.combo')}  ${r.bestCombo}`,
    ];
    lines.forEach((l, i) => txt(this, px + 18, py + 136 + i * 13, l, { font: 'small', color: C.uiDim }));

    // current build
    const cx = px + 150;
    txt(this, cx, py + 32, t('pause.build'), { font: 'body', color: C.uiGold });
    txt(this, cx, py + 46, t('pause.weapon', { name: t(`weapon.${this.g.build.weapon.id}`) }), { font: 'small', color: C.uiText });
    const order = this.g.build.order;
    if (order.length === 0) txt(this, cx, py + 64, t('pause.noBuild'), { font: 'small', color: C.uiDim });
    order.forEach((id, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = cx + col * 112;
      const y = py + 66 + row * 16;
      if (y > py + ph - 12) return;
      const def = UPGRADE_MAP[id];
      this.add.image(x + 8, y, 'icons', ICON_INDEX[def?.icon ?? id] ?? 0);
      txt(this, x + 18, y - 5, `${upgradeName(id)} ${this.g.build.lv(id)}`, { font: 'small', color: def?.fusion ? C.uiGold : C.uiText });
    });

    this.input.keyboard?.on('keydown-ESC', () => this.resume());
    this.input.keyboard?.on('keydown-P', () => this.resume());
  }

  private giveUp(): void {
    if (!this.confirm) {
      this.confirm = true;
      this.tip.setText(t('pause.giveupConfirm'));
      return;
    }
    this.scene.stop();
    this.g.scene.resume('Game');
    this.g.giveUp();
  }

  private resume(): void {
    audio.duck(false);
    this.scene.stop();
    this.g.scene.resume('Game');
    this.g.scene.get('Hud')?.input.setDefaultCursor('none');
  }
}
