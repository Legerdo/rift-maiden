// 균열 공방: loadout (weapon, skills, depth) + permanent unlock shop.

import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../core/constants';
import { store, weaponUnlocked, skillUnlocked, metaLv, validateLoadout } from '../core/app';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../data/weapons';
import { SKILL_ORDER, SKILLS, type SkillId } from '../data/skills';
import { META, META_CATS, type MetaCat, nextCost } from '../data/meta';
import { depthScale } from '../data/zones';
import { t } from '../localization/i18n';
import { txt, drawPanel, Button } from '../ui/ui';
import { C } from '../art/palette';
import { ICON_INDEX } from '../art/uiArt';
import { audio } from '../audio/audio';
import type { GameInit } from './GameScene';

export class HubScene extends Phaser.Scene {
  private cat: MetaCat = 'weapon';
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private shardText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private toastT = 0;

  constructor() {
    super('Hub');
  }

  create(): void {
    this.input.setDefaultCursor('default');
    this.cameras.main.setBackgroundColor(0x0c0818);
    audio.playMusic(4);
    validateLoadout();
    const bg = this.add.graphics();
    // subtle backdrop grid
    bg.fillStyle(0x140e26, 1);
    for (let x = 0; x < GAME_W; x += 16) bg.fillRect(x, 0, 1, GAME_H);
    for (let y = 0; y < GAME_H; y += 16) bg.fillRect(0, y, GAME_W, 1);
    txt(this, 10, 8, t('hub.title'), { font: 'big', color: 0xffffff });
    this.add.image(GAME_W - 70, 15, 'shard', 0);
    this.shardText = txt(this, GAME_W - 60, 9, '', { font: 'body', color: C.shard });
    this.toast = txt(this, 196 + (GAME_W - 204) / 2, GAME_H - 16, '', { font: 'small', ox: 0.5, oy: 0.5, color: C.uiGood });
    new Button(this, 48, GAME_H - 16, t('hub.back'), () => this.scene.start('Title'), { w: 76, h: 18 });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Title'));
    this.input.keyboard?.on('keydown-ENTER', () => this.launch());
    this.refresh();
  }

  private clearDyn(): void {
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
  }

