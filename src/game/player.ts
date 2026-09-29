// Sera: movement, dash, weapons and the layered pixel puppet.

import Phaser from 'phaser';
import { ARENA_W, DEPTH, GROUND_Y } from '../core/constants';
import { approach, clamp } from '../core/mathx';
import { rand } from '../core/rng';
import { PLAYER, PERFECT_DODGE, multishotShare } from '../data/balance';
import { audio } from '../audio/audio';
import { t } from '../localization/i18n';
import {
  HERO_ANCHORS,
  HERO_ANIM,
  HERO_FH,
  HERO_FW,
  HERO_ORIGIN,
  HEAD_FRAME,
  HEAD_H,
  HEAD_HAIR_ROOT,
  HEAD_NECK,
  HEAD_W,
  ARM_H,
  ARM_PIVOT,
  ARM_W,
  GUN_MUZZLE,
} from '../art/heroine';
import { C } from '../art/palette';
import { Rope } from './verlet';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './enemy';

export interface Intent {
  move: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
  fire: boolean;
  skill1: boolean;
  skill2: boolean;
  aimX: number;
  aimY: number;
}

type AnimName = keyof typeof HERO_ANIM;

export class Player {
  g: GameScene;
  x = 240;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  grounded = true;
  coyote = 0;
  jumpBuf = 0;

  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  barrierUp = false;
  barrierT = 0;

  dashCharges = 1;
  dashRecharge = 0;
  dashT = 0;
  dashDir: 1 | -1 = 1;
  dashIframes = 0;
  airDashUsed = false;
  perfectUsed = false;
  private dashHit: number[] = [];

  iframes = 0;
  hurtT = 0;
  landT = 0;
  skillPoseT = 0;

  aimX = 300;
  aimY = 150;
  aimAng = 0;
  fireCd = 0;
  heat = 0;
  overheated = false;
  beamOn = false;
  beamTime = 0;
  private beamTickT = 0;
  recoil = 0;
  recoilRot = 0;

  dead = false;
  deadT = 0;
  victory = false;
  dmgBuffT = 0;
  dmgBuffMul = 0;
  overdriveT = 0;
  odExtended = 0;
  sgSlam = false;
  phantomT = 0;
  phantomX = 0;
  phantomY = 0;
  phantomFacing: 1 | -1 = 1;
  reviveAvailable = false;

  // puppet
  body: Phaser.GameObjects.Sprite;
  head: Phaser.GameObjects.Sprite;
  arm: Phaser.GameObjects.Sprite;
  private back: Phaser.GameObjects.Graphics;
  private aura: Phaser.GameObjects.Graphics;
  private ghostBody: Phaser.GameObjects.Sprite;
  private ghostHead: Phaser.GameObjects.Sprite;
  private ghostArm: Phaser.GameObjects.Sprite;
  private pony: Rope;
  private scarfA: Rope;
  private scarfB: Rope;
  private anim: AnimName = 'idle';
  private animT = 0;
  frame = 0;
  private blinkT = 3;
  private blinkHold = 0;
  private afterT = 0;
  tilt = 0;
  private stepT = 0;

  constructor(g: GameScene, x: number) {
    this.g = g;
    this.x = x;
    this.back = g.add.graphics().setDepth(DEPTH.PLAYER_BACK);
    this.body = g.add.sprite(x, GROUND_Y, 'hero_body', 0).setDepth(DEPTH.PLAYER).setOrigin(HERO_ORIGIN.x / HERO_FW, HERO_ORIGIN.y / HERO_FH);
    this.head = g.add.sprite(x, GROUND_Y, 'hero_head', 0).setDepth(DEPTH.PLAYER_HEAD).setOrigin(HEAD_NECK.x / HEAD_W, HEAD_NECK.y / HEAD_H);
    this.arm = g.add.sprite(x, GROUND_Y, `arm_${g.build.weapon.id}`, 0).setDepth(DEPTH.PLAYER_FRONT).setOrigin(ARM_PIVOT.x / ARM_W, ARM_PIVOT.y / ARM_H);
    this.aura = g.add.graphics().setDepth(DEPTH.PLAYER_FRONT + 0.5);
    this.ghostBody = g.add.sprite(0, 0, 'hero_body', 0).setVisible(false).setDepth(DEPTH.PLAYER - 2).setOrigin(HERO_ORIGIN.x / HERO_FW, HERO_ORIGIN.y / HERO_FH);
    this.ghostHead = g.add.sprite(0, 0, 'hero_head', 0).setVisible(false).setDepth(DEPTH.PLAYER - 2).setOrigin(HEAD_NECK.x / HEAD_W, HEAD_NECK.y / HEAD_H);
    this.ghostArm = g.add.sprite(0, 0, `arm_${g.build.weapon.id}`, 0).setVisible(false).setDepth(DEPTH.PLAYER - 2).setOrigin(ARM_PIVOT.x / ARM_W, ARM_PIVOT.y / ARM_H);
    for (const s of [this.ghostBody, this.ghostHead, this.ghostArm]) s.setTintFill(0x6ef4ff).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    this.pony = new Rope(6, 3.2, x, GROUND_Y - 50);
    this.scarfA = new Rope(6, 3, x, GROUND_Y - 30);
    this.scarfB = new Rope(5, 3, x, GROUND_Y - 30);
  }

