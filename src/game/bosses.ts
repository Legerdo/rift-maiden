// Bosses. Each one tests what the player has learned:
//  Gate Warden – jump the slam shockwaves, dash through the charge, punish
//                the exposed chest core after big attacks (stagger).
//  Orbis       – break the orbiting shards to open the eye, dash through the
//                sweeping laser, survive the rift storm in the last phase.

import Phaser from 'phaser';
import { ARENA_W, DEPTH, GROUND_Y } from '../core/constants';
import { clamp, dist, pointSegDist } from '../core/mathx';
import { rand, pick } from '../core/rng';
import { audio } from '../audio/audio';
import { t } from '../localization/i18n';
import { WARDEN_ANIM, WARDEN_CORE, WARDEN_FH, WARDEN_FW, WARDEN_OFFS, ORBIS_ANIM } from '../art/bossArt';
import type { BossId } from '../data/zones';
import type { GameScene } from '../scenes/GameScene';
import type { BossLink, Enemy } from './enemy';

export interface BossCtl extends BossLink {
  id: BossId;
  nameKey: string;
  subKey: string;
  alive: boolean;
  defeated: boolean;
  x: number;
  y: number;
  phase: number;
  stagger: number;
  hpFrac(): number;
  update(dt: number): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Gate Warden
// ---------------------------------------------------------------------------
type WState = 'enter' | 'idle' | 'slamUp' | 'slamDown' | 'chargeWind' | 'charge' | 'wallStun' | 'mortar' | 'roar' | 'stagger' | 'dying';

export class Warden implements BossCtl {
  id: BossId = 'warden';
  nameKey = 'boss.warden';
  subKey = 'boss.warden.sub';
  alive = true;
  defeated = false;
  g: GameScene;
  x: number;
  y = GROUND_Y;
  facing: 1 | -1 = -1;
  phase = 1;
  stagger = 0;
  private staggerMax: number;
  private state: WState = 'enter';
  private st = 0;
  private frame = 0;
  private animT = 0;
  private coreOpen = 0;
  private lastAttack = '';
  private mortarLeft = 0;
  private mortarT = 0;
  private chargeAgain = false;
  private deathT = 0;
  private stepT = 0;
  private flash = 0;
  private body: Enemy;
  private spr: Phaser.GameObjects.Sprite;
  private core: Phaser.GameObjects.Sprite;
  private hpMax: number;
  private enterTarget: number;

  constructor(g: GameScene, hp: number) {
    this.g = g;
    // Enter from whichever side has more room, just outside the view.
    const fromRight = g.player.x < ARENA_W / 2 + 120;
    this.x = fromRight ? Math.min(ARENA_W + 70, g.cam.x + 480 + 70) : Math.max(-70, g.cam.x - 70);
    this.enterTarget = fromRight ? this.x - 230 : this.x + 230;
    this.facing = fromRight ? -1 : 1;
    this.hpMax = hp;
    this.staggerMax = hp * 0.14;
    this.spr = g.add.sprite(this.x, GROUND_Y, 'boss_warden', 0).setOrigin(0.5, 101 / WARDEN_FH).setDepth(DEPTH.BOSS);
    this.core = g.add.sprite(this.x, GROUND_Y, 'boss_core', 0).setDepth(DEPTH.BOSS + 0.5);
    this.body = g.spawnExternal(this.x, GROUND_Y - 44, 26, 38, hp, this, 20);
    this.body.contact = true;
  }

  hpFrac(): number {
    return clamp(this.body.hp / this.hpMax, 0, 1);
  }

  private corePos(): { x: number; y: number } {
    const [ox, oy] = WARDEN_OFFS[this.frame] ?? [0, 0];
    const lx = WARDEN_CORE.x + ox - WARDEN_FW / 2;
    const ly = WARDEN_CORE.y + oy - 101;
    return { x: this.x + lx * this.facing, y: this.y + ly };
  }

  modify(_e: Enemy, amount: number, hx: number, hy: number): { amount: number; weak: boolean; blocked: boolean } {
    const c = this.corePos();
    const nearCore = dist(hx, hy, c.x, c.y) < 14;
    if (this.state === 'stagger') return { amount: amount * (nearCore ? 3 : 1.6), weak: nearCore, blocked: false };
    if (nearCore && this.coreOpen > 0) {
      this.stagger += amount * 2.5;
      if (this.stagger >= this.staggerMax) this.startStagger();
      return { amount: amount * 2.5, weak: true, blocked: false };
    }
    return { amount: amount * 0.72, weak: false, blocked: false };
  }

