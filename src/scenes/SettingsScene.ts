import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../core/constants';
import { store, applyAudioSettings } from '../core/app';
import { applyScale, setFullscreen } from '../core/scaling';
import { t } from '../localization/i18n';
import { txt, drawPanel, Button, Slider } from '../ui/ui';
import { C } from '../art/palette';
import { audio } from '../audio/audio';

export class SettingsScene extends Phaser.Scene {
  private from = 'Title';
  private resetStage = 0;

  constructor() {
    super('Settings');
  }

  init(data: { from: string }): void {
    this.from = data.from ?? 'Title';
    this.resetStage = 0;
  }

  create(): void {
    this.scene.bringToTop();
    const s = store.data.settings;
    const g = this.add.graphics();
    g.fillStyle(0x07050d, 0.75);
    g.fillRect(0, 0, GAME_W, GAME_H);
    const pw = 300;
    const ph = 236;
    const px = (GAME_W - pw) / 2;
    const py = (GAME_H - ph) / 2;
    drawPanel(g, px, py, pw, ph, { edge: C.uiEdgeHi });
    txt(this, GAME_W / 2, py + 13, t('set.title'), { font: 'big', ox: 0.5, oy: 0.5 });

    const lx = px + 20;
    const cx = px + 130;
    let y = py + 38;
    const row = (label: string) => {
      txt(this, lx, y, label, { font: 'small', oy: 0.5 });
      const yy = y;
      y += 20;
      return yy;
    };
    const save = () => {
      store.save();
      applyAudioSettings();
    };
    let yy = row(t('set.master'));
    new Slider(this, cx, yy, 110, s.master, (v) => {
      s.master = v;
      save();
    });
    yy = row(t('set.music'));
    new Slider(this, cx, yy, 110, s.music, (v) => {
      s.music = v;
      save();
    });
    yy = row(t('set.sfx'));
    new Slider(this, cx, yy, 110, s.sfx, (v) => {
      s.sfx = v;
      save();
      audio.play('pickup_xp');
    });
    const shakeLabel = () => t(`set.shake${s.shake}`);
    yy = row(t('set.shake'));
    const shakeBtn: Button = new Button(this, cx + 50, yy, shakeLabel(), () => {
      s.shake = (s.shake + 2) % 3;
      shakeBtn.setText(shakeLabel());
      save();
    }, { w: 100, h: 16 });
    const onOff = (v: boolean) => (v ? t('set.on') : t('set.off'));
    yy = row(t('set.dmgnum'));
    const dmgBtn: Button = new Button(this, cx + 50, yy, onOff(s.damageNumbers), () => {
      s.damageNumbers = !s.damageNumbers;
      dmgBtn.setText(onOff(s.damageNumbers));
      save();
    }, { w: 100, h: 16 });
    yy = row(t('set.fullscreen'));
    const fsBtn: Button = new Button(this, cx + 50, yy, onOff(!!document.fullscreenElement), () => {
      const on = !document.fullscreenElement;
      void setFullscreen(on).then(() => {
        s.fullscreen = !!document.fullscreenElement;
        fsBtn.setText(onOff(s.fullscreen));
        save();
      });
    }, { w: 100, h: 16 });
    yy = row(t('set.intscale'));
    const intBtn: Button = new Button(this, cx + 50, yy, onOff(s.integerScale), () => {
      s.integerScale = !s.integerScale;
      intBtn.setText(onOff(s.integerScale));
      save();
      applyScale(this.game);
    }, { w: 100, h: 16 });

    if (this.from === 'Title') {
      const tip = txt(this, GAME_W / 2, py + ph - 48, '', { font: 'small', ox: 0.5, color: C.uiBad });
      new Button(this, GAME_W / 2, py + ph - 60, t('set.reset'), () => {
        if (this.resetStage === 0) {
          this.resetStage = 1;
          tip.setText(t('set.resetConfirm'));
          audio.play('ui_error');
        } else {
          store.reset();
          applyAudioSettings();
          tip.setText(t('set.resetDone'));
          this.resetStage = 0;
        }
      }, { w: 110, h: 16, color: C.uiBad });
    }
    new Button(this, GAME_W / 2, py + ph - 20, t('set.back'), () => this.back(), { w: 110, h: 18, edge: C.uiCyan });
    this.input.keyboard?.on('keydown-ESC', () => this.back());
  }

  private back(): void {
    store.save();
    this.scene.stop();
    if (this.from === 'Title') {
      // reset may have changed stats shown on the title
      this.scene.get('Title').scene.restart();
    } else this.scene.resume(this.from);
  }
}
