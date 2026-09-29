// Upgrade choice: three cards with icon, name, short description, level and
// synergy hints so the player can read their build at a glance.

import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../core/constants';
import { RARITY_COLOR, UPGRADE_MAP, type UpgradeDef, type Rarity } from '../data/upgrades';
import { t, upgradeName, upgradeDesc } from '../localization/i18n';
import { txt, drawPanel, Button } from '../ui/ui';
import { C } from '../art/palette';
import { ICON_INDEX } from '../art/uiArt';
import { cssHex } from '../art/pixel';
import { audio } from '../audio/audio';
import { unlockedPools } from '../core/app';
import type { GameScene, LevelUpRequest } from './GameScene';

interface CardData {
  id: string;
  rarity: Rarity;
  icon: string;
  name: string;
  desc: string;
  level: string;
  synergy: string;
  synergyHot: boolean;
  fusion: boolean;
}

const CW = 140;
const CH = 150;

export class LevelUpScene extends Phaser.Scene {
  private g!: GameScene;
  private kind: LevelUpRequest['kind'] = 'level';
  private offers: UpgradeDef[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private cardData: CardData[] = [];
  private delay = 0;
  private chosen = false;
  private reroll!: Button;
  private hover = -1;
  private cardG: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super('LevelUp');
  }

  init(data: LevelUpRequest & { game: GameScene }): void {
    this.g = data.game;
    this.kind = data.kind;
    this.offers = data.offers;
    this.cards = [];
    this.cardG = [];
    this.chosen = false;
    this.delay = 0.35;
    this.hover = -1;
  }