  private d<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dyn.push(o);
    return o;
  }

  private refresh(): void {
    this.clearDyn();
    const sd = store.data;
    this.shardText.setText(String(sd.shards));
    const g = this.d(this.add.graphics());

    // ---------------- loadout
    const lx = 8;
    const ly = 30;
    const lw = 180;
    const lh = 200;
    drawPanel(g, lx, ly, lw, lh, { edge: C.uiCyan });
    this.d(txt(this, lx + 8, ly + 5, t('hub.loadout'), { font: 'body', color: C.uiCyan }));
    this.d(txt(this, lx + 8, ly + 22, t('hub.weapon'), { font: 'small', color: C.uiDim }));
    WEAPON_ORDER.forEach((w, i) => {
      const x = lx + 22 + i * 40;
      const y = ly + 46;
      const un = weaponUnlocked(w);
      const sel = sd.weapon === w;
      drawPanel(g, x - 16, y - 12, 32, 24, { fill: sel ? 0x2a2050 : 0x140e24, edge: sel ? C.uiGold : un ? C.uiEdge : 0x2a2440, inner: null });
      const ic = this.d(this.add.image(x, y, 'icons', ICON_INDEX[un ? WEAPONS[w].icon : 'lock'] ?? 0));
      ic.setAlpha(un ? 1 : 0.5).setInteractive();
      ic.on('pointerdown', () => {
        if (!un) {
          audio.play('ui_error');
          this.showToast(t('hub.lockedWeapon'), C.uiBad);
          return;
        }
        sd.weapon = w;
        store.save();
        audio.play('ui_select');
        this.refresh();
      });
      ic.on('pointerover', () => audio.play('ui_hover'));
    });
    const w = sd.weapon as WeaponId;
    this.d(txt(this, lx + 8, ly + 62, t(`weapon.${w}`), { font: 'body', color: 0xffffff }));
    this.d(txt(this, lx + 8, ly + 76, t(`weapon.${w}.desc`), { font: 'small', color: C.uiDim, wrap: lw - 16 }));

    // skills
    this.d(txt(this, lx + 8, ly + 104, `${t('hub.skillQ')} / ${t('hub.skillE')}`, { font: 'small', color: C.uiDim }));
    SKILL_ORDER.forEach((s, i) => {
      const x = lx + 22 + i * 40;
      const y = ly + 128;
      const un = skillUnlocked(s);
      const slot = sd.skillQ === s ? 'Q' : sd.skillE === s ? 'E' : '';
      drawPanel(g, x - 16, y - 12, 32, 24, { fill: slot ? 0x2a2050 : 0x140e24, edge: slot ? C.uiGold : un ? C.uiEdge : 0x2a2440, inner: null });
      const ic = this.d(this.add.image(x, y, 'icons', ICON_INDEX[un ? SKILLS[s].icon : 'lock'] ?? 0));
      ic.setAlpha(un ? 1 : 0.5).setInteractive();
      if (slot) this.d(txt(this, x + 14, y - 12, slot, { font: 'small', ox: 1, color: C.uiGold }));
      ic.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!un) {
          audio.play('ui_error');
          this.showToast(t('hub.lockedWeapon'), C.uiBad);
          return;
        }
        // left click -> Q, right click -> E (swap if needed)
        const toE = p.rightButtonDown();
        if (toE) {
          if (sd.skillQ === s) sd.skillQ = sd.skillE;
          sd.skillE = s;
        } else {
          if (sd.skillE === s) sd.skillE = sd.skillQ;
          sd.skillQ = s;
        }
        store.save();
        audio.play('ui_select');
        this.refresh();
      });
      ic.on('pointerover', () => {
        audio.play('ui_hover');
        this.showToast(`${t(`skill.${s}`)} · ${t(`skill.${s}.desc`)}`, C.uiText);
      });
    });
    this.d(txt(this, lx + 8, ly + 144, t('hub.skillHint'), { font: 'small', color: 0x5a5078 }));

    // depth
    const dy = ly + 162;
    this.d(txt(this, lx + 8, dy, t('hub.depth'), { font: 'small', color: C.uiDim }));
    if (sd.maxDepth > 0) {
      const ds = depthScale(sd.depth);
      this.d(txt(this, lx + 100, dy, sd.depth === 0 ? t('hub.depth0') : `${sd.depth}`, { font: 'body', ox: 0.5, color: sd.depth > 0 ? C.uiBad : C.uiText }));
      this.d(
        new Button(this, lx + 76, dy + 6, '◀', () => {
          sd.depth = Math.max(0, sd.depth - 1);
          store.save();
          this.refresh();
        }, { w: 16, h: 14 }),
      );
      this.d(
        new Button(this, lx + 124, dy + 6, '▶', () => {
          sd.depth = Math.min(sd.maxDepth, sd.depth + 1);
          store.save();
          this.refresh();
        }, { w: 16, h: 14 }),
      );
      this.d(txt(this, lx + 8, dy + 16, t('hub.depthDesc', { hp: Math.round((ds.hp - 1) * 100), sh: Math.round((ds.shards - 1) * 100) }), { font: 'small', color: C.uiDim }));
    } else this.d(txt(this, lx + 8, dy + 12, t('hub.depthLocked'), { font: 'small', color: 0x5a5078 }));

    this.d(new Button(this, 138, GAME_H - 16, t('hub.launch'), () => this.launch(), { w: 92, h: 20, font: 'body', edge: C.uiCyan }));

    // ---------------- shop
    const sx = 196;
    const sy = 30;
    const sw = GAME_W - sx - 8;
    const sh = 200;
    drawPanel(g, sx, sy, sw, sh, { edge: C.uiGold });
    META_CATS.forEach((c, i) => {
      const bw = Math.floor((sw - 12) / META_CATS.length);
      const b = this.d(
        new Button(this, sx + 6 + bw * i + bw / 2, sy + 12, t(`hub.cat.${c}`), () => {
          this.cat = c;
          this.refresh();
        }, { w: bw - 4, h: 16 }),
      );
      b.setSelected(this.cat === c);
    });
    const items = META.filter((m) => m.cat === this.cat);
    items.forEach((m, i) => {
      const y = sy + 30 + i * 24;
      const lv = metaLv(m.id);
      const max = m.costs.length;
      const cost = nextCost(sd.meta, m.id);
      const owned = lv >= max;
      drawPanel(g, sx + 4, y, sw - 8, 22, { fill: owned ? 0x10201a : 0x140e24, edge: owned ? 0x2a6a4a : 0x2a2244, inner: null });
      this.d(this.add.image(sx + 16, y + 11, 'icons', ICON_INDEX[m.icon] ?? 0));
      this.d(txt(this, sx + 28, y + 2, t(`meta.${m.id}`), { font: 'small', color: owned ? C.uiGood : 0xffffff }));
      this.d(txt(this, sx + 28, y + 12, t(`meta.${m.id}.desc`), { font: 'tiny', color: C.uiDim }));
      if (max > 1) this.d(txt(this, sx + sw - 70, y + 2, t('hub.level', { lv, max }), { font: 'tiny', ox: 1, color: C.uiDim }));
      if (owned) this.d(txt(this, sx + sw - 12, y + 6, t('hub.max'), { font: 'small', ox: 1, color: C.uiGood }));
      else if (cost !== null) {
        const afford = sd.shards >= cost;
        this.d(
          new Button(this, sx + sw - 34, y + 11, `${t('hub.buy')} ${cost}`, () => this.buy(m.id), {
            w: 50,
            h: 16,
            color: afford ? C.shard : 0x6a5a48,
            edge: afford ? C.uiGold : 0x3a3050,
          }),
        );
      }
    });
    this.d(txt(this, sx + sw / 2, sy + sh - 4, t('hub.hint'), { font: 'tiny', ox: 0.5, oy: 1, color: 0x4a4068 }));
  }

  private buy(id: string): void {
    const sd = store.data;
    const cost = nextCost(sd.meta, id);
    if (cost === null) return;
    if (sd.shards < cost) {
      audio.play('ui_error');
      this.showToast(t('hub.notEnough'), C.uiBad);
      return;
    }
    sd.shards -= cost;
    sd.meta[id] = (sd.meta[id] ?? 0) + 1;
    store.save();
    audio.play('ui_buy');
    this.showToast(t('hub.bought', { name: t(`meta.${id}`) }), C.uiGood);
    this.cameras.main.flash(120, 255, 220, 120);
    this.refresh();
  }

  private showToast(s: string, color: number): void {
    this.toast.setText(s).setColor('#' + color.toString(16).padStart(6, '0')).setAlpha(1);
    this.toastT = 2.5;
  }

  private launch(): void {
    const d = store.data;
    validateLoadout();
    const init: GameInit = { weapon: d.weapon as WeaponId, skillQ: d.skillQ as SkillId, skillE: d.skillE as SkillId, depth: d.depth };
    audio.stopMusic(0.4);
    audio.play('ui_select');
    this.cameras.main.fadeOut(250, 7, 5, 13);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', init));
  }

  update(_t: number, delta: number): void {
    if (this.toastT > 0) {
      this.toastT -= delta / 1000;
      if (this.toastT < 0.5) this.toast.setAlpha(Math.max(0, this.toastT / 0.5));
    }
  }
}
