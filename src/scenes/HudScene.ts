// HUD overlay: only what matters in combat – HP, dash, skills, XP, combo,
// shards, boss bar, banners, tutorial prompts, threat arrows and crosshair.

import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../core/constants';
import { formatTime, clamp } from '../core/mathx';
import { COMBO, comboMultiplier, comboTier } from '../data/balance';
import { SKILLS } from '../data/skills';
import { t } from '../localization/i18n';
import { txt, drawPanel } from '../ui/ui';
import { C } from '../art/palette';
import { ICON_INDEX } from '../art/uiArt';
import { cssHex } from '../art/pixel';
import type { GameScene } from './GameScene';
import type { BossCtl } from '../game/bosses';

interface Banner {
  text: string;
  sub: string;
  color: number;
  dur: number;
}

export class HudScene extends Phaser.Scene {
  private g!: GameScene;
  private gfx!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Image[] = [];
  private dashPips: Phaser.GameObjects.Image[] = [];
  private lvText!: Phaser.GameObjects.Text;
  private zoneText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private shardText!: Phaser.GameObjects.Text;
  private shardIcon!: Phaser.GameObjects.Image;
  private comboNum!: Phaser.GameObjects.BitmapText;
  private comboLabel!: Phaser.GameObjects.Text;
  private comboMul!: Phaser.GameObjects.Text;
  private skillIcons: Phaser.GameObjects.Image[] = [];
  private skillKeys: Phaser.GameObjects.Text[] = [];
  private skillCd: Phaser.GameObjects.Text[] = [];
  private weaponIcon!: Phaser.GameObjects.Image;
  private tutText!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private warnText!: Phaser.GameObjects.Text;
  private crosshair!: Phaser.GameObjects.Image;
  private eventText!: Phaser.GameObjects.Text;
  private crown!: Phaser.GameObjects.Image;
  private arrows: Phaser.GameObjects.Image[] = [];
  private banners: Banner[] = [];
  private bannerT = 0;
  private curBanner: Banner | null = null;
  private warnT = 0;
  private pulses: Record<string, number> = {};
  private boss: BossCtl | null = null;
  private bossShown = 0;
  private hurtT = 0;
  private textCache: Record<string, string | number> = {};
  private t = 0;

  constructor() {
    super('Hud');
  }

  init(data: { game: GameScene }): void {
    this.g = data.game;
    this.banners = [];
    this.curBanner = null;
    this.bannerT = 0;
    this.warnT = 0;
    this.boss = null;
    this.textCache = {};
    this.hearts = [];
    this.dashPips = [];
    this.skillIcons = [];
    this.skillKeys = [];
    this.skillCd = [];
    this.arrows = [];
  }

  create(): void {
    const g = this.g;
    this.input.setDefaultCursor('none');
    this.gfx = this.add.graphics();
    this.lvText = txt(this, 6, 26, '', { font: 'small', color: C.uiGood });
    this.zoneText = txt(this, GAME_W / 2, 6, '', { font: 'small', ox: 0.5, color: C.uiDim });
    this.timeText = txt(this, GAME_W / 2, 17, '', { font: 'small', ox: 0.5 });
    this.shardIcon = this.add.image(GAME_W - 54, 12, 'shard', 0);
    this.shardText = txt(this, GAME_W - 46, 7, '0', { font: 'small', color: C.shard });
    this.comboNum = this.add.bitmapText(GAME_W - 12, 78, 'num_l', '0').setOrigin(1, 1).setScale(2).setLetterSpacing(-1);
    this.comboLabel = txt(this, GAME_W - 12, 80, '', { font: 'small', ox: 1 });
    this.comboMul = txt(this, GAME_W - 12, 92, '', { font: 'small', ox: 1, color: C.uiGood });
    for (let i = 0; i < 2; i++) {
      const x = 16 + i * 30;
      const y = GAME_H - 20;
      this.skillIcons.push(this.add.image(x, y, 'icons', ICON_INDEX[SKILLS[g.skills.slots[i]].icon] ?? 0));
      this.skillKeys.push(txt(this, x - 10, y - 17, i === 0 ? 'Q' : 'E', { font: 'tiny', color: C.uiText }));
      this.skillCd.push(txt(this, x, y - 5, '', { font: 'small', ox: 0.5, color: 0xffffff }));
    }
    this.weaponIcon = this.add.image(84, GAME_H - 20, 'icons', ICON_INDEX[g.build.weapon.icon] ?? 0);
    this.tutText = txt(this, GAME_W / 2, GAME_H - 30, '', { font: 'small', ox: 0.5, oy: 0.5 });
    this.bossName = txt(this, GAME_W / 2, 5, '', { font: 'small', ox: 0.5, color: 0xff9ab0 });
    this.bannerText = txt(this, GAME_W / 2, 92, '', { font: 'big', ox: 0.5, oy: 0.5 }).setScale(2);
    this.bannerSub = txt(this, GAME_W / 2, 116, '', { font: 'small', ox: 0.5, oy: 0.5, color: C.uiDim });
    this.warnText = txt(this, GAME_W / 2, 70, t('banner.bossWarn'), { font: 'body', ox: 0.5, oy: 0.5, color: 0xff5c7a }).setVisible(false);
    this.eventText = txt(this, GAME_W / 2, 34, '', { font: 'small', ox: 0.5, color: C.uiGold });
    this.crown = this.add.image(-20, -20, 'crown', 0).setVisible(false);
    this.crosshair = this.add.image(0, 0, 'crosshair', 0).setDepth(100);
    for (let i = 0; i < 8; i++) this.arrows.push(this.add.image(-20, -20, 'arrow').setVisible(false));

    g.events.on('banner', this.onBanner, this);
    g.events.on('pulse', this.onPulse, this);
    g.events.on('bossWarn', this.onBossWarn, this);
    g.events.on('bossStart', this.onBossStart, this);
    this.events.once('shutdown', () => {
      g.events.off('banner', this.onBanner, this);
      g.events.off('pulse', this.onPulse, this);
      g.events.off('bossWarn', this.onBossWarn, this);
      g.events.off('bossStart', this.onBossStart, this);
      this.input.setDefaultCursor('default');
    });
  }

