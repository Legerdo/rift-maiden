import Phaser from 'phaser';
import { GAME_H, GAME_W, GROUND_Y } from '../core/constants';
import { formatTime } from '../core/mathx';
import { store } from '../core/app';
import { t } from '../localization/i18n';
import { txt, Button } from '../ui/ui';
import { C } from '../art/palette';
import { audio } from '../audio/audio';
import { PARALLAX, BG_MARGIN } from '../art/bgArt';
import { HERO_ANCHORS, HERO_ANIM, HERO_ORIGIN, HEAD_NECK, HEAD_W, HEAD_H, HEAD_HAIR_ROOT, ARM_PIVOT, ARM_W, ARM_H } from '../art/heroine';
import type { GameInit } from './GameScene';
import type { WeaponId } from '../data/weapons';
import type { SkillId } from '../data/skills';

export class TitleScene extends Phaser.Scene {
  private layers: { img: Phaser.GameObjects.Image; f: number }[] = [];
  private t = 0;
  private body!: Phaser.GameObjects.Sprite;
  private head!: Phaser.GameObjects.Sprite;
  private arm!: Phaser.GameObjects.Sprite;
  private logo!: Phaser.GameObjects.Text;
  private logoOutline: Phaser.GameObjects.Text[] = [];
  private started = false;
  private press!: Phaser.GameObjects.Text;
  private menu: Button[] = [];
  private rain: { x: number; y: number; v: number }[] = [];
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Title');
  }

  create(): void {
    this.t = 0;
    this.layers = [];
    this.menu = [];
    this.started = audio.ready;
    this.input.setDefaultCursor('default');
    const add = (key: string, f: number, y = 0) => {
      const img = this.add.image(-BG_MARGIN, y, key).setOrigin(0, 0);
      this.layers.push({ img, f });
    };
    add('bg_neon_sky', 0);
    add('bg_neon_far', PARALLAX.far);
    add('bg_neon_mid', PARALLAX.mid);
    add('bg_neon_near', PARALLAX.near);
    add('bg_neon_ground', 1, GROUND_Y - 2);
    this.gfx = this.add.graphics();
    this.rain = [];
    for (let i = 0; i < 60; i++) this.rain.push({ x: Math.random() * GAME_W, y: Math.random() * GAME_H, v: 0.6 + Math.random() * 0.8 });

    // Heroine at 2x
    const S = 2;
    const fx = 118;
    const fy = GROUND_Y + 2;
    this.body = this.add.sprite(fx, fy, 'hero_body', 0).setOrigin(HERO_ORIGIN.x / 64, HERO_ORIGIN.y / 64).setScale(S);
    const a = HERO_ANCHORS[0];
    this.head = this.add.sprite(fx + (a.head.x - HERO_ORIGIN.x) * S, fy + (a.head.y - HERO_ORIGIN.y) * S, 'hero_head', 0).setOrigin(HEAD_NECK.x / HEAD_W, HEAD_NECK.y / HEAD_H).setScale(S);
    this.arm = this.add.sprite(fx + (a.shoulder.x - HERO_ORIGIN.x) * S, fy + (a.shoulder.y - HERO_ORIGIN.y) * S, 'arm_smg', 0).setOrigin(ARM_PIVOT.x / ARM_W, ARM_PIVOT.y / ARM_H).setScale(S).setRotation(-0.35);

    // soft backdrop behind the menu for readability
    const back = this.add.graphics();
    back.fillStyle(0x05060f, 0.55);
    back.fillRect(206, 108, 224, 128);
    back.fillStyle(0x05060f, 0.35);
    back.fillRect(206, 104, 224, 4);
    // dark band behind the logo so it never fights with the moon
    for (let i = 0; i < 6; i++) {
      back.fillStyle(0x04050c, 0.14 + i * 0.1);
      back.fillRect(150 + i * 4, 26 + i * 2, 336 - i * 8, 80 - i * 4);
    }
    // Logo with a crisp 1px (x3) outline built from offset copies
    this.logoOutline = [];
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [1, 1],
    ]) {
      const o = txt(this, 318 + ox * 3, 58 + oy * 3, t('game.title'), { font: 'big', ox: 0.5, oy: 0.5, color: 0x05030a, shadow: false }).setScale(3);
      o.setData('ox', ox * 3).setData('oy', oy * 3);
      this.logoOutline.push(o);
    }
    this.logo = txt(this, 318, 58, t('game.title'), { font: 'big', ox: 0.5, oy: 0.5, color: 0xffffff, shadow: false }).setScale(3);
    this.logo.setTint(0xffffff, 0xffffff, 0x8ff8ff, 0xc890ff);
    txt(this, 318, 92, t('game.subtitle'), { font: 'body', ox: 0.5, oy: 0.5, color: C.scarf }).setScale(2);
    txt(this, 318, 118, t('title.story1'), { font: 'small', ox: 0.5, color: C.uiDim });
    txt(this, 318, 131, t('title.story2'), { font: 'small', ox: 0.5, color: C.uiDim });

    const st = store.data.stats;
    if (st.runs > 0) txt(this, 318, 250, t('title.best', { time: formatTime(st.bestTime), clears: st.clears }), { font: 'small', ox: 0.5, color: C.uiDim });
    txt(this, GAME_W - 6, GAME_H - 4, t('title.credits'), { font: 'small', ox: 1, oy: 1, color: 0x4a4068 });

    this.press = txt(this, 318, 180, t('title.press'), { font: 'body', ox: 0.5, oy: 0.5, color: 0xffffff });
    if (this.started) this.showMenu();
    else {
      this.input.once('pointerdown', () => this.unlock());
      this.input.keyboard?.once('keydown', () => this.unlock());
    }
  }

  private unlock(): void {
    if (this.started) return;
    this.started = true;
    audio.unlock();
    audio.play('ui_select');
    this.showMenu();
  }

  private showMenu(): void {
    audio.playMusic(4);
    this.press.setVisible(false);
    const firstRun = store.data.stats.runs === 0;
    const y0 = 166;
    const start = new Button(this, 318, y0, t('title.start'), () => this.launch(firstRun), { w: 130, h: 20, font: 'body', edge: C.uiCyan });
    const hub = new Button(this, 318, y0 + 26, t('title.hub'), () => this.scene.start('Hub'), { w: 130, h: 18 });
    const set = new Button(this, 318, y0 + 50, t('title.settings'), () => {
      this.scene.pause();
      this.scene.launch('Settings', { from: 'Title' });
    }, { w: 130, h: 18 });
    this.menu = [start, hub, set];
    this.menu.forEach((b, i) => {
      b.setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, duration: 250, delay: i * 70 });
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.launch(firstRun));
  }

  private launch(direct: boolean): void {
    if (!direct) {
      this.scene.start('Hub');
      return;
    }
    const d = store.data;
    const init: GameInit = { weapon: d.weapon as WeaponId, skillQ: d.skillQ as SkillId, skillE: d.skillE as SkillId, depth: d.depth };
    audio.stopMusic(0.4);
    this.cameras.main.fadeOut(300, 7, 5, 13);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', init));
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    const pan = (Math.sin(this.t * 0.08) * 0.5 + 0.5) * 300;
    for (const l of this.layers) l.img.x = Math.round(-BG_MARGIN - pan * l.f);
    const idle = HERO_ANIM.idle;
    const f = idle[Math.floor(this.t * 3) % idle.length];
    this.body.setFrame(f);
    const a = HERO_ANCHORS[f];
    const S = 2;
    const fx = 118;
    const fy = GROUND_Y + 2;
    this.head.setPosition(fx + (a.head.x - HERO_ORIGIN.x) * S, fy + (a.head.y - HERO_ORIGIN.y) * S).setFrame(Math.floor(this.t) % 5 === 4 && this.t % 1 < 0.12 ? 1 : 0);
    this.arm.setPosition(fx + (a.shoulder.x - HERO_ORIGIN.x) * S, fy + (a.shoulder.y - HERO_ORIGIN.y) * S);
    const ly = 58 + Math.round(Math.sin(this.t * 1.5) * 2);
    this.logo.setY(ly);
    for (const o of this.logoOutline) o.setPosition(this.logo.x + (o.getData('ox') as number), ly + (o.getData('oy') as number));
    if (!this.started) this.press.setAlpha(0.5 + Math.sin(this.t * 4) * 0.5);
    const g = this.gfx;
    g.clear();
    // ponytail + scarf tails swaying in the wind (behind the body)
    const hx = this.head.x + (HEAD_HAIR_ROOT.x - HEAD_NECK.x) * S;
    const hy = this.head.y + (HEAD_HAIR_ROOT.y - HEAD_NECK.y) * S;
    const radii = [7, 6.6, 6, 5.2, 4.2, 3.2];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = radii.length - 1; i >= 0; i--) {
        const k = i / radii.length;
        const x = hx - i * 5 - k * 3 + Math.sin(this.t * 2 + i * 0.6) * i * 0.8;
        const y = hy + i * 6.5 + Math.cos(this.t * 1.6 + i * 0.5) * i * 0.6;
        g.fillStyle(pass === 0 ? C.ink : i > 3 ? C.hairLo : C.hairMid, 1);
        g.fillCircle(Math.round(x), Math.round(y), radii[i] + (pass === 0 ? 2 : 0));
      }
    }
    const sx = fx + (a.scarf.x - HERO_ORIGIN.x) * S;
    const sy = fy + (a.scarf.y - HERO_ORIGIN.y) * S;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < 6; i++) {
        const x0 = sx - (i - 1) * 6 + Math.sin(this.t * 3 + (i - 1)) * (i - 1);
        const y0 = sy + (i - 1) * 3;
        const x1 = sx - i * 6 + Math.sin(this.t * 3 + i) * i;
        const y1 = sy + i * 3;
        g.lineStyle(pass === 0 ? 8 - i * 0.6 : 5 - i * 0.6, pass === 0 ? C.ink : i % 2 ? C.scarf : C.scarfLo, 1);
        g.lineBetween(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1));
      }
    }
    g.fillStyle(0x8a88c8, 0.35);
    for (const r of this.rain) {
      r.y += 260 * r.v * dt;
      r.x -= 60 * r.v * dt;
      if (r.y > GAME_H) {
        r.y = -10;
        r.x = Math.random() * (GAME_W + 60);
      }
      g.fillRect(Math.round(r.x), Math.round(r.y), 1, 4);
    }
    // glitch slice on the logo now and then
    if (Math.random() < 0.01) {
      this.logo.setX(318 + (Math.random() < 0.5 ? -2 : 2));
      this.time.delayedCall(60, () => this.logo.setX(318));
    }
  }
}
