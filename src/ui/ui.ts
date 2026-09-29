// Pixel UI helpers: text, panels, buttons, sliders. Everything is drawn at
// the logical 480x270 resolution so it scales with the game crisply.

import Phaser from 'phaser';
import { FONT, FONT_PX, type FontKind } from '../core/constants';
import { cssHex } from '../art/pixel';
import { C } from '../art/palette';
import { audio } from '../audio/audio';

export interface TextOpts {
  font?: FontKind;
  color?: number;
  align?: 'left' | 'center' | 'right';
  shadow?: boolean | number;
  wrap?: number;
  ox?: number;
  oy?: number;
  depth?: number;
  lineSpacing?: number;
  bold?: boolean;
}

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const font = o.font ?? 'small';
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONT[font],
    fontSize: `${FONT_PX[font]}px`,
    color: cssHex(o.color ?? C.uiText),
    align: o.align ?? 'left',
    fontStyle: o.bold ? 'bold' : 'normal',
  };
  if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
  const t = scene.add.text(Math.round(x), Math.round(y), s, style);
  t.setResolution(1);
  if (o.lineSpacing !== undefined) t.setLineSpacing(o.lineSpacing);
  const sh = o.shadow ?? true;
  if (sh !== false) t.setShadow(1, 1, cssHex(typeof sh === 'number' ? sh : C.ink), 0, false, true);
  t.setOrigin(o.ox ?? 0, o.oy ?? 0);
  if (o.depth !== undefined) t.setDepth(o.depth);
  return t;
}

export interface PanelStyle {
  fill?: number;
  fillAlpha?: number;
  edge?: number;
  edgeAlpha?: number;
  inner?: number | null;
  thick?: number;
}

/** Draw a bevelled pixel panel with clipped corners. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, st: PanelStyle = {}): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const fill = st.fill ?? C.uiPanel;
  const edge = st.edge ?? C.uiEdge;
  const th = st.thick ?? 1;
  g.fillStyle(fill, st.fillAlpha ?? 0.94);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(edge, st.edgeAlpha ?? 1);
  g.fillRect(x + 1, y, w - 2, th);
  g.fillRect(x + 1, y + h - th, w - 2, th);
  g.fillRect(x, y + 1, th, h - 2);
  g.fillRect(x + w - th, y + 1, th, h - 2);
  if (st.inner !== null) {
    g.fillStyle(st.inner ?? C.uiPanel2, 1);
    g.fillRect(x + th + 1, y + th, w - th * 2 - 2, 1);
  }
}

export interface ButtonOpts {
  w?: number;
  h?: number;
  font?: FontKind;
  color?: number;
  edge?: number;
  fill?: number;
  hotkey?: string;
  depth?: number;
  disabled?: boolean;
}

export class Button extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  private bw: number;
  private bh: number;
  private hover = false;
  private opts: ButtonOpts;
  private onClick: () => void;
  disabled = false;
  selected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOpts = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.opts = opts;
    this.onClick = onClick;
    this.bw = opts.w ?? 120;
    this.bh = opts.h ?? 18;
    this.disabled = !!opts.disabled;
    this.g = scene.add.graphics();
    this.label = txt(scene, 0, 0, text, { font: opts.font ?? 'small', color: opts.color ?? C.uiText, ox: 0.5, oy: 0.5 });
    this.add([this.g, this.label]);
    this.setSize(this.bw, this.bh);
    this.setInteractive({ useHandCursor: false });
    this.on('pointerover', () => {
      if (this.disabled) return;
      this.hover = true;
      audio.play('ui_hover');
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hover = false;
      this.redraw();
    });
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      this.press();
    });
    if (opts.depth !== undefined) this.setDepth(opts.depth);
    this.redraw();
    scene.add.existing(this);
  }

  press(): void {
    if (this.disabled) {
      audio.play('ui_error');
      return;
    }
    audio.play('ui_select');
    this.scene.tweens.add({ targets: this, scaleX: 0.94, scaleY: 0.94, duration: 50, yoyo: true });
    this.onClick();
  }

  setText(s: string): this {
    this.label.setText(s);
    return this;
  }

  setDisabled(d: boolean): this {
    this.disabled = d;
    this.redraw();
    return this;
  }

  setSelected(s: boolean): this {
    this.selected = s;
    this.redraw();
    return this;
  }

  redraw(): void {
    const g = this.g;
    g.clear();
    const hot = this.hover && !this.disabled;
    const edge = this.disabled ? 0x3a3050 : this.selected ? C.uiGold : hot ? C.uiEdgeHi : (this.opts.edge ?? C.uiEdge);
    drawPanel(g, -this.bw / 2, -this.bh / 2, this.bw, this.bh, {
      fill: hot ? C.uiPanel2 : (this.opts.fill ?? C.uiPanel),
      edge,
      inner: hot ? 0x3a2e60 : C.uiPanel2,
    });
    if (hot) {
      g.fillStyle(C.uiCyan, 1);
      g.fillRect(Math.round(-this.bw / 2) + 3, Math.round(-1), 2, 3);
    }
    this.label.setColor(cssHex(this.disabled ? 0x5a5078 : (this.opts.color ?? C.uiText)));
  }
}

export class Slider extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private valText: Phaser.GameObjects.Text;
  value: number;
  private sw: number;
  private onChange: (v: number) => void;
  private dragging = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, value: number, onChange: (v: number) => void) {
    super(scene, Math.round(x), Math.round(y));
    this.sw = w;
    this.value = value;
    this.onChange = onChange;
    this.g = scene.add.graphics();
    this.valText = txt(scene, w + 8, 0, '', { font: 'small', oy: 0.5 });
    this.add([this.g, this.valText]);
    const zone = scene.add.zone(Math.round(x) + w / 2, Math.round(y), w + 10, 14).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.setFrom(p);
    });
    this.once('destroy', () => zone.destroy());
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.setFrom(p);
    });
    scene.input.on('pointerup', () => {
      if (this.dragging) audio.play('ui_hover');
      this.dragging = false;
    });
    this.redraw();
    scene.add.existing(this);
  }

  private setFrom(p: Phaser.Input.Pointer): void {
    const lx = p.x - this.x;
    const v = Math.max(0, Math.min(1, Math.round((lx / this.sw) * 20) / 20));
    if (v !== this.value) {
      this.value = v;
      this.onChange(v);
      this.redraw();
    }
  }

  redraw(): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x0a0714, 1);
    g.fillRect(0, -2, this.sw, 4);
    g.fillStyle(C.uiEdge, 1);
    g.fillRect(0, -2, this.sw, 1);
    g.fillStyle(C.uiCyan, 1);
    g.fillRect(0, -1, Math.round(this.sw * this.value), 2);
    const kx = Math.round(this.sw * this.value);
    g.fillStyle(C.ink, 1);
    g.fillRect(kx - 3, -5, 6, 10);
    g.fillStyle(0xffffff, 1);
    g.fillRect(kx - 2, -4, 4, 8);
    this.valText.setText(`${Math.round(this.value * 100)}%`);
  }
}

/** Icon sprite from the icon sheet. */
export function icon(scene: Phaser.Scene, x: number, y: number, name: string, index: Record<string, number>): Phaser.GameObjects.Image {
  const i = index[name] ?? index.lock ?? 0;
  return scene.add.image(Math.round(x), Math.round(y), 'icons', i);
}