  private onBanner(b: Banner): void {
    // zone / victory banners replace, small ones queue
    this.banners.push(b);
    if (this.banners.length > 3) this.banners.shift();
  }

  private onPulse(kind: string): void {
    this.pulses[kind] = 1;
    if (kind === 'hurt') this.hurtT = 0.4;
  }

  private onBossWarn(): void {
    this.warnT = 3;
  }

  private onBossStart(b: BossCtl): void {
    this.boss = b;
    this.bossShown = 0;
  }

  private setText(o: Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText, key: string, v: string): void {
    if (this.textCache[key] === v) return;
    this.textCache[key] = v;
    o.setText(v);
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(0.05, delta / 1000);
    this.t += dt;
    const g = this.g;
    if (!g || !g.run) return;
    const p = g.player;
    const r = g.run;
    const gr = this.gfx;
    gr.clear();
    for (const k of Object.keys(this.pulses)) this.pulses[k] = Math.max(0, this.pulses[k] - dt * 3);

    // ---- hurt / low HP vignette
    this.hurtT = Math.max(0, this.hurtT - dt);
    const low = p.hp <= 1 && !p.dead;
    const va = Math.max(this.hurtT * 0.9, low ? 0.18 + Math.sin(this.t * 6) * 0.1 : 0);
    if (va > 0.01) {
      for (let i = 0; i < 6; i++) {
        gr.fillStyle(0xff2a4a, va * (1 - i / 6));
        gr.fillRect(0, i * 3, GAME_W, 3);
        gr.fillRect(0, GAME_H - (i + 1) * 3, GAME_W, 3);
        gr.fillRect(i * 3, 0, 3, GAME_H);
        gr.fillRect(GAME_W - (i + 1) * 3, 0, 3, GAME_H);
      }
    }

    // ---- XP bar (top edge)
    const xpFrac = clamp(r.xp / r.xpNext, 0, 1);
    gr.fillStyle(0x0a0714, 0.9);
    gr.fillRect(0, 0, GAME_W, 3);
    gr.fillStyle(this.pulses.xp > 0.5 ? 0xd8ffe4 : C.xp, 1);
    gr.fillRect(0, 0, Math.round(GAME_W * xpFrac), 2);
    gr.fillStyle(C.xpLo, 1);
    gr.fillRect(0, 2, Math.round(GAME_W * xpFrac), 1);

    // ---- hearts
    const maxHp = p.maxHp;
    while (this.hearts.length < maxHp + 1) this.hearts.push(this.add.image(0, 0, 'pips', 0));
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      if (i < maxHp) {
        const full = i < p.hp;
        const pop = full && i === p.hp - 1 && this.pulses.hp > 0 ? 1 + this.pulses.hp * 0.5 : 1;
        h.setVisible(true).setFrame(full ? 0 : 1).setPosition(10 + i * 10, 11).setScale(pop);
        if (low && full) h.setPosition(10 + i * 10, 11 + (Math.sin(this.t * 20) > 0 ? -1 : 0));
      } else if (i === maxHp) {
        h.setVisible(p.barrierUp).setFrame(2).setPosition(10 + i * 10 + 2, 11).setScale(1);
      } else h.setVisible(false);
    }
    // dash pips
    const dc = g.build.dashCharges;
    while (this.dashPips.length < 2) this.dashPips.push(this.add.image(0, 0, 'pips', 3));
    for (let i = 0; i < 2; i++) {
      const d = this.dashPips[i];
      if (i >= dc) {
        d.setVisible(false);
        continue;
      }
      d.setVisible(true).setFrame(i < p.dashCharges ? 3 : 4).setPosition(10 + i * 9, 21);
    }
    if (p.dashCharges < dc) {
      const frac = 1 - clamp(p.dashRecharge / p.dashCooldown, 0, 1);
      gr.fillStyle(0x6ef4ff, 0.8);
      gr.fillRect(6 + p.dashCharges * 9, 26, Math.round(8 * frac), 1);
    }
    this.setText(this.lvText, 'lv', t('hud.lv', { n: r.level }));
    this.lvText.setY(28);