  onPartKilled(_e: Enemy): void {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.st = 0;
    this.deathT = 0;
    this.body.targetable = false;
    this.body.contact = false;
    this.g.onBossDying(this);
    audio.play('boss_roar', { pitch: 0.8 });
  }

  private startStagger(): void {
    this.stagger = 0;
    this.state = 'stagger';
    this.st = 3.2;
    this.coreOpen = 3.2;
    this.g.fx.text(this.x, this.y - 110, t('banner.stagger'), 0xffcf4a, 'big', 1.2);
    this.g.cam.shake(0.4);
    this.g.hitstop(90);
    audio.play('boss_hurt');
  }

  private setFrame(list: number[], fps = 6): void {
    this.frame = list[Math.floor(this.animT * fps) % list.length];
  }

  private chooseAttack(): void {
    const g = this.g;
    const dx = g.player.x - this.x;
    const options: string[] = ['slam', 'charge', 'mortar'];
    let pickA = pick(options.filter((o) => o !== this.lastAttack));
    if (Math.abs(dx) > 260 && this.lastAttack !== 'charge') pickA = 'charge';
    this.lastAttack = pickA;
    const sp = this.phase === 2 ? 0.75 : 1;
    this.facing = dx >= 0 ? 1 : -1;
    if (pickA === 'slam') {
      this.state = 'slamUp';
      this.st = 0.75 * sp;
      audio.play('laser_charge', { pitch: 0.5, vol: 0.5 });
      for (const dir of [-1, 1]) g.telegraph.line(this.x + dir * 40, GROUND_Y - 3, this.x + dir * 340, GROUND_Y - 3, this.st, 0xff5c7a, 2);
    } else if (pickA === 'charge') {
      this.state = 'chargeWind';
      this.st = 0.8 * sp;
      this.chargeAgain = this.phase === 2;
      audio.play('enemy_charge', { pitch: 0.5 });
      g.telegraph.line(this.x, GROUND_Y - 20, this.facing > 0 ? ARENA_W : 0, GROUND_Y - 20, this.st, 0xff5c7a, 5);
    } else {
      this.state = 'mortar';
      this.st = 0.5;
      this.mortarLeft = this.phase === 2 ? 8 : 5;
      this.mortarT = 0.25;
      audio.play('boss_roar', { pitch: 1.4, vol: 0.5 });
    }
  }