  create(): void {
    this.scene.bringToTop();
    this.input.setDefaultCursor('default');
    const bg = this.add.graphics();
    bg.fillStyle(0x07050d, 0.78);
    bg.fillRect(0, 0, GAME_W, GAME_H);
    const title = this.kind === 'core' ? t('lv.coreTitle') : this.kind === 'start' ? t('lv.startPick') : t('lv.title');
    const col = this.kind === 'core' ? C.uiGold : C.uiGood;
    const tt = txt(this, GAME_W / 2, 24, title, { font: 'big', ox: 0.5, oy: 0.5, color: col });
    tt.setScale(this.kind === 'start' ? 1 : 2);
    txt(this, GAME_W / 2, 46, t('lv.choose'), { font: 'small', ox: 0.5, oy: 0.5, color: C.uiDim });
    this.buildCards();
    const left = this.g.run.rerolls;
    this.reroll = new Button(this, GAME_W / 2, GAME_H - 22, t('lv.reroll', { n: left }), () => this.doReroll(), { w: 110, h: 18, disabled: left <= 0 });
    txt(this, GAME_W - 8, GAME_H - 8, t('lv.keys'), { font: 'small', ox: 1, oy: 1, color: 0x5a5078 });

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.pick(0));
    kb.on('keydown-TWO', () => this.pick(1));
    kb.on('keydown-THREE', () => this.pick(2));
    kb.on('keydown-R', () => this.doReroll());
    audio.play('card_flip');
  }

  private makeData(): CardData[] {
    const b = this.g.build;
    const pools = unlockedPools();
    const out: CardData[] = this.offers.map((u) => {
      const lv = b.lv(u.id);
      const syn = u.synergy.filter((s) => {
        const d = UPGRADE_MAP[s];
        if (!d || d.fusion) return false;
        if (d.pool && !pools.has(d.pool)) return false;
        if (d.weapons && !d.weapons.includes(b.weapon.id)) return false;
        return true;
      });
      const owned = syn.filter((s) => b.has(s));
      let synergy = '';
      if (u.fusion && u.requires) synergy = `${t('lv.fusion')}: ${u.requires.map((r) => upgradeName(r.id)).join(' + ')}`;
      else if (syn.length) synergy = `${t('lv.synergy')}: ${(owned.length ? owned : syn).slice(0, 2).map((s) => upgradeName(s)).join(' · ')}`;
      if (u.rarity === 'curse') synergy = t('lv.curseHint');
      else if (u.rarity === 'awaken') synergy = t('lv.awakenHint');
      else if (u.rarity === 'overflow') synergy = t('lv.overflowHint');
      return {
        id: u.id,
        rarity: u.rarity,
        icon: u.icon,
        name: u.rarity === 'awaken' ? `${upgradeName(u.id)} · ${t(`awaken.${b.weapon.id}`)}` : upgradeName(u.id),
        desc: upgradeDesc(u.id, lv + 1, b.weapon.id),
        level: lv === 0 ? t('lv.new') : t('lv.levelTag', { a: lv, b: lv + 1 }),
        synergy,
        synergyHot: u.fusion === true || owned.length > 0 || u.rarity === 'awaken',
        fusion: u.fusion === true,
      };
    });
    const fallbacks = ['fallback_heal', 'fallback_shard'];
    while (out.length < 3) {
      const id = fallbacks[(out.length + 1) % 2];
      out.push({ id, rarity: 'common', icon: id, name: upgradeName(id), desc: upgradeDesc(id, 1), level: '', synergy: '', synergyHot: false, fusion: false });
    }
    return out;
  }

  private buildCards(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.cardG = [];
    this.cardData = this.makeData();
    const gap = 12;
    const total = CW * 3 + gap * 2;
    const x0 = (GAME_W - total) / 2;
    this.cardData.forEach((d, i) => {
      const cx = Math.round(x0 + i * (CW + gap) + CW / 2);
      const cy = 134;
      const c = this.add.container(cx, cy + 30);
      const g = this.add.graphics();
      c.add(g);
      this.cardG.push(g);
      const rc = RARITY_COLOR[d.rarity];
      const rarityT = txt(this, -CW / 2 + 7, -CH / 2 + 5, `${i + 1} · ${t(`rarity.${d.rarity}`)}`, { font: 'small', color: rc });
      const lvT = txt(this, CW / 2 - 7, -CH / 2 + 5, d.level, { font: 'small', ox: 1, color: d.level === t('lv.new') ? C.uiGood : C.uiText });
      const ic = this.add.image(0, -CH / 2 + 37, 'icons', ICON_INDEX[d.icon] ?? 0).setScale(2);
      const nameCol = d.fusion || d.rarity === 'awaken' ? C.uiGold : d.rarity === 'curse' ? 0xff7a90 : d.rarity === 'overflow' ? 0xd8dcf0 : 0xffffff;
      const name = txt(this, 0, -CH / 2 + 58, d.name, { font: 'body', ox: 0.5, color: nameCol });
      const desc = txt(this, 0, -CH / 2 + 76, d.desc, { font: 'small', ox: 0.5, wrap: CW - 16, align: 'center', lineSpacing: 2, color: 0xd8d0f0 });
      const syn = txt(this, 0, CH / 2 - 8, d.synergy, { font: 'small', ox: 0.5, oy: 1, wrap: CW - 12, align: 'center', color: d.synergyHot ? C.uiGold : C.uiDim });
      c.add([rarityT, lvT, ic, name, desc, syn]);
      c.setSize(CW, CH);
      c.setInteractive();
      c.on('pointerover', () => {
        this.hover = i;
        audio.play('ui_hover');
      });
      c.on('pointerout', () => {
        if (this.hover === i) this.hover = -1;
      });
      c.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.leftButtonDown()) this.pick(i);
      });
      c.setAlpha(0);
      this.tweens.add({ targets: c, y: cy, alpha: 1, duration: 220, delay: i * 60, ease: 'Back.Out' });
      this.cards.push(c);
    });
  }

  private drawCard(i: number, t2: number): void {
    const g = this.cardG[i];
    const d = this.cardData[i];
    if (!g || !d) return;
    g.clear();
    const hot = this.hover === i;
    const rc = RARITY_COLOR[d.rarity];
    const x = -CW / 2;
    const y = -CH / 2 - (hot ? 3 : 0);
    if (d.fusion || d.rarity === 'awaken' || d.rarity === 'curse') {
      const pulse = 0.5 + Math.sin(t2 * (d.rarity === 'curse' ? 9 : 6)) * 0.3;
      g.fillStyle(rc, pulse * 0.35);
      g.fillRect(x - 3, y - 3, CW + 6, CH + 6);
    }
    drawPanel(g, x, y, CW, CH, { fill: hot ? 0x241a40 : 0x160f2a, fillAlpha: 0.97, edge: rc, thick: hot ? 2 : 1, inner: 0x2e2450 });
    g.fillStyle(rc, 0.18);
    g.fillRect(x + 4, y + 22, CW - 8, 30);
    g.fillStyle(rc, 1);
    g.fillRect(x + 4, y + 52, CW - 8, 1);
    this.cards[i].list.forEach((o) => {
      if (o instanceof Phaser.GameObjects.Text || o instanceof Phaser.GameObjects.Image) {
        // keep children aligned with the lifted frame
        const base = (o.getData('baseY') as number | undefined) ?? o.y;
        if (o.getData('baseY') === undefined) o.setData('baseY', base);
        o.y = base - (hot ? 3 : 0);
      }
    });
  }

  private doReroll(): void {
    if (this.chosen || this.delay > 0) return;
    if (this.g.run.rerolls <= 0) {
      audio.play('ui_error');
      return;
    }
    this.g.run.rerolls--;
    this.offers = this.g.rollUpgradeOffers(this.kind === 'core');
    this.buildCards();
    this.reroll.setText(t('lv.reroll', { n: this.g.run.rerolls })).setDisabled(this.g.run.rerolls <= 0);
    audio.play('card_flip');
  }

  private pick(i: number): void {
    if (this.chosen || this.delay > 0) return;
    const d = this.cardData[i];
    if (!d) return;
    this.chosen = true;
    audio.play(d.fusion ? 'fusion' : 'upgrade');
    const c = this.cards[i];
    this.tweens.add({ targets: c, scaleX: 1.08, scaleY: 1.08, duration: 90, yoyo: true });
    this.cards.forEach((o, k) => {
      if (k !== i) this.tweens.add({ targets: o, alpha: 0, y: o.y + 20, duration: 150 });
    });
    this.time.delayedCall(200, () => {
      this.g.applyUpgrade(d.id, this.kind);
      audio.duck(false);
      this.scene.stop();
      this.g.scene.resume('Game');
      this.g.scene.get('Hud')?.input.setDefaultCursor('none');
    });
  }

  update(time: number, delta: number): void {
    this.delay -= delta / 1000;
    for (let i = 0; i < this.cards.length; i++) this.drawCard(i, time / 1000);
    if (this.g.bot && !this.chosen && this.delay <= -0.15) this.pick(0);
    void cssHex;
  }
}