    // ---- zone / timer or boss bar
    const b = this.boss && this.boss.alive ? this.boss : null;
    if (b) {
      this.bossShown = Math.min(1, this.bossShown + dt * 1.5);
      this.zoneText.setVisible(false);
      this.timeText.setVisible(false);
      this.bossName.setVisible(true);
      this.setText(this.bossName, 'boss', t(b.nameKey));
      const bw = 220;
      const bx = Math.round(GAME_W / 2 - bw / 2);
      drawPanel(gr, bx - 2, 16, bw + 4, 8, { fill: 0x0a0714, edge: 0x6a2040, inner: null });
      gr.fillStyle(0x3a0c1c, 1);
      gr.fillRect(bx, 18, bw, 4);
      const hf = b.hpFrac() * this.bossShown;
      gr.fillStyle(0xff3c6a, 1);
      gr.fillRect(bx, 18, Math.round(bw * hf), 3);
      gr.fillStyle(0xffa0b8, 1);
      gr.fillRect(bx, 18, Math.round(bw * hf), 1);
      for (const m of [0.66, 0.5, 0.33]) {
        if ((b.id === 'warden' && m === 0.5) || (b.id === 'orbis' && m !== 0.5)) {
          gr.fillStyle(0xffffff, 0.7);
          gr.fillRect(bx + Math.round(bw * m), 17, 1, 6);
        }
      }
    } else {
      this.bossName.setVisible(false);
      this.zoneText.setVisible(true);
      this.timeText.setVisible(true);
      const z = g.director.zone;
      this.setText(this.zoneText, 'zone', `${t('zone.label', { n: g.director.zoneIndex + 1 })} · ${t(`zone.${z.id}`)}`);
      this.setText(this.timeText, 'time', formatTime(r.time));
      // zone progress
      const pw = 80;
      const px = Math.round(GAME_W / 2 - pw / 2);
      gr.fillStyle(0x0a0714, 0.8);
      gr.fillRect(px, 29, pw, 2);
      gr.fillStyle(z.boss ? 0xff5c7a : 0xc890ff, 1);
      gr.fillRect(px, 29, Math.round(pw * g.director.zoneProgress), 2);
    }

    // ---- shards
    this.setText(this.shardText, 'shards', String(r.shardsPicked));
    this.shardIcon.setScale(1 + (this.pulses.shard ?? 0) * 0.6);

    // ---- combo
    const combo = r.combo;
    const tier = comboTier(combo);
    const show = combo >= 5;
    this.comboNum.setVisible(show);
    this.comboLabel.setVisible(show);
    this.comboMul.setVisible(show);
    if (show) {
      const col = tier >= 0 ? COMBO.tiers[tier].color : 0xffffff;
      this.setText(this.comboNum, 'combo', String(combo));
      this.comboNum.setTint(col).setScale(2 + (this.pulses.combo ?? 0) * 0.8);
      const label = tier >= 0 ? `${t('hud.combo')} · ${t(COMBO.tiers[tier].key)}` : t('hud.combo');
      this.setText(this.comboLabel, 'comboL', label);
      this.comboLabel.setColor(cssHex(col));
      this.setText(this.comboMul, 'comboM', t('hud.xpMul', { m: comboMultiplier(combo).toFixed(2) }));
      const frac = clamp(r.comboT / COMBO.window, 0, 1);
      gr.fillStyle(0x0a0714, 0.8);
      gr.fillRect(GAME_W - 62, 104, 50, 2);
      gr.fillStyle(col, 1);
      gr.fillRect(GAME_W - 62, 104, Math.round(50 * frac), 2);
    }

