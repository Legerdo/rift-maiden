import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../core/constants';
import { formatTime } from '../core/mathx';
import { store } from '../core/app';
import { ZONES } from '../data/zones';
import { UPGRADE_MAP } from '../data/upgrades';
import { t, upgradeName } from '../localization/i18n';
import { txt, drawPanel, Button } from '../ui/ui';
import { C } from '../art/palette';
import { ICON_INDEX } from '../art/uiArt';
import { audio } from '../audio/audio';
import type { GameInit, RunSummary } from './GameScene';

export class ResultScene extends Phaser.Scene {
  private summary!: RunSummary;
  private initData!: GameInit;
  private shardText!: Phaser.GameObjects.Text;
  private shown = 0;
  private t = 0;
  private motes: { x: number; y: number; v: number }[] = [];
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Result');
  }

  init(data: { summary: RunSummary; init: GameInit }): void {
    this.summary = data.summary;
    this.initData = data.init;
    this.shown = 0;
    this.t = 0;
  }

  create(): void {
    const s = this.summary;
    this.input.setDefaultCursor('default');
    this.cameras.main.setBackgroundColor(s.victory ? 0x100a1c : 0x0c0610);
    this.gfx = this.add.graphics();
    this.motes = [];
    for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random() * GAME_W, y: Math.random() * GAME_H, v: 0.3 + Math.random() });
    audio.playMusic(4);

    const g = this.add.graphics();
    const title = s.victory ? t('res.victory') : t('res.defeat');
    txt(this, GAME_W / 2, 22, title, { font: 'big', ox: 0.5, oy: 0.5, color: s.victory ? C.uiGold : C.uiBad }).setScale(2);

    // stats panel
    drawPanel(g, 16, 44, 208, 150, {});
    const zoneName = t(`zone.${ZONES[Math.min(s.zoneIndex, ZONES.length - 1)].id}`);
    const rows: [string, string, boolean][] = [
      [t('res.time'), formatTime(s.time), s.records.includes('time')],
      [t('res.kills'), String(s.kills), false],
      [t('res.bosses'), String(s.bosses), false],
      [t('res.combo'), String(s.bestCombo), s.records.includes('combo')],
      [t('res.level'), String(s.level), false],
      [t('res.zone'), `${s.zoneIndex + 1} · ${zoneName}`, false],
    ];
    rows.forEach(([k, v, rec], i) => {
      const y = 54 + i * 20;
      txt(this, 28, y, k, { font: 'small', color: C.uiDim });
      const vt = txt(this, 212, y, v, { font: 'body', ox: 1, color: rec ? C.uiGold : C.uiText });
      if (rec) txt(this, 212 - vt.width - 6, y + 1, t('res.record'), { font: 'small', ox: 1, color: C.uiGold });
      vt.setAlpha(0);
      this.tweens.add({ targets: vt, alpha: 1, duration: 200, delay: 120 + i * 90 });
    });

    // shards panel
    drawPanel(g, 236, 44, 228, 70, { edge: 0x8a6a2a });
    txt(this, 248, 52, t('res.shards'), { font: 'small', color: C.shard });
    this.add.image(258, 84, 'shard', 0).setScale(2);
    this.shardText = txt(this, 272, 74, '+0', { font: 'big', color: C.shard }).setScale(1.4);
    txt(this, 452, 98, t('res.shardsDetail', { a: s.shardsPicked, b: s.shardBonus }), { font: 'small', ox: 1, color: C.uiDim });
    txt(this, 452, 52, t('res.total', { n: store.data.shards }), { font: 'small', ox: 1, color: C.uiText });

    // build
    drawPanel(g, 236, 120, 228, 74, {});
    txt(this, 248, 126, `${t('res.build')} · ${t(`weapon.${s.weapon}`)}`, { font: 'small', color: C.uiDim });
    s.build.slice(0, 22).forEach((b, i) => {
      const x = 256 + (i % 11) * 19;
      const y = 152 + Math.floor(i / 11) * 22;
      const def = UPGRADE_MAP[b.id];
      this.add.image(x, y, 'icons', ICON_INDEX[def?.icon ?? b.id] ?? 0);
      if (b.lv > 1) txt(this, x + 7, y + 2, String(b.lv), { font: 'tiny', ox: 1 });
    });
    if (s.build.length === 0) txt(this, 248, 150, t('pause.noBuild'), { font: 'small', color: C.uiDim });

    // unlock hints
    let hy = 202;
    if (s.depthUnlocked > 0) {
      txt(this, GAME_W / 2, hy, t('res.depthUnlocked', { n: s.depthUnlocked }), { font: 'body', ox: 0.5, color: C.uiGold });
      hy += 14;
    }
    if (s.canBuy.length) {
      txt(this, GAME_W / 2, hy, t('res.canBuy', { name: s.canBuy.map((id) => t(`meta.${id}`)).join(', ') }), { font: 'small', ox: 0.5, color: C.uiGood });
    }

    const retry = new Button(this, GAME_W / 2 - 130, GAME_H - 20, t('res.retry'), () => this.retry(), { w: 120, h: 20, font: 'body', edge: C.uiCyan });
    new Button(this, GAME_W / 2, GAME_H - 20, t('res.hub'), () => this.scene.start('Hub'), { w: 120, h: 20, edge: C.uiGold });
    new Button(this, GAME_W / 2 + 130, GAME_H - 20, t('res.title'), () => this.scene.start('Title'), { w: 100, h: 20 });
    void retry;
    this.input.keyboard?.on('keydown-R', () => this.retry());
    void upgradeName;
  }

  private retry(): void {
    audio.stopMusic(0.3);
    const d = store.data;
    this.scene.start('Game', { ...this.initData, depth: d.depth });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    const target = this.summary.shardsTotal;
    if (this.t > 0.6 && this.shown < target) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(target, this.shown + Math.max(8, target) * dt * 0.9);
      if (Math.floor(this.shown) !== before) audio.play('pickup_xp', { pitch: 1 + (this.shown / Math.max(1, target)) * 0.8, vol: 0.5 });
      this.shardText.setText(`+${Math.floor(this.shown)}`);
      if (this.shown >= target) audio.play('ui_buy');
    }
    const g = this.gfx;
    g.clear();
    for (const m of this.motes) {
      m.y -= 12 * m.v * dt;
      if (m.y < 0) {
        m.y = GAME_H;
        m.x = Math.random() * GAME_W;
      }
      g.fillStyle(this.summary.victory ? 0xffcf4a : 0xc890ff, 0.3);
      g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
  }
}