  update(dt: number): void {
    const g = this.g;
    const p = g.player;
    this.animT += dt;
    this.st -= dt;
    this.coreOpen = Math.max(0, this.coreOpen - dt);
    this.flash = Math.max(0, this.flash - dt);
    const sp = this.phase === 2 ? 1.25 : 1;

    if (this.state !== 'dying' && this.phase === 1 && this.hpFrac() < 0.5) {
      this.phase = 2;
      this.state = 'roar';
      this.st = 1.2;
      g.fx.text(this.x, this.y - 112, t('banner.phase'), 0xff5c7a, 'big', 1.2);
      audio.play('boss_roar');
      g.cam.shake(0.5);
      g.flash(0xff5c7a, 0.2);
      for (let i = 0; i < 4; i++) g.spawnEnemy('crawler', i < 2 ? g.cam.x - 10 : g.cam.x + 490, GROUND_Y - 10, null);
    }

    switch (this.state) {
      case 'enter': {
        this.x += this.facing * 42 * dt;
        this.setFrame(WARDEN_ANIM.walk, 5);
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = 0.4;
          g.cam.shake(0.12);
          audio.play('boss_step');
          g.fx.dust(this.x, GROUND_Y, 8);
        }
        if ((this.facing < 0 && this.x <= this.enterTarget) || (this.facing > 0 && this.x >= this.enterTarget)) {
          this.state = 'roar';
          this.st = 1.3;
          audio.play('boss_roar');
          g.cam.shake(0.5);
        }
        break;
      }
      case 'roar': {
        this.setFrame(WARDEN_ANIM.slamUp);
        if (Math.random() < 0.5) g.fx.p(this.x + rand(-30, 30), this.y - rand(40, 90), rand(-20, 20), -rand(30, 60), 0.6, 0x8a8098, { size: 2 });
        if (this.st <= 0) {
          this.state = 'idle';
          this.st = 0.6;
        }
        break;
      }
      case 'idle': {
        const dx = p.x - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) > 110) {
          this.x += this.facing * 48 * sp * dt;
          this.setFrame(WARDEN_ANIM.walk, 5);
          this.stepT -= dt;
          if (this.stepT <= 0) {
            this.stepT = 0.42;
            g.cam.shake(0.06);
            audio.play('boss_step', { vol: 0.6 });
          }
        } else this.setFrame(WARDEN_ANIM.idle, 2);
        if (this.st <= 0) this.chooseAttack();
        break;
      }
      case 'slamUp': {
        this.setFrame(WARDEN_ANIM.slamUp);
        if (this.st <= 0) {
          this.state = 'slamDown';
          this.st = 1.7;
          this.coreOpen = 1.7;
          g.cam.shake(0.6);
          g.cam.punch(0.03);
          g.hitstop(70);
          audio.play('boss_slam');
          g.fx.dust(this.x - 40, GROUND_Y, 12);
          g.fx.dust(this.x + 40, GROUND_Y, 12);
          g.fx.debris(this.x, GROUND_Y - 4, [0x5a4a7a, 0x8a80a8, 0x3a2e58], 14, 1.2);
          const v = this.phase === 2 ? 250 : 205;
          g.eshots.fire(this.x - 44, GROUND_Y, -v, 0, 'wave', 1);
          g.eshots.fire(this.x + 44, GROUND_Y, v, 0, 'wave', 1);
          if (this.phase === 2) {
            this.mortarT = 0.4;
            this.mortarLeft = -1; // flag: second wave pair
          }
        }
        break;
      }
      case 'slamDown': {
        this.setFrame(WARDEN_ANIM.slamDown);
        if (this.mortarLeft === -1) {
          this.mortarT -= dt;
          if (this.mortarT <= 0) {
            this.mortarLeft = 0;
            g.eshots.fire(this.x - 44, GROUND_Y, -170, 0, 'wave', 1);
            g.eshots.fire(this.x + 44, GROUND_Y, 170, 0, 'wave', 1);
            audio.play('boss_slam', { vol: 0.6, pitch: 1.2 });
          }
        }
        if (this.st <= 0) {
          this.state = 'idle';
          this.st = rand(0.7, 1.1) / sp;
        }
        break;
      }
      case 'chargeWind': {
        this.setFrame(WARDEN_ANIM.charge);
        if (Math.random() < 0.6) g.fx.dust(this.x - this.facing * 20, GROUND_Y, 1, this.facing);
        if (this.st <= 0) {
          this.state = 'charge';
          this.st = 3;
          audio.play('enemy_dash', { pitch: 0.6 });
        }
        break;
      }
      case 'charge': {
        this.setFrame(WARDEN_ANIM.walk, 12);
        this.x += this.facing * 390 * dt;
        this.body.mem.contactDmg = 2;
        if (Math.random() < 0.7) g.fx.dust(this.x - this.facing * 30, GROUND_Y, 2, this.facing);
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = 0.15;
          g.cam.shake(0.08);
          audio.play('boss_step', { vol: 0.5, pitch: 1.3 });
        }
        if (this.x < 60 || this.x > ARENA_W - 60 || this.st <= 0) {
          this.x = clamp(this.x, 60, ARENA_W - 60);
          this.body.mem.contactDmg = 1;
          this.state = 'wallStun';
          this.st = this.chargeAgain ? 1.1 : 2.2;
          this.coreOpen = this.st;
          g.cam.shake(0.55);
          g.hitstop(60);
          audio.play('boss_slam', { pitch: 1.4 });
          g.fx.debris(this.x + this.facing * 50, GROUND_Y - 50, [0x5a4a7a, 0x8a80a8], 16, 1.3);
          for (let i = 0; i < 3; i++) g.eshots.fire(this.x + this.facing * 40 + rand(-60, 60), -10, 0, rand(20, 60), 'debris', 1);
        }
        break;
      }
      case 'wallStun': {
        this.setFrame(WARDEN_ANIM.stun);
        if (this.st <= 0) {
          if (this.chargeAgain) {
            this.chargeAgain = false;
            this.facing = (p.x >= this.x ? 1 : -1) as 1 | -1;
            this.state = 'chargeWind';
            this.st = 0.55;
            g.telegraph.line(this.x, GROUND_Y - 20, this.facing > 0 ? ARENA_W : 0, GROUND_Y - 20, this.st, 0xff5c7a, 5);
          } else {
            this.state = 'idle';
            this.st = 0.8;
          }
        }
        break;
      }
      case 'mortar': {
        this.setFrame(WARDEN_ANIM.mortar);
        this.mortarT -= dt;
        if (this.mortarT <= 0 && this.mortarLeft > 0) {
          this.mortarT = 0.17;
          this.mortarLeft--;
          const first = this.mortarLeft === (this.phase === 2 ? 7 : 4);
          const tx = clamp(first ? p.x : p.x + rand(-90, 90), 20, ARENA_W - 20);
          const sx = this.x - this.facing * 20;
          const sy = GROUND_Y - 96;
          const T = 1.15;
          const grav = 420;
          const vx = (tx - sx) / T;
          const vy = (GROUND_Y - 4 - sy - 0.5 * grav * T * T) / T;
          g.eshots.fire(sx, sy, vx, vy, 'mortar', 1);
          g.telegraph.ground(tx, 22, T);
          audio.play('missile', { pitch: 0.6, vol: 0.6 });
          g.fx.sparks(sx, sy, 6, [0xff8ab0, 0xffffff], 90, -Math.PI / 2, 1, 0.3);
        }
        if (this.mortarLeft <= 0 && this.st <= -0.3) {
          this.state = 'idle';
          this.st = rand(0.8, 1.2) / sp;
        }
        break;
      }
      case 'stagger': {
        this.setFrame(WARDEN_ANIM.stun);
        if (Math.random() < 0.3) g.fx.p(this.x + rand(-20, 20), this.y - rand(40, 80), 0, -30, 0.5, 0xffcf4a, { add: true });
        if (this.st <= 0) {
          this.state = 'idle';
          this.st = 0.5;
        }
        break;
      }
      case 'dying': {
        this.deathT += dt;
        this.setFrame(WARDEN_ANIM.stun);
        if (this.st <= 0) {
          this.st = 0.14;
          const ex = this.x + rand(-40, 40);
          const ey = this.y - rand(20, 90);
          g.fx.explosion(ex, ey, rand(16, 30));
          audio.play('explosion', { vol: 0.8 });
          g.cam.shake(0.25);
        }
        if (this.deathT > 2.2) {
          g.fx.explosion(this.x, this.y - 50, 60);
          g.fx.debris(this.x, this.y - 50, [0x5c6484, 0x9aa4c4, 0xff3ca0], 40, 2);
          g.flash(0xffffff, 0.5);
          g.cam.shake(1);
          audio.play('kill_big');
          this.alive = false;
          this.defeated = true;
          this.spr.setVisible(false);
          this.core.setVisible(false);
          g.onBossDefeated(this);
          return;
        }
        break;
      }
    }

    // sync hurtbox & sprites
    const [ox, oy] = WARDEN_OFFS[this.frame] ?? [0, 0];
    this.body.x = this.x + ox * this.facing * 0.5;
    this.body.y = GROUND_Y - 44 + oy * 0.5;
    if (this.body.flash > 0) this.flash = 0.05;
    this.body.flash = Math.max(0, this.body.flash - dt);
    this.spr.setFrame(this.frame).setPosition(Math.round(this.x), Math.round(this.y)).setFlipX(this.facing < 0);
    if (this.flash > 0) this.spr.setTint(0xffc8d0);
    else if (this.phase === 2 && Math.floor(this.animT * 6) % 6 === 0) this.spr.setTint(0xffb0c0);
    else this.spr.clearTint();
    const c = this.corePos();
    const coreFrame = this.state === 'stagger' ? 2 : this.coreOpen > 0 ? 1 : 0;
    this.core.setFrame(coreFrame).setPosition(Math.round(c.x), Math.round(c.y)).setVisible(this.state !== 'dying' || Math.random() < 0.5);
    if (coreFrame > 0 && Math.random() < 0.3) g.fx.p(c.x + rand(-4, 4), c.y + rand(-4, 4), rand(-20, 20), -rand(10, 40), 0.3, 0xff3ca0, { add: true });
  }

  destroy(): void {
    this.spr.destroy();
    this.core.destroy();
    this.body.release();
  }
}