    // ---- skills
    for (let i = 0; i < 2; i++) {
      const x = 16 + i * 30;
      const y = GAME_H - 20;
      const frac = g.skills.cdFrac(i);
      drawPanel(gr, x - 12, y - 12, 24, 24, { fill: 0x0a0714, edge: frac <= 0 ? C.uiCyan : C.uiEdge, inner: null });
      this.skillIcons[i].setAlpha(frac > 0 ? 0.45 : 1);
      if (frac > 0) {
        gr.fillStyle(0x000000, 0.55);
        gr.fillRect(x - 10, y - 10, 20, Math.round(20 * frac));
        this.setText(this.skillCd[i], `cd${i}`, String(Math.ceil(g.skills.cd[i])));
      } else this.setText(this.skillCd[i], `cd${i}`, '');
    }
    // weapon + heat
    drawPanel(gr, 72, GAME_H - 32, 24, 24, { fill: 0x0a0714, edge: C.uiEdge, inner: null });
    const heatVisible = g.build.weapon.mode === 'beam' || g.build.has('overheat');
    if (heatVisible) {
      const hf = p.heatFrac;
      gr.fillStyle(0x0a0714, 1);
      gr.fillRect(99, GAME_H - 30, 3, 20);
      gr.fillStyle(p.overheated ? (Math.sin(this.t * 20) > 0 ? 0xff5c3a : 0x6a2a1a) : hf > 0.7 ? 0xff8a3c : 0xffd060, 1);
      const h = Math.round(20 * hf);
      gr.fillRect(99, GAME_H - 10 - h, 3, h);
    }

    // ---- boss warning
    if (this.warnT > 0) {
      this.warnT -= dt;
      const on = Math.sin(this.t * 12) > 0;
      this.warnText.setVisible(on);
      for (const yy of [40, 100]) {
        for (let x = -20; x < GAME_W + 20; x += 16) {
          const ox = ((this.t * 60) % 16) * (yy === 40 ? 1 : -1);
          gr.fillStyle(0xff2a4a, 0.5);
          gr.fillTriangle(x + ox, yy, x + ox + 8, yy, x + ox + 4, yy + 6);
        }
      }
    } else this.warnText.setVisible(false);

    // ---- banners
    if (!this.curBanner && this.banners.length) {
      this.curBanner = this.banners.shift()!;
      this.bannerT = 0;
      this.bannerText.setText(this.curBanner.text).setColor(cssHex(this.curBanner.color));
      this.bannerSub.setText(this.curBanner.sub);
    }
    if (this.curBanner) {
      this.bannerT += dt;
      const d = this.curBanner.dur;
      const k = this.bannerT < 0.2 ? this.bannerT / 0.2 : this.bannerT > d - 0.4 ? Math.max(0, (d - this.bannerT) / 0.4) : 1;
      this.bannerText.setVisible(true).setAlpha(k).setScale(this.bannerT < 0.2 ? 2.6 - k * 0.6 : 2);
      this.bannerSub.setVisible(true).setAlpha(k);
      if (k > 0) {
        gr.fillStyle(0x07050d, 0.55 * k);
        gr.fillRect(0, 74, GAME_W, 52);
        gr.fillStyle(this.curBanner.color, 0.8 * k);
        gr.fillRect(Math.round(GAME_W / 2 - 120 * k), 74, Math.round(240 * k), 1);
        gr.fillRect(Math.round(GAME_W / 2 - 120 * k), 125, Math.round(240 * k), 1);
      }
      if (this.bannerT >= d) {
        this.curBanner = null;
        this.bannerText.setVisible(false);
        this.bannerSub.setVisible(false);
      }
    }