  get heatFrac(): number {
    return clamp(this.heat / 100, 0, 1);
  }

  get dashCooldown(): number {
    return PLAYER.dashCooldown * this.g.build.dashCdMul;
  }

  get invulnerable(): boolean {
    return this.dashIframes > 0 || this.iframes > 0;
  }

  get centerY(): number {
    return this.y - 26;
  }

  /** World position of an anchor from the current body frame. */
  private anchor(ax: number, ay: number): { x: number; y: number } {
    let dx = (ax - HERO_ORIGIN.x) * this.facing;
    let dy = ay - HERO_ORIGIN.y;
    if (this.tilt !== 0) {
      const c = Math.cos(this.tilt);
      const s = Math.sin(this.tilt);
      const rx = dx * c - dy * s;
      const ry = dx * s + dy * c;
      dx = rx;
      dy = ry;
    }
    return { x: this.x + dx, y: this.y + dy };
  }

  shoulder(): { x: number; y: number } {
    const a = HERO_ANCHORS[this.frame] ?? HERO_ANCHORS[0];
    return this.anchor(a.shoulder.x, a.shoulder.y);
  }

  muzzle(): { x: number; y: number } {
    const s = this.shoulder();
    const d = GUN_MUZZLE[this.g.build.weapon.id] - this.recoil;
    return { x: s.x + Math.cos(this.aimAng) * d, y: s.y + Math.sin(this.aimAng) * d };
  }

  resetForZone(x: number): void {
    this.x = x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.dashT = 0;
    this.pony.reset(x, GROUND_Y - 50, this.facing);
    this.scarfA.reset(x, GROUND_Y - 30, this.facing);
    this.scarfB.reset(x, GROUND_Y - 30, this.facing);
  }