// ---------------------------------------------------------------------------
// Orbis
// ---------------------------------------------------------------------------
type OState = 'enter' | 'idle' | 'ring' | 'stream' | 'summon' | 'laserCharge' | 'laser' | 'rain' | 'dying';

interface ShardPart {
  e: Enemy;
  spr: Phaser.GameObjects.Sprite;
  ang: number;
  alive: boolean;
}

export class Orbis implements BossCtl {
  id: BossId = 'orbis';
  nameKey = 'boss.orbis';
  subKey = 'boss.orbis.sub';
  alive = true;
  defeated = false;
  g: GameScene;
  x = ARENA_W / 2;
  y = -60;
  phase = 1;
  stagger = 0;
  private state: OState = 'enter';
  private st = 0;
  private t = 0;
  private main: Enemy;
  private spr: Phaser.GameObjects.Sprite;
  private shards: ShardPart[] = [];
  private hpMax: number;
  private ringCount = 0;
  private ringT = 0;
  private laserA0 = 0;
  private laserA1 = 0;
  private laserG: Phaser.GameObjects.Graphics;
  private deathT = 0;
  private lastAttack = '';
  private blockT = 0;
  private flash = 0;
  private hoverX = ARENA_W / 2;

  constructor(g: GameScene, hp: number) {
    this.g = g;
    this.hpMax = hp;
    this.x = clamp(g.player.x + 120, 120, ARENA_W - 120);
    this.hoverX = this.x;
    this.spr = g.add.sprite(this.x, this.y, 'boss_orbis', 2).setDepth(DEPTH.BOSS);
    this.laserG = g.add.graphics().setDepth(DEPTH.ENEMY_SHOT - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.main = g.spawnExternal(this.x, this.y, 20, 17, hp, this, 20);
    this.main.contact = false;
  }

  hpFrac(): number {
    return clamp(this.main.hp / this.hpMax, 0, 1);
  }

  private get eyeOpen(): boolean {
    return this.state !== 'enter' && !this.shards.some((s) => s.alive);
  }

  modify(e: Enemy, amount: number, hx: number, hy: number): { amount: number; weak: boolean; blocked: boolean } {
    if (e !== this.main) return { amount, weak: false, blocked: false };
    if (!this.eyeOpen) {
      if (this.g.run.time - this.blockT > 0.25) {
        this.blockT = this.g.run.time;
        return { amount: amount * 0.1, weak: false, blocked: true };
      }
      return { amount: amount * 0.1, weak: false, blocked: false };
    }
    const nearPupil = dist(hx, hy, this.x, this.y) < 8;
    return { amount: amount * (nearPupil ? 1.7 : 1), weak: nearPupil, blocked: false };
  }

  onPartKilled(e: Enemy): void {
    const g = this.g;
    const sh = this.shards.find((s) => s.e === e);
    if (sh) {
      sh.alive = false;
      sh.spr.setVisible(false);
      e.release();
      g.fx.explosion(e.x, e.y, 22, [0xffe0ff, 0xd070ff, 0xff3ca0]);
      g.fx.debris(e.x, e.y, [0xd070ff, 0xffe0ff], 10, 1);
      audio.play('rift_close');
      g.pickups.xp(e.x, e.y, 20);
      if (!this.shards.some((s) => s.alive)) {
        g.fx.text(this.x, this.y - 60, t('banner.weak'), 0xff9ad0, 'big', 1.2);
        g.cam.shake(0.4);
        audio.play('boss_hurt');
      }
      return;
    }
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.st = 0;
    this.deathT = 0;
    this.main.targetable = false;
    for (const s of this.shards) {
      if (s.alive) {
        s.alive = false;
        s.spr.setVisible(false);
        s.e.release();
      }
    }
    this.laserG.clear();
    g.onBossDying(this);
    audio.play('boss_roar', { pitch: 1.3 });
  }

  private spawnShards(): void {
    const g = this.g;
    for (let i = 0; i < 4; i++) {
      const e = g.spawnExternal(this.x, this.y, 8, 12, this.hpMax * 0.06, this, 15);
      e.contact = false;
      const spr = g.add.sprite(this.x, this.y, 'orbis_shard', 0).setDepth(DEPTH.BOSS + 1);
      this.shards.push({ e, spr, ang: (i / 4) * Math.PI * 2, alive: true });
    }
    g.fx.ring(this.x, this.y, 10, 70, 0.4, 0xd070ff, 2);
    audio.play('summon', { pitch: 0.7 });
  }

  private choose(): void {
    const opts: OState[] = ['ring', 'stream', 'summon'];
    if (this.phase >= 2) opts.push('laserCharge');
    if (this.phase === 3) opts.push('rain', 'rain');
    const choice = pick(opts.filter((o) => o !== this.lastAttack));
    this.lastAttack = choice;
    this.state = choice;
    const g = this.g;
    switch (choice) {
      case 'ring':
        this.ringCount = this.phase === 3 ? 4 : 3;
        this.ringT = 0.4;
        this.st = 3;
        this.spr.setFrame(ORBIS_ANIM.charge[0]);
        audio.play('laser_charge', { pitch: 1.2, vol: 0.4 });
        break;
      case 'stream':
        this.ringCount = this.phase === 3 ? 12 : 8;
        this.ringT = 0.5;
        this.st = 3;
        break;
      case 'summon':
        this.st = 1.2;
        for (let i = 0; i < (this.phase === 3 ? 3 : 2); i++) {
          const x = clamp(g.player.x + rand(-200, 200), 30, ARENA_W - 30);
          const id = this.phase === 3 && i === 2 ? 'exploder' : 'flyer';
          g.fx.ring(x, 90, 4, 24, 0.4, 0xff3ca0, 1);
          g.spawnEnemy(id, x, id === 'flyer' ? 90 : GROUND_Y - 10, null);
        }
        audio.play('summon');
        break;
      case 'laserCharge': {
        this.st = 0.95;
        const toP = Math.atan2(g.player.centerY - this.y, g.player.x - this.x);
        const side = Math.random() < 0.5 ? -1 : 1;
        this.laserA0 = toP + side * 0.75;
        this.laserA1 = toP - side * 0.75;
        audio.play('laser_charge', { vol: 0.7 });
        break;
      }
      case 'rain':
        this.ringCount = 10;
        this.ringT = 0.2;
        this.st = 3;
        break;
      default:
        break;
    }
  }

  private laserEnd(a: number): { x: number; y: number } {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const len = dy > 0.05 ? (GROUND_Y - this.y) / dy : 600;
    return { x: this.x + dx * Math.min(len, 700), y: this.y + dy * Math.min(len, 700) };
  }

  update(dt: number): void {
    const g = this.g;
    const p = g.player;
    this.t += dt;
    this.st -= dt;
    this.flash = Math.max(0, this.flash - dt);
    const hp = this.hpFrac();
    if (this.state !== 'dying') {
      if (this.phase === 1 && hp < 0.66) {
        this.phase = 2;
        this.spawnShards();
        g.fx.text(this.x, this.y - 64, t('banner.phase'), 0xff5c7a, 'big', 1.2);
        g.cam.shake(0.4);
      } else if (this.phase === 2 && hp < 0.33) {
        this.phase = 3;
        g.fx.text(this.x, this.y - 64, t('banner.phase'), 0xff5c7a, 'big', 1.2);
        g.flash(0xff3ca0, 0.35);
        g.cam.shake(0.6);
        g.setDarkness(0.35);
        audio.play('boss_roar', { pitch: 1.2 });
      }
    }

    // hover movement
    if (this.state !== 'enter' && this.state !== 'dying') {
      if (Math.random() < dt * 0.4) this.hoverX = clamp(p.x + rand(-160, 160), 90, ARENA_W - 90);
      const speed = this.phase === 3 ? 1.4 : 0.8;
      if (this.state !== 'laser' && this.state !== 'laserCharge') this.x += (this.hoverX - this.x) * Math.min(1, dt * speed);
      this.y = 86 + Math.sin(this.t * 1.3) * 8 + (this.phase === 3 ? 10 : 0);
    }

    this.laserG.clear();
    switch (this.state) {
      case 'enter': {
        this.y += (86 - this.y) * Math.min(1, dt * 1.5);
        this.spr.setFrame(ORBIS_ANIM.closed[0]);
        if (Math.random() < 0.6) g.fx.p(this.x + rand(-40, 40), this.y + rand(-40, 40), 0, 0, 0.4, 0xff3ca0, { add: true });
        if (Math.abs(this.y - 86) < 2) {
          this.state = 'idle';
          this.st = 1.2;
          audio.play('boss_roar', { pitch: 1.5 });
          g.cam.shake(0.4);
        }
        break;
      }
      case 'idle':
        this.spr.setFrame(this.eyeOpen ? ORBIS_ANIM.idle[Math.floor(this.t * 3) % 2] : ORBIS_ANIM.closed[0]);
        if (this.st <= 0) this.choose();
        break;
      case 'ring': {
        this.ringT -= dt;
        if (this.ringT <= 0 && this.ringCount > 0) {
          this.ringCount--;
          this.ringT = this.phase === 3 ? 0.42 : 0.55;
          const n = this.phase === 3 ? 20 : 16;
          const gap = Math.floor(rand(0, n));
          const off = rand(0, Math.PI * 2);
          for (let i = 0; i < n; i++) {
            if (i === gap || i === (gap + 1) % n) continue;
            const a = off + (i / n) * Math.PI * 2;
            g.eshots.fire(this.x, this.y, Math.cos(a) * 95, Math.sin(a) * 95, i % 4 === 0 ? 'big' : 'orb', 1);
          }
          audio.play('enemy_shot', { pitch: 0.6 });
          this.spr.setFrame(ORBIS_ANIM.charge[0]);
        }
        if (this.ringCount <= 0) {
          this.state = 'idle';
          this.st = rand(1.0, 1.5);
        }
        break;
      }
      case 'stream': {
        this.ringT -= dt;
        this.spr.setFrame(this.eyeOpen ? ORBIS_ANIM.idle[0] : ORBIS_ANIM.closed[0]);
        if (this.ringT <= 0 && this.ringCount > 0) {
          this.ringCount--;
          this.ringT = 0.13;
          const a = Math.atan2(p.centerY - this.y, p.x - this.x) + rand(-0.08, 0.08);
          g.eshots.fire(this.x, this.y + 10, Math.cos(a) * 165, Math.sin(a) * 165, 'orb', 1);
          audio.play('enemy_shot', { pitch: 1.2, vol: 0.6 });
        }
        if (this.ringCount <= 0) {
          this.state = 'idle';
          this.st = rand(0.9, 1.3);
        }
        break;
      }
      case 'summon':
        if (this.st <= 0) {
          this.state = 'idle';
          this.st = 0.8;
        }
        break;
      case 'laserCharge': {
        this.spr.setFrame(ORBIS_ANIM.charge[0]);
        const e0 = this.laserEnd(this.laserA0);
        const k = 1 - Math.max(0, this.st) / 0.95;
        this.laserG.lineStyle(1, 0xff5c7a, 0.4 + k * 0.5);
        this.laserG.lineBetween(Math.round(this.x), Math.round(this.y), Math.round(e0.x), Math.round(e0.y));
        g.telegraph.circle(e0.x, e0.y, 8, dt * 1.5, 0xff5c7a);
        if (this.st <= 0) {
          this.state = 'laser';
          this.st = 1.7;
          audio.play('laser_fire');
          g.cam.shake(0.3);
        }
        break;
      }
      case 'laser': {
        this.spr.setFrame(ORBIS_ANIM.charge[0]);
        const k = 1 - Math.max(0, this.st) / 1.7;
        const a = this.laserA0 + (this.laserA1 - this.laserA0) * k;
        const e1 = this.laserEnd(a);
        const w = 7 + Math.sin(this.t * 40) * 1;
        this.laserG.lineStyle(w + 4, 0xff3c8c, 0.45);
        this.laserG.lineBetween(Math.round(this.x), Math.round(this.y), Math.round(e1.x), Math.round(e1.y));
        this.laserG.lineStyle(Math.max(2, w - 3), 0xffe0f0, 1);
        this.laserG.lineBetween(Math.round(this.x), Math.round(this.y), Math.round(e1.x), Math.round(e1.y));
        g.fx.sparks(e1.x, e1.y, 2, [0xff3c8c, 0xffffff], 120, -Math.PI / 2, 2, 0.25);
        g.cam.shake(0.04);
        if (pointSegDist(p.x, p.centerY, this.x, this.y, e1.x, e1.y) < 8 + 6) p.hurt(1, e1.x, 'laser');
        if (this.st <= 0) {
          this.state = 'idle';
          this.st = 1.1;
        }
        break;
      }
      case 'rain': {
        this.ringT -= dt;
        if (this.ringT <= 0 && this.ringCount > 0) {
          this.ringCount--;
          this.ringT = 0.22;
          const x = clamp(p.x + rand(-140, 140), 10, ARENA_W - 10);
          g.telegraph.column(x, 14, 0.7);
          g.eshots.fire(x, -60, 0, 170, 'big', 1);
        }
        if (this.ringCount <= 0) {
          this.state = 'idle';
          this.st = 1.0;
        }
        break;
      }
      case 'dying': {
        this.deathT += dt;
        this.spr.setFrame(ORBIS_ANIM.charge[0]);
        this.x += rand(-2, 2);
        if (this.st <= 0) {
          this.st = 0.12;
          g.fx.explosion(this.x + rand(-40, 40), this.y + rand(-40, 40), rand(16, 30), [0xffe0ff, 0xd070ff, 0xff3ca0]);
          audio.play('explosion', { vol: 0.7 });
          g.cam.shake(0.3);
        }
        if (this.deathT > 2.8) {
          g.fx.explosion(this.x, this.y, 70, [0xffffff, 0xffe0ff, 0xd070ff]);
          g.fx.ring(this.x, this.y, 10, 260, 0.8, 0xffffff, 3);
          g.flash(0xffffff, 0.9);
          g.cam.shake(1);
          audio.play('kill_big');
          this.alive = false;
          this.defeated = true;
          this.spr.setVisible(false);
          g.setDarkness(0);
          g.onBossDefeated(this);
          return;
        }
        break;
      }
    }

    // shards orbit
    for (const s of this.shards) {
      if (!s.alive) continue;
      s.ang += dt * (this.phase === 3 ? 1.8 : 1.2);
      const sx = this.x + Math.cos(s.ang) * 56;
      const sy = this.y + Math.sin(s.ang) * 44;
      s.e.x = sx;
      s.e.y = sy;
      s.spr.setPosition(Math.round(sx), Math.round(sy)).setFrame(s.e.flash > 0 ? 1 : s.e.hp < s.e.maxHp * 0.5 ? 2 : 0);
      s.e.flash = Math.max(0, s.e.flash - dt);
      if (Math.random() < dt * 0.35) {
        const a = Math.atan2(p.centerY - sy, p.x - sx);
        g.eshots.fire(sx, sy, Math.cos(a) * 120, Math.sin(a) * 120, 'orb', 1);
      }
    }
    this.main.x = this.x;
    this.main.y = this.y;
    if (this.main.flash > 0) this.flash = 0.05;
    this.main.flash = Math.max(0, this.main.flash - dt);
    this.spr.setPosition(Math.round(this.x), Math.round(this.y));
    if (this.flash > 0) this.spr.setTint(0xffc8d0);
    else this.spr.clearTint();
    if (this.state !== 'dying' && Math.random() < 0.5) g.fx.p(this.x + rand(-44, 44), this.y + rand(-44, 44), 0, rand(-20, 20), 0.5, this.phase === 3 ? 0xff3ca0 : 0xd070ff, { add: true });
  }

  destroy(): void {
    this.spr.destroy();
    this.laserG.destroy();
    for (const s of this.shards) {
      s.spr.destroy();
      if (s.alive) s.e.release();
    }
    this.main.release();
  }
}

export function createBoss(g: GameScene, id: BossId, hpMul: number): BossCtl {
  if (id === 'warden') return new Warden(g, 22000 * hpMul);
  return new Orbis(g, 32000 * hpMul);
}