    // ---- tutorial / hint
    const tk = g.tutorial.text;
    if (tk) {
      const s = t(tk);
      this.setText(this.tutText, 'tut', s);
      this.tutText.setVisible(true);
      const w = this.tutText.width + 16;
      drawPanel(gr, Math.round(GAME_W / 2 - w / 2), GAME_H - 39, Math.round(w), 18, { fill: 0x0a0714, fillAlpha: 0.8, edge: C.uiCyan, edgeAlpha: 0.6 + Math.sin(this.t * 5) * 0.3, inner: null });
    } else this.tutText.setVisible(false);

    // ---- world-space overlays: elite HP bars + offscreen threat arrows
    const cx = g.cameras.main.scrollX;
    const cy = g.cameras.main.scrollY;

    // ---- rift event: name + countdown, marker over the objective
    const ev = g.director.event;
    if (ev && !b) {
      const left = Math.max(0, Math.ceil(ev.dur - ev.t));
      const col = ev.kind === 'surge' ? 0xff5c7a : ev.kind === 'bounty' ? C.uiGold : ev.kind === 'rain' ? C.uiGood : C.uiCyan;
      this.setText(this.eventText, 'event', t('hud.event', { name: t(`event.${ev.kind}`), s: left }));
      this.eventText.setVisible(true).setColor(cssHex(col)).setAlpha(left <= 5 && Math.sin(this.t * 12) < 0 ? 0.5 : 1);
      const tg = ev.target;
      if (tg && tg.alive && tg.dying <= 0) {
        const sx = clamp(tg.x - cx, 8, GAME_W - 8);
        const sy = clamp(tg.y - tg.hh - cy - 16, 40, GAME_H - 30);
        this.crown.setVisible(true).setPosition(Math.round(sx), Math.round(sy + Math.sin(this.t * 6) * 2)).setFrame(Math.floor(this.t * 6) % 2);
        if (ev.kind === 'supply') this.crown.setTint(0x6ef4ff);
        else this.crown.clearTint();
      } else this.crown.setVisible(false);
    } else {
      this.eventText.setVisible(false);
      this.crown.setVisible(false);
    }
    let ai = 0;
    for (const e of g.enemies) {
      if (!e.alive || e.dying > 0 || e.external) continue;
      const sx = e.x - cx;
      const sy = e.y - cy;
      if ((e.isElite || e.ai === 'rift' || e.ai === 'capsule') && e.hpBarT > 0 && sx > -20 && sx < GAME_W + 20) {
        const w = e.isElite ? 30 : 20;
        const bx = Math.round(sx - w / 2);
        const by = Math.round(sy - e.hh - 10);
        gr.fillStyle(0x0a0714, 0.9);
        gr.fillRect(bx - 1, by - 1, w + 2, 4);
        gr.fillStyle(e.isElite ? 0xffcf4a : e.ai === 'capsule' ? 0x6ef4ff : 0xff3ca0, 1);
        gr.fillRect(bx, by, Math.round(w * clamp(e.hp / e.maxHp, 0, 1)), 2);
        if (e.ward > 0) {
          gr.fillStyle(0xc890ff, 1);
          gr.fillRect(bx, by - 2, Math.round(w * (e.ward / e.wardMax)), 1);
        }
      }
      if (ai < this.arrows.length && (sx < -4 || sx > GAME_W + 4) && Math.abs(sx < 0 ? sx : sx - GAME_W) < 220) {
        const ar = this.arrows[ai++];
        const left = sx < 0;
        const danger = e.ai === 'charger' || e.ai === 'exploder' || e.ai === 'gunner' || e.isElite;
        ar.setVisible(true)
          .setPosition(left ? 5 : GAME_W - 5, clamp(sy, 40, GAME_H - 44))
          .setFlipX(left)
          .setAlpha(0.5 + Math.sin(this.t * 10) * 0.3)
          .setTint(danger ? 0xff5c7a : 0xffc0d0);
      }
    }
    for (; ai < this.arrows.length; ai++) this.arrows[ai].setVisible(false);

    // ---- crosshair
    const ptr = this.input.activePointer;
    let hot = false;
    const wx = ptr.x + cx;
    const wy = ptr.y + cy;
    for (const e of g.enemies) {
      if (e.alive && e.dying <= 0 && e.targetable && Math.abs(e.x - wx) < e.hw + 3 && Math.abs(e.y - wy) < e.hh + 3) {
        hot = true;
        break;
      }
    }
    const firing = p.recoil > 0.5 || p.beamOn;
    this.crosshair.setPosition(Math.round(ptr.x), Math.round(ptr.y)).setFrame(hot ? 1 : 0).setScale(firing ? 1.25 : 1).setVisible(!p.dead);
  }
}