  heal(n: number): void {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.hp > before) {
      this.g.fx.glow(this.x, this.y - 24, 10, 0xff8aa0, 50, 0.5);
      this.g.fx.text(this.x, this.y - 52, `+${this.hp - before}`, 0xff8aa0, 'small', 0.7);
      this.g.hudPulse('hp');
    }
  }

  // ------------------------------------------------------------------ update
  update(dt: number, it: Intent): void {
    const g = this.g;
    const b = g.build;
    this.animT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.dashIframes = Math.max(0, this.dashIframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.skillPoseT = Math.max(0, this.skillPoseT - dt);
    this.dmgBuffT = Math.max(0, this.dmgBuffT - dt);
    this.overdriveT = Math.max(0, this.overdriveT - dt);
    this.phantomT = Math.max(0, this.phantomT - dt);
    this.fireCd -= dt;
    this.recoil *= Math.exp(-dt * 22);
    this.recoilRot *= Math.exp(-dt * 18);

    if (this.dead) {
      this.deadT += dt;
      this.vx *= Math.exp(-dt * 6);
      this.vy += PLAYER.gravity * dt;
      this.x += this.vx * dt;
      this.y = Math.min(GROUND_Y, this.y + this.vy * dt);
      if (this.y >= GROUND_Y) this.vy = 0;
      this.stopBeam();
      return;
    }

    // ---- aim
    const sh = this.shoulder();
    this.aimX = it.aimX;
    this.aimY = it.aimY;
    this.aimAng = Math.atan2(it.aimY - sh.y, it.aimX - sh.x);
    if (this.dashT <= 0) this.facing = it.aimX >= this.x ? 1 : -1;

    // ---- dash charges
    if (this.dashCharges < b.dashCharges) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) {
        this.dashCharges++;
        this.dashRecharge = this.dashCharges < b.dashCharges ? this.dashCooldown : 0;
      }
    }
    if (it.dashPressed && this.dashCharges > 0 && this.dashT <= 0 && (this.grounded || !this.airDashUsed)) this.startDash(it.move);

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDir * PLAYER.dashSpeed;
      this.vy = 0;
      this.afterT -= dt;
      if (this.afterT <= 0) {
        this.afterT = 0.022;
        this.ghostTrail();
      }
      if (b.lv('dash_strike') > 0) this.dashStrike();
      if (this.dashT <= 0) this.endDash();
    } else {
      let speed = PLAYER.speed;
      if (b.has('overheat')) speed *= 1 - 0.3 * this.heatFrac;
      if (this.overdriveT > 0) speed *= 1.15;
      const target = it.move * speed;
      let accel: number;
      if (this.grounded) {
        if (it.move !== 0) accel = Math.sign(this.vx) !== it.move && this.vx !== 0 ? PLAYER.accelGround * 1.8 : PLAYER.accelGround;
        else accel = PLAYER.decelGround;
      } else accel = it.move !== 0 ? PLAYER.accelAir : PLAYER.decelAir;
      this.vx = approach(this.vx, target, accel * dt);

      let grav = PLAYER.gravity;
      if (this.vy < 0 && it.jumpHeld) grav *= 0.62;
      else if (this.vy < 0 && !it.jumpHeld) grav *= 1.7;
      this.vy = Math.min(520, this.vy + grav * dt);

      if (it.jumpPressed) this.jumpBuf = PLAYER.jumpBuffer;
      else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
        this.vy = -PLAYER.jumpVel;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuf = 0;
        audio.play('jump');
        g.fx.dust(this.x, GROUND_Y, 4);
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y) {
      if (!this.grounded) this.onLand();
      this.y = GROUND_Y;
      this.vy = 0;
      this.grounded = true;
      this.airDashUsed = false;
      this.coyote = PLAYER.coyote;
    } else {
      if (this.grounded && this.vy >= 0) this.coyote = PLAYER.coyote;
      this.grounded = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
    this.x = clamp(this.x, 12, ARENA_W - 12);

    // footsteps dust
    if (this.grounded && Math.abs(this.vx) > 60 && this.dashT <= 0) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.18;
        g.fx.dust(this.x - Math.sign(this.vx) * 4, GROUND_Y, 1, Math.sign(this.vx));
      }
    }

    // ---- weapon
    this.updateWeapon(dt, it.fire && !g.fireBlocked);

    // ---- skills
    if (it.skill1) g.skills.cast(0);
    if (it.skill2) g.skills.cast(1);

    // ---- barrier
    if (b.barrierCooldown > 0 && !this.barrierUp) {
      this.barrierT -= dt;
      if (this.barrierT <= 0) {
        this.barrierUp = true;
        g.fx.ring(this.x, this.centerY, 6, 22, 0.3, 0x6ef4ff, 1);
        audio.play('shield_block', { vol: 0.4, pitch: 1.4 });
      }
    }
  }

  private onLand(): void {
    const g = this.g;
    if (this.vy > 180) {
      this.landT = 0.09;
      audio.play('land', { vol: Math.min(1, this.vy / 400) });
      g.fx.dust(this.x, GROUND_Y, 5);
    }
    if (this.sgSlam) {
      this.sgSlam = false;
      g.fx.ring(this.x, GROUND_Y - 4, 6, 56, 0.3, 0xffa040, 2);
      g.combat.explode(this.x, GROUND_Y - 8, 50, 34, 'skill');
      g.cam.shake(0.25);
    }
  }

  private startDash(move: number): void {
    const g = this.g;
    const dir: 1 | -1 = move !== 0 ? (move > 0 ? 1 : -1) : this.facing;
    this.dashDir = dir;
    this.dashT = PLAYER.dashTime;
    this.dashIframes = PLAYER.dashIframes;
    this.dashCharges--;
    if (this.dashRecharge <= 0) this.dashRecharge = this.dashCooldown;
    if (!this.grounded) this.airDashUsed = true;
    this.vy = 0;
    this.perfectUsed = false;
    this.dashHit.length = 0;
    this.afterT = 0;
    audio.play('dash');
    g.fx.dust(this.x, GROUND_Y, this.grounded ? 6 : 0, dir);
    g.fx.ring(this.x - dir * 6, this.centerY, 2, 16, 0.18, 0x6ef4ff, 1);
    g.cam.kick(dir * 2, 0);
    if (g.build.has('f_phantom')) {
      this.phantomT = 2;
      this.phantomX = this.x;
      this.phantomY = this.y;
      this.phantomFacing = this.facing;
    }
  }

  private endDash(): void {
    const g = this.g;
    this.vx = this.dashDir * PLAYER.speed * 1.1;
    const n = g.build.dashStrikeMissiles;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.45;
      g.shots.spawn('homing', this.x, this.centerY, a, 240, 10, { life: 1.2, r: 3, homing: 7 });
    }
    if (n > 0) audio.play('missile', { pitch: 1.5, vol: 0.6 });
  }

  private dashStrike(): void {
    const g = this.g;
    const dmg = g.build.dashStrikeDmg;
    for (const e of g.enemies) {
      if (!e.alive || e.dying > 0 || !e.targetable || this.dashHit.includes(e.uid)) continue;
      if (Math.abs(e.x - this.x) < e.hw + 10 && Math.abs(e.y - this.centerY) < e.hh + 18) {
        this.dashHit.push(e.uid);
        g.combat.damage(e, dmg, { source: 'dash', canCrit: true, knockX: this.dashDir * 80 });
        g.fx.line([e.x - 12, e.y + 8, e.x + 12, e.y - 8], 0xffffff, 2, 0.12, 0xffffff);
      }
    }
  }

  private ghostTrail(): void {
    const g = this.g;
    g.fx.afterimage('hero_body', this.frame, this.x, this.y, this.facing < 0, HERO_ORIGIN.x / HERO_FW, HERO_ORIGIN.y / HERO_FH, 0x6ef4ff, 0.55, 0.2);
    const hp = this.headPos();
    g.fx.afterimage('hero_head', 0, hp.x, hp.y, this.facing < 0, HEAD_NECK.x / HEAD_W, HEAD_NECK.y / HEAD_H, 0x6ef4ff, 0.55, 0.2);
  }

  private headPos(): { x: number; y: number } {
    const a = HERO_ANCHORS[this.frame] ?? HERO_ANCHORS[0];
    return this.anchor(a.head.x, a.head.y);
  }

  // ------------------------------------------------------------------ weapons
  private updateWeapon(dt: number, firing: boolean): void {
    const g = this.g;
    const w = g.build.weapon;
    if (w.mode === 'beam') {
      this.updateBeam(dt, firing);
      return;
    }
    if (g.build.has('overheat')) this.heat = clamp(this.heat + (firing ? 40 : -65) * dt, 0, 100);
    if (!firing) {
      if (this.fireCd < 0) this.fireCd = 0;
      return;
    }
    if (this.fireCd > 0) return;
    const rate = w.fireRate * (this.overdriveT > 0 ? 1.7 : 1) * g.build.fireRateMul;
    this.fireCd = Math.max(this.fireCd, -dt) + 1 / rate;
    this.shoot(false);
    if (this.phantomT > 0) this.shoot(true);
  }

  private shoot(phantom: boolean): void {
    const g = this.g;
    const b = g.build;
    const w = b.weapon;
    let origin = this.muzzle();
    let ang = this.aimAng;
    let dmgMul = 1;
    if (phantom) {
      const sx = this.phantomX + (this.shoulder().x - this.x);
      const sy = this.phantomY + (this.shoulder().y - this.y);
      ang = Math.atan2(this.aimY - sy, this.aimX - sx);
      origin = { x: sx + Math.cos(ang) * GUN_MUZZLE[w.id], y: sy + Math.sin(ang) * GUN_MUZZLE[w.id] };
      dmgMul = 0.5;
    }
    const mx = origin.x;
    const my = Math.min(origin.y, GROUND_Y - 3);
    const od = this.overdriveT > 0;
    if (w.mode === 'projectile') {
      const count = w.projectiles + b.extraProjectiles + (od ? Math.max(1, w.multishotAdd) : 0);
      const big = b.bigShot;
      const pierce = b.pierce + (od && b.has('sk_od_plus') ? 1 : 0);
      // Awakened SMG fires two parallel streams (55% damage each).
      const streams = b.awakened && w.id === 'smg' ? 2 : 1;
      if (streams > 1) dmgMul *= 0.55;
      // Extra bullets share the load (shotgun pellets excluded): 2 → 80%, 3 → 73%, 4 → 70% each.
      if (w.id !== 'shotgun' && count > 1) dmgMul *= multishotShare(count);
      for (let s = 0; s < streams; s++) {
        const off = streams > 1 ? (s === 0 ? -3 : 3) : 0;
        const ox = -Math.sin(ang) * off;
        const oy = Math.cos(ang) * off;
        for (let i = 0; i < count; i++) {
          let a: number;
          if (w.id === 'shotgun') {
            const cone = w.spread * (1 + 0.07 * (count - w.projectiles));
            a = ang + rand(-cone / 2, cone / 2);
          } else {
            a = ang + (i - (count - 1) / 2) * 0.075 + rand(-w.spread / 2, w.spread / 2);
          }
          const speed = w.speed + rand(-w.speedJitter, w.speedJitter);
          g.shots.spawn(phantom ? 'phantom' : 'main', mx + ox, my + oy, a, speed, w.damage * dmgMul * (1 + 0.2 * big), {
            life: w.life * rand(0.9, 1.1),
            r: w.radius + big * 1.5,
            pierce,
            bounces: b.bounces,
            canSplit: b.splitCount > 0 && !phantom,
            homing: b.has('smg_tracer') ? 5 : 0,
            knock: w.knockback * (1 + 0.5 * big),
            tex: w.shotTex,
            scale: 1 + big * 0.5,
          });
        }
      }
    } else {
      const lines = 1 + b.extraProjectiles + (od ? 1 : 0);
      const lineDmg = w.damage * dmgMul * multishotShare(lines);
      for (let i = 0; i < lines; i++) g.combat.railShot(mx, my, ang + (i - (lines - 1) / 2) * 0.07, lineDmg, phantom);
    }
    if (phantom) return;

    // ---- feel
    this.recoil = w.recoil;
    this.recoilRot = 0.045 * w.recoil;
    const flashScale = w.id === 'shotgun' ? 1 : 1;
    const frames = w.muzzleTex === 'muzzle_beam' ? 2 : 3;
    g.fx.anim(w.muzzleTex, mx, my, frames, 40, { rot: ang, add: true, depth: DEPTH.PLAYER_FRONT + 1, scale: flashScale });
    if (w.shellEject) {
      const sh = this.shoulder();
      g.fx.shell(sh.x + Math.cos(ang) * 14, sh.y + Math.sin(ang) * 14 - 2, this.facing);
      if (w.id === 'shotgun') audio.play('shell', { vol: 0.6 });
    }
    audio.play(w.sfx, { vary: w.id === 'smg' ? 0.08 : 0.04, vol: w.id === 'smg' ? 0.55 : 0.9 });
    g.cam.kick(-Math.cos(ang) * w.kick, -Math.sin(ang) * w.kick);
    if (w.shake > 0) g.cam.shake(w.shake);
    if (w.selfPush > 0) {
      if (this.grounded) this.vx -= Math.cos(ang) * w.selfPush;
      else this.vx -= Math.cos(ang) * w.selfPush * 0.6;
    }
    if (w.id === 'shotgun' && !this.grounded && g.build.has('sg_recoil') && Math.sin(ang) > 0.5) {
      this.vy = -330;
      this.sgSlam = true;
      g.fx.ring(mx, my, 2, 18, 0.2, 0xffa040, 1);
    }
    if (w.id === 'rail') g.cam.punch(0.015);
  }

  private updateBeam(dt: number, firing: boolean): void {
    const g = this.g;
    const w = g.build.weapon;
    if (this.overheated) {
      this.heat -= w.coolPerSec * 0.8 * dt;
      if (Math.random() < 0.4) {
        const m = this.muzzle();
        g.fx.p(m.x, m.y, rand(-8, 8), -rand(20, 40), 0.5, 0x8a8098, { size: 2, drag: 1 });
      }
      if (this.heat <= 40) this.overheated = false;
      this.stopBeam();
      g.beamFx.active = false;
      return;
    }
    if (!firing) {
      this.stopBeam();
      this.heat = Math.max(0, this.heat - w.coolPerSec * dt);
      g.beamFx.active = false;
      return;
    }
    if (!this.beamOn) {
      this.beamOn = true;
      this.beamTime = 0;
      this.beamTickT = 0;
      audio.play('beam_start');
      audio.startLoop('beam_loop', 0.3);
    }
    this.beamTime += dt;
    const sun = g.build.awakened;
    this.heat += w.heatPerSec * dt * (sun ? 0.6 : 1);
    if (this.heat >= 100) {
      this.heat = 100;
      this.overheated = true;
      this.stopBeam();
      audio.play('beam_overheat');
      g.fx.text(this.x, this.y - 58, t('hud.overheat'), 0xff8a3c, 'small', 0.8);
      g.beamFx.active = false;
      return;
    }
    const ramp = 1 + Math.min(1, this.beamTime / 2);
    this.beamTickT -= dt;
    const doDamage = this.beamTickT <= 0;
    if (doDamage) this.beamTickT += 1 / (w.tickRate * g.build.fireRateMul);
    const m = this.muzzle();
    const mul = (this.overdriveT > 0 ? 1.5 : 1) * (sun ? 1.5 : 1);
    const res = g.combat.beamTick(m.x, Math.min(m.y, GROUND_Y - 3), this.aimAng, w.damage * ramp * mul, doDamage);
    g.beamFx.active = true;
    g.beamFx.x0 = m.x;
    g.beamFx.y0 = Math.min(m.y, GROUND_Y - 3);
    g.beamFx.x1 = res.x;
    g.beamFx.y1 = res.y;
    g.beamFx.power = ramp * mul * (sun ? 1.4 : 1);
    g.beamFx.hit = res.hitAny;
    this.recoil = 1 + Math.random();
    audio.setLoopPitch('beam_loop', 1 + (ramp - 1) * 0.35);
    if (this.phantomT > 0 && doDamage) {
      const sx = this.phantomX + (this.shoulder().x - this.x);
      const sy = this.phantomY + (this.shoulder().y - this.y);
      const a = Math.atan2(this.aimY - sy, this.aimX - sx);
      const r2 = g.combat.beamTick(sx, sy, a, w.damage * ramp * 0.5, true);
      g.fx.line([sx, sy, r2.x, r2.y], 0x6ef4ff, 1, 0.08);
    }
    if (doDamage) g.cam.kick(-Math.cos(this.aimAng) * w.kick, -Math.sin(this.aimAng) * w.kick);
  }

  stopBeam(): void {
    if (this.beamOn) {
      this.beamOn = false;
      this.beamTime = 0;
      audio.stopLoop('beam_loop');
    }
  }

  // ------------------------------------------------------------------ damage
  hurt(dmg: number, fromX: number, src = '?'): boolean {
    const g = this.g;
    if (this.dead || this.victory || g.god) return false;
    if (this.dashIframes > 0) {
      if (!this.perfectUsed) this.perfectDodge();
      return false;
    }
    if (this.iframes > 0) return false;
    if (this.barrierUp) {
      this.barrierUp = false;
      this.barrierT = g.build.barrierCooldown;
      this.iframes = 0.6;
      g.fx.ring(this.x, this.centerY, 8, 30, 0.3, 0x6ef4ff, 2);
      g.fx.sparks(this.x, this.centerY, 12, [0x6ef4ff, 0xffffff], 140);
      audio.play('shield_block');
      g.hitstop(40);
      return true;
    }
    this.hp -= dmg;
    this.iframes = PLAYER.hurtIframes;
    this.hurtT = 0.28;
    const dir = Math.sign(this.x - fromX) || -this.facing;
    this.vx = dir * 170;
    this.vy = -150;
    this.grounded = false;
    this.dashT = 0;
    g.onPlayerHurt(dmg, src);
    if (this.hp <= 0) {
      if (this.reviveAvailable) {
        this.reviveAvailable = false;
        this.hp = 2;
        this.iframes = 2.5;
        g.onRevive();
      } else this.die();
    }
    return true;
  }

  private perfectDodge(): void {
    const g = this.g;
    this.perfectUsed = true;
    const adr = g.build.has('adrenaline');
    this.dmgBuffMul = adr ? PERFECT_DODGE.adrenalineDmg : PERFECT_DODGE.buffDmg;
    this.dmgBuffT = adr ? PERFECT_DODGE.adrenalineTime : PERFECT_DODGE.buffTime;
    if (adr) this.dashCharges = g.build.dashCharges;
    g.slowmo(PERFECT_DODGE.slowScale, PERFECT_DODGE.slowTime);
    g.fx.text(this.x, this.y - 58, t('banner.perfect'), 0x6ef4ff, 'body', 0.9);
    g.fx.ring(this.x, this.centerY, 4, 40, 0.35, 0x6ef4ff, 2);
    audio.play('perfect');
    g.run.perfectDodges++;
  }

  private die(): void {
    const g = this.g;
    this.dead = true;
    this.deadT = 0;
    this.hp = 0;
    this.stopBeam();
    g.onPlayerDeath();
  }

  // ------------------------------------------------------------------ render
  render(dt: number): void {
    const g = this.g;
    // animation state
    let anim: AnimName = 'idle';
    let fps = 6;
    if (this.dead) {
      anim = this.deadT < 0.35 ? 'hit' : 'kneel';
      const ft = clamp((this.deadT - 0.9) / 0.35, 0, 1);
      const bounce = ft >= 1 ? Math.sin(Math.min(1, (this.deadT - 1.25) / 0.25) * Math.PI) * 0.08 : 0;
      this.tilt = -this.facing * (ft * ft * 1.45 - bounce);
    } else if (this.victory) anim = 'victory';
    else if (this.hurtT > 0) anim = 'hit';
    else if (this.dashT > 0) anim = 'dash';
    else if (this.skillPoseT > 0) anim = 'skill';
    else if (!this.grounded) anim = this.vy < 0 ? 'jump' : 'fall';
    else if (this.landT > 0) anim = 'land';
    else if (Math.abs(this.vx) > 22) {
      anim = 'run';
      fps = 7 + Math.abs(this.vx) / 16;
    }
    if (!this.dead) this.tilt = this.dashT > 0 ? this.dashDir * 0.06 : 0;
    if (anim !== this.anim) {
      this.anim = anim;
      this.animT = 0;
    }
    const frames = HERO_ANIM[anim];
    let fi = Math.floor(this.animT * fps) % frames.length;
    // backpedal: run cycle plays backwards when moving away from the aim
    if (anim === 'run' && Math.sign(this.vx) !== this.facing) fi = frames.length - 1 - fi;
    this.frame = frames[fi];

    const flip = this.facing < 0;
    const blink = !this.dead && this.iframes > 0 && this.dashIframes <= 0 && Math.floor(this.iframes * 16) % 2 === 0;
    const alpha = blink ? 0.35 : 1;

    this.body.setFrame(this.frame).setFlipX(flip).setPosition(Math.round(this.x), Math.round(this.y)).setRotation(this.tilt).setAlpha(alpha);

    // head expression
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkHold = 0.12;
      this.blinkT = rand(2, 5);
    }
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    let hf = HEAD_FRAME.normal;
    if (this.dead || this.hurtT > 0) hf = HEAD_FRAME.hurt;
    else if (this.victory) hf = HEAD_FRAME.happy;
    else if (this.skillPoseT > 0 || this.overdriveT > 0 || this.dmgBuffT > 0) hf = HEAD_FRAME.focus;
    else if (this.blinkHold > 0) hf = HEAD_FRAME.blink;
    const hp = this.headPos();
    // look slightly toward the aim
    const lookY = this.dead ? 0 : Math.round(clamp(Math.sin(this.aimAng) * 1.5, -1, 1));
    this.head.setFrame(hf).setFlipX(flip).setPosition(Math.round(hp.x), Math.round(hp.y + lookY)).setRotation(this.tilt).setAlpha(alpha);

    // gun arm
    const sh = this.shoulder();
    const ra = this.aimAng;
    this.arm.setTexture(`arm_${g.build.weapon.id}`);
    this.arm
      .setPosition(Math.round(sh.x - Math.cos(ra) * this.recoil), Math.round(sh.y - Math.sin(ra) * this.recoil))
      .setRotation(ra - this.recoilRot * this.facing)
      .setFlipY(flip)
      .setAlpha(alpha)
      .setVisible(!this.dead || this.deadT < 0.4);

    // secondary motion: ponytail + scarf
    const hr = this.anchor(
      (HERO_ANCHORS[this.frame] ?? HERO_ANCHORS[0]).head.x + (HEAD_HAIR_ROOT.x - HEAD_NECK.x),
      (HERO_ANCHORS[this.frame] ?? HERO_ANCHORS[0]).head.y + (HEAD_HAIR_ROOT.y - HEAD_NECK.y),
    );
    const sa = HERO_ANCHORS[this.frame] ?? HERO_ANCHORS[0];
    const sc = this.anchor(sa.scarf.x, sa.scarf.y);
    const wind = -this.vx * 3.2;
    const sdt = Math.min(dt, 1 / 30);
    if (sdt > 0) {
      this.pony.step(hr.x, hr.y + lookY, wind - this.facing * 90, 600 - this.vy * 0.6, sdt);
      this.scarfA.step(sc.x, sc.y, wind * 1.2 - this.facing * 140, 380, sdt, 0.84);
      this.scarfB.step(sc.x, sc.y + 1, wind * 1.0 - this.facing * 110, 480, sdt, 0.86);
    }
    this.drawBack(alpha);
    this.drawAura(dt);
    this.drawPhantom();
  }

  private drawBack(alpha: number): void {
    const gr = this.back;
    gr.clear();
    gr.setAlpha(alpha);
    // scarf tails (behind)
    for (const [rope, w0] of [
      [this.scarfB, 2.5],
      [this.scarfA, 3],
    ] as [Rope, number][]) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < rope.n; i++) {
          const w = Math.max(1.5, w0 - i * 0.3) + (pass === 0 ? 2 : 0);
          gr.lineStyle(Math.round(w), pass === 0 ? C.ink : i % 2 === 0 ? C.scarfLo : C.scarf, 1);
          gr.lineBetween(Math.round(rope.xs[i - 1]), Math.round(rope.ys[i - 1]), Math.round(rope.xs[i]), Math.round(rope.ys[i]));
        }
      }
    }
    // ponytail
    const radii = [3.6, 3.4, 3.1, 2.7, 2.2, 1.6];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = this.pony.n - 1; i >= 0; i--) {
        const x = Math.round(this.pony.xs[i]);
        const y = Math.round(this.pony.ys[i]);
        const r = radii[i];
        if (pass === 0) {
          gr.fillStyle(C.ink, 1);
          gr.fillCircle(x, y, r + 1);
        } else if (pass === 1) {
          gr.fillStyle(i > 3 ? C.hairLo : C.hairMid, 1);
          gr.fillCircle(x, y, r);
        } else if (i < 5) {
          gr.fillStyle(C.hairHi, 1);
          gr.fillRect(x - 1, y - Math.round(r) + 1, 2, 1);
        }
      }
    }
  }

  private drawAura(dt: number): void {
    const g = this.g;
    const a = this.aura;
    a.clear();
    if (this.dead) return;
    if (this.barrierUp) {
      const r = 21 + Math.sin(g.time.now * 0.006) * 1;
      a.lineStyle(1, 0x6ef4ff, 0.55);
      a.strokeCircle(Math.round(this.x), Math.round(this.centerY), Math.round(r));
      a.fillStyle(0xffffff, 0.7);
      a.fillRect(Math.round(this.x - r * 0.55), Math.round(this.centerY - r * 0.7), 3, 1);
    }
    if (this.overdriveT > 0 && Math.random() < 0.8) g.fx.p(this.x + rand(-9, 9), this.y - rand(4, 44), 0, -rand(30, 60), 0.4, Math.random() < 0.5 ? 0xffe860 : 0xffa040, { add: true });
    if (this.dmgBuffT > 0 && Math.random() < 0.4) g.fx.p(this.x + rand(-8, 8), this.y - rand(4, 44), 0, -rand(20, 40), 0.35, 0x6ef4ff, { add: true });
    if (g.build.lv('magnet') > 0) {
      // faint dotted field showing the pickup radius
      const r = g.pickups.magnetRadius;
      const tt = g.time.now * 0.0006;
      a.fillStyle(0x6cff9c, 0.35);
      for (let i = 0; i < 16; i++) {
        const ang = tt + (i / 16) * Math.PI * 2;
        a.fillRect(Math.round(this.x + Math.cos(ang) * r), Math.round(this.centerY + Math.sin(ang) * r * 0.8), 1, 1);
      }
    }
  }

  private drawPhantom(): void {
    const on = this.phantomT > 0 && !this.dead;
    this.ghostBody.setVisible(on);
    this.ghostHead.setVisible(on);
    this.ghostArm.setVisible(on);
    if (!on) return;
    const flip = this.facing < 0;
    const a = HERO_ANCHORS[0];
    const ox = this.phantomX;
    const oy = this.phantomY;
    const fl = Math.min(1, this.phantomT * 2) * (0.35 + Math.sin(this.g.time.now * 0.02) * 0.1);
    this.ghostBody.setFrame(0).setFlipX(flip).setPosition(Math.round(ox), Math.round(oy)).setAlpha(fl);
    const hx = ox + (a.head.x - HERO_ORIGIN.x) * this.facing;
    const hy = oy + (a.head.y - HERO_ORIGIN.y);
    this.ghostHead.setFrame(0).setFlipX(flip).setPosition(Math.round(hx), Math.round(hy)).setAlpha(fl);
    const sx = ox + (a.shoulder.x - HERO_ORIGIN.x) * this.facing;
    const sy = oy + (a.shoulder.y - HERO_ORIGIN.y);
    const ang = Math.atan2(this.aimY - sy, this.aimX - sx);
    this.ghostArm.setTexture(`arm_${this.g.build.weapon.id}`).setPosition(Math.round(sx), Math.round(sy)).setRotation(ang).setFlipY(Math.cos(ang) < 0).setAlpha(fl);
  }

  /** Nearest enemy for bot / helpers. */
  nearest(list: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of list) {
      if (!e.alive || e.dying > 0 || !e.targetable) continue;
      const d = Math.abs(e.x - this.x) + Math.abs(e.y - this.centerY) * 0.7;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  destroy(): void {
    this.stopBeam();
  }
}
