// Enemy runtime + behaviours. Each archetype asks for a different answer:
//  crawler  – swarm, keep moving / shoot early
//  charger  – telegraphed ground charge, jump or dash through
//  gunner   – keeps distance, telegraphed aimed shots, glowing head weak point
//  flyer    – hovers and dives, forces aiming upward
//  watcher  – floating eye, 3-way spreads
//  shield   – front shield blocks shots, turns slowly: flank or shoot from above
//  summoner – stays back, summons crawlers and shields allies: priority target
//  exploder – rushes and detonates, can be shot to blow up its friends

import Phaser from 'phaser';
import { ENEMIES, type EnemyDef, type EnemyId, type EliteMod } from '../data/enemies';
import { ENEMY_ART, type EnemyArt } from '../art/enemiesArt';
import { ARENA_W, DEPTH, GROUND_Y, SKY_TOP } from '../core/constants';
import { clamp, dist, angleTo } from '../core/mathx';
import { rand, chance, randSign } from '../core/rng';
import { audio } from '../audio/audio';
import type { GameScene } from '../scenes/GameScene';
import type { GridItem } from './spatial';

let UID = 1;

export interface BossLink {
  /** Modify incoming damage (weak points / armour). */
  modify(e: Enemy, amount: number, hx: number, hy: number): { amount: number; weak: boolean; blocked: boolean };
  onPartKilled(e: Enemy): void;
}

export class Enemy implements GridItem {
  uid = 0;
  def: EnemyDef = ENEMIES.crawler;
  art: EnemyArt = ENEMY_ART.crawler;
  ai: string = 'crawler';
  sprite: Phaser.GameObjects.Sprite;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  kbx = 0;
  hw = 8;
  hh = 8;
  qstamp = 0;
  hp = 1;
  maxHp = 1;
  alive = false;
  /** >0 while playing the death beat (not targetable). */
  dying = 0;
  dyingMax = 0;
  elite: EliteMod | null = null;
  ward = 0;
  wardMax = 0;
  facing: 1 | -1 = -1;
  state = 'move';
  st = 0;
  animT = 0;
  anim = 'walk';
  flash = 0;
  stun = 0;
  slow = 0;
  frost = 0;
  frozen = 0;
  buffT = 0;
  burnT = 0;
  burnDmg = 0;
  burnTick = 0;
  summoned = false;
  spawnAt = 0;
  hpMul = 1;
  grounded = true;
  lastHitWeak = false;
  killedByExplosion = false;
  mem: Record<string, number> = {};
  boss: BossLink | null = null;
  external = false;
  contact = true;
  targetable = true;
  hpBarT = 0;
  owner: Enemy | null = null;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.sprite(-100, -100, 'en_crawler', 0).setVisible(false).setDepth(DEPTH.ENEMY);
  }

  get isElite(): boolean {
    return this.elite !== null;
  }

  get top(): number {
    return this.y - this.hh;
  }

  init(id: EnemyId, x: number, y: number, hpMul: number, time: number, elite: EliteMod | null): this {
    const def = ENEMIES[id];
    this.uid = UID++;
    this.def = def;
    this.art = ENEMY_ART[id];
    this.ai = id;
    this.hw = def.hw;
    this.hh = def.hh;
    this.x = x;
    this.y = def.flying ? y : GROUND_Y - def.hh;
    this.vx = 0;
    this.vy = 0;
    this.kbx = 0;
    this.elite = elite;
    this.hpMul = hpMul;
    this.maxHp = def.hp * hpMul * (elite ? 5.5 : 1);
    this.hp = this.maxHp;
    this.ward = elite === 'warded' ? this.maxHp * 0.45 : 0;
    this.wardMax = this.ward;
    this.alive = true;
    this.dying = 0;
    this.state = 'move';
    this.st = rand(0, 0.6);
    this.animT = rand(0, 1);
    this.anim = Object.keys(this.art.anims)[0];
    this.flash = 0;
    this.stun = 0;
    this.slow = 0;
    this.frost = 0;
    this.frozen = 0;
    this.buffT = 0;
    this.burnT = 0;
    this.burnDmg = 0;
    this.burnTick = 0;
    this.summoned = false;
    this.spawnAt = time;
    this.grounded = !def.flying;
    this.mem = { offset: rand(-22, 22), spd: rand(0.85, 1.15), cd: rand(1.2, 2.4) };
    this.boss = null;
    this.external = false;
    this.contact = def.contactDmg > 0;
    this.targetable = true;
    this.hpBarT = 0;
    this.owner = null;
    this.lastHitWeak = false;
    this.killedByExplosion = false;
    const key = elite ? `${def.tex}_elite` : def.tex;
    this.sprite.setTexture(key, 0);
    this.sprite.setOrigin(this.art.ox, this.art.oy);
    this.sprite.setVisible(true).setActive(true).setAlpha(1).setScale(1).setRotation(0).clearTint();
    this.sprite.setDepth(DEPTH.ENEMY + (def.flying ? 1 : 0));
    this.sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    return this;
  }

  /** Boss part / external body: hitbox only, controller moves it. */
  initExternal(x: number, y: number, hw: number, hh: number, hp: number, boss: BossLink, threat = 10): this {
    this.uid = UID++;
    this.def = { ...ENEMIES.rift, id: 'rift', hp, threat, xp: 0, shardChance: 0, contactDmg: 1, flying: true, mass: 1 };
    this.ai = 'external';
    this.x = x;
    this.y = y;
    this.hw = hw;
    this.hh = hh;
    this.maxHp = hp;
    this.hp = hp;
    this.alive = true;
    this.dying = 0;
    this.elite = null;
    this.ward = 0;
    this.boss = boss;
    this.external = true;
    this.contact = true;
    this.targetable = true;
    this.frozen = 0;
    this.stun = 0;
    this.slow = 0;
    this.frost = 0;
    this.burnT = 0;
    this.burnDmg = 0;
    this.mem = {};
    this.sprite.setVisible(false);
    return this;
  }

  release(): void {
    this.alive = false;
    this.sprite.setVisible(false).setActive(false);
  }

  setAnim(name: string): void {
    if (this.anim !== name && this.art.anims[name]) {
      this.anim = name;
      this.animT = 0;
    }
  }

  /** Distance-independent contact / hurtbox test against a point. */
  overlapsCircle(x: number, y: number, r: number): boolean {
    const nx = clamp(x, this.x - this.hw, this.x + this.hw);
    const ny = clamp(y, this.y - this.hh, this.y + this.hh);
    const dx = x - nx;
    const dy = y - ny;
    return dx * dx + dy * dy <= r * r;
  }
}

// ---------------------------------------------------------------------------
// Behaviours
// ---------------------------------------------------------------------------

function speedMul(e: Enemy): number {
  let m = e.mem.spd ?? 1;
  if (e.slow > 0) m *= 0.55;
  if (e.elite === 'swift') m *= 1.5;
  return m;
}

function cdMul(e: Enemy): number {
  return e.elite === 'swift' ? 0.6 : 1;
}

/** Gunners currently aiming or firing (used as a simple attack-token limit). */
function gunnersAiming(g: GameScene): number {
  let n = 0;
  for (const o of g.enemies) if (o.alive && o.ai === 'gunner' && o.state === 'aim') n++;
  return n;
}

function walkToward(e: Enemy, tx: number, spd: number, dt: number): void {
  const dx = tx - e.x;
  const want = Math.abs(dx) < 4 ? 0 : Math.sign(dx) * spd;
  e.vx += (want - e.vx) * Math.min(1, dt * 8);
}

export function updateEnemy(e: Enemy, dt: number, g: GameScene): void {
  const p = g.player;
  const px = p.x;
  const py = p.y - 20;
  const dxp = px - e.x;
  const d = dist(e.x, e.y, px, py);
  e.st -= dt;

  switch (e.ai) {
    case 'crawler': {
      if (e.state === 'crouch') {
        // telegraphed pounce: brief shiver, then a leap straight at the player
        e.vx *= 0.7;
        e.mem.jit = 1;
        e.setAnim('walk');
        if (e.st <= 0) {
          e.state = 'pounce';
          e.vy = -rand(210, 250);
          e.vx = Math.sign(dxp || 1) * rand(170, 210);
          e.grounded = false;
          e.st = 0.9;
        }
        break;
      }
      if (e.state === 'pounce') {
        if (e.grounded && e.st < 0.7) {
          e.state = 'move';
          e.st = rand(1.6, 2.8);
        }
        break;
      }
      e.facing = dxp >= 0 ? 1 : -1;
      walkToward(e, px + (e.mem.offset ?? 0) * (Math.abs(dxp) > 60 ? 1 : 0.2), e.def.speed * speedMul(e), dt);
      if (e.grounded && e.st <= 0) {
        e.st = rand(1.4, 2.8);
        const canPounce = g.director.zoneIndex > 0 || g.director.zoneTime > 25;
        if (canPounce && Math.abs(dxp) < 95 && Math.abs(dxp) > 30 && chance(0.55)) {
          e.state = 'crouch';
          e.st = 0.32;
        } else if (Math.abs(dxp) < 90 && chance(0.5)) {
          // occasional hop keeps swarms lively
          e.vy = -rand(140, 210);
          e.grounded = false;
        }
      }
      e.setAnim('walk');
      break;
    }
    case 'capsule': {
      // supply capsule: falls, lands with a thud, then just sits there
      if (!e.grounded) {
        e.mem.falling = 1;
        if (Math.random() < 0.7) g.fx.p(e.x + rand(-3, 3), e.y - e.hh, rand(-10, 10), -rand(20, 50), 0.4, 0x8a8098, { size: 2 });
      } else if (e.mem.falling) {
        e.mem.falling = 0;
        g.cam.shake(0.18);
        g.fx.dust(e.x, GROUND_Y, 10);
        g.fx.ring(e.x, GROUND_Y - 6, 4, 30, 0.3, 0x6ef4ff, 1);
        audio.play('debris', { vol: 0.6, pitch: 1.4 });
      }
      e.vx = 0;
      e.setAnim('idle');
      if (Math.random() < 0.08) g.fx.p(e.x, e.y - e.hh - 2, 0, -30, 0.5, 0x6ef4ff, { add: true, size: 2 });
      break;
    }
    case 'charger': {
      if (e.state === 'move') {
        e.facing = dxp >= 0 ? 1 : -1;
        walkToward(e, px, e.def.speed * speedMul(e), dt);
        e.setAnim('walk');
        if (Math.abs(dxp) < 190 && Math.abs(p.y - (e.y + e.hh)) < 60 && e.st <= 0 && Math.abs(e.x - clamp(e.x, 20, ARENA_W - 20)) < 1) {
          e.state = 'windup';
          e.st = 0.65 * cdMul(e);
          e.vx = 0;
          e.mem.dir = e.facing;
          audio.play('enemy_charge', { vol: 0.7 });
          g.telegraph.line(e.x, GROUND_Y - 3, e.x + e.facing * 240, GROUND_Y - 3, e.st, 0xff5c7a, 3);
        }
      } else if (e.state === 'windup') {
        e.vx *= 0.8;
        e.setAnim('windup');
        e.mem.jit = 1;
        if (e.st <= 0) {
          e.state = 'charge';
          e.st = 0.95;
          e.mem.startX = e.x;
          audio.play('enemy_dash');
          g.fx.dust(e.x - e.facing * 10, GROUND_Y, 6, e.facing);
        }
      } else if (e.state === 'charge') {
        e.vx = (e.mem.dir ?? 1) * 330 * (e.elite === 'swift' ? 1.25 : 1);
        e.setAnim('charge');
        if (Math.random() < 0.5) g.fx.dust(e.x - e.facing * 12, GROUND_Y, 1, e.facing);
        const hitWall = e.x < 14 || e.x > ARENA_W - 14;
        if (e.st <= 0 || Math.abs(e.x - (e.mem.startX ?? e.x)) > 270 || hitWall) {
          e.state = 'recover';
          e.st = hitWall ? 1.4 : 0.8;
          e.vx = 0;
          if (hitWall) {
            g.cam.shake(0.15);
            g.fx.debris(e.x + e.facing * 12, e.y, [0x5a4a7a, 0x8a80a8], 6, 0.8);
            audio.play('hit_heavy');
          }
        }
      } else {
        e.vx *= 0.85;
        e.setAnim('stun');
        if (e.st <= 0) {
          e.state = 'move';
          e.st = rand(1.4, 2.4) * cdMul(e);
        }
      }
      break;
    }
    case 'gunner': {
      e.facing = dxp >= 0 ? 1 : -1;
      const ad = Math.abs(dxp);
      if (e.state === 'move') {
        let target = e.x;
        if (ad < 115) target = e.x - Math.sign(dxp) * 60;
        else if (ad > 185) target = px - Math.sign(dxp) * 150;
        walkToward(e, clamp(target, 16, ARENA_W - 16), e.def.speed * speedMul(e), dt);
        e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'aim');
        if (e.st <= 0 && ad < 280 && g.onScreen(e.x, 30) && !e.isElite && gunnersAiming(g) >= 2 + g.director.zoneIndex) {
          // attack tokens: only a few gunners may aim at once, so volleys stay readable
          e.st = rand(0.4, 0.9);
        } else if (e.st <= 0 && ad < 280 && g.onScreen(e.x, 30)) {
          e.state = 'aim';
          e.st = 0.6 * cdMul(e);
          // later in the run gunners fire short bursts
          e.mem.shots = e.elite === 'swift' ? 3 : g.director.zoneIndex >= 2 ? 3 : g.director.zoneIndex >= 1 || g.director.zoneTime > 70 ? 2 : 1;
        }
      } else if (e.state === 'aim') {
        e.vx *= 0.8;
        e.setAnim('aim');
        const mx = e.x + e.facing * 14;
        const my = e.y - 1;
        if (Math.random() < 0.5) g.fx.p(mx + rand(-2, 2), my + rand(-2, 2), 0, -10, 0.2, 0xff3ca0, { add: true });
        // aim laser: shows exactly where the shot will go
        if (g.onScreen(e.x, 10)) {
          const la = angleTo(mx, my, px, py);
          g.telegraph.line(mx, my, mx + Math.cos(la) * 70, my + Math.sin(la) * 70, dt * 1.5, 0xff5c7a, 1);
        }
        if (e.st <= 0) {
          const a = angleTo(mx, my, px, py);
          g.eshots.fire(mx, my, Math.cos(a) * 140, Math.sin(a) * 140, 'orb', 1);
          audio.play('enemy_shot');
          e.setAnim('fire');
          e.mem.recoil = 3;
          e.mem.shots = (e.mem.shots ?? 1) - 1;
          if ((e.mem.shots ?? 0) > 0) e.st = 0.16;
          else {
            e.state = 'move';
            e.st = rand(2.0, 3.0) * cdMul(e);
          }
        }
      }
      break;
    }
    case 'flyer': {
      if (e.state === 'move') {
        e.mem.t = (e.mem.t ?? rand(0, 6)) + dt;
        const hoverX = px + Math.sin(e.mem.t * 0.9 + (e.mem.offset ?? 0)) * 70;
        const hoverY = 80 + Math.sin(e.mem.t * 1.7) * 18 + (e.mem.offset ?? 0) * 0.8;
        const s = e.def.speed * speedMul(e);
        e.vx += (clamp((hoverX - e.x) * 2, -s, s) - e.vx) * Math.min(1, dt * 3);
        e.vy += (clamp((hoverY - e.y) * 2, -s, s) - e.vy) * Math.min(1, dt * 3);
        e.facing = e.vx >= 0 ? 1 : -1;
        e.setAnim('fly');
        if (e.st <= 0 && d < 220 && g.onScreen(e.x, 10)) {
          e.state = 'telegraph';
          e.st = 0.4 * cdMul(e);
          e.vx *= 0.2;
          e.vy *= 0.2;
        }
      } else if (e.state === 'telegraph') {
        e.vx *= 0.85;
        e.vy = -20;
        e.setAnim('dive');
        e.mem.jit = 1;
        if (e.st <= 0) {
          const a = angleTo(e.x, e.y, px, py);
          e.vx = Math.cos(a) * 260;
          e.vy = Math.sin(a) * 260;
          e.facing = e.vx >= 0 ? 1 : -1;
          e.state = 'dive';
          e.st = 0.9;
          audio.play('enemy_dash', { vol: 0.6, pitch: 1.4 });
        }
      } else if (e.state === 'dive') {
        e.setAnim('dive');
        if (e.y > GROUND_Y - 14) {
          e.vy = -Math.abs(e.vy) * 0.6;
          e.y = GROUND_Y - 14;
        }
        if (e.st <= 0) {
          e.state = 'move';
          e.st = rand(2.4, 3.8) * cdMul(e);
        }
      }
      e.sprite.setRotation(e.state === 'dive' ? Math.atan2(e.vy, Math.abs(e.vx)) * e.facing * 0.6 : 0);
      break;
    }
    case 'watcher': {
      e.mem.t = (e.mem.t ?? rand(0, 6)) + dt;
      const side = Math.sign(e.x - px) || 1;
      const hoverX = px + side * (130 + (e.mem.offset ?? 0));
      const hoverY = 72 + Math.sin(e.mem.t * 1.3) * 14;
      const s = e.def.speed * speedMul(e);
      if (e.state === 'move') {
        e.vx += (clamp((hoverX - e.x) * 1.5, -s, s) - e.vx) * Math.min(1, dt * 2);
        e.vy += (clamp((hoverY - e.y) * 1.5, -s, s) - e.vy) * Math.min(1, dt * 2);
        e.setAnim('float');
        if (e.st <= 0 && g.onScreen(e.x, 0)) {
          e.state = 'charge';
          e.st = 0.75 * cdMul(e);
          audio.play('laser_charge', { vol: 0.25, pitch: 2 });
        }
      } else {
        e.vx *= 0.9;
        e.vy *= 0.9;
        e.setAnim('charge');
        if (Math.random() < 0.6) g.fx.p(e.x + rand(-8, 8), e.y + rand(-8, 8), (e.x - (e.x + rand(-8, 8))) * 3, 0, 0.2, 0xff3ca0, { add: true });
        if (e.st <= 0) {
          const a = angleTo(e.x, e.y, px, py);
          const n = g.director.zoneIndex >= 2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const aa = a + (i - (n - 1) / 2) * 0.24;
            g.eshots.fire(e.x, e.y, Math.cos(aa) * 118, Math.sin(aa) * 118, 'orb', 1);
          }
          audio.play('enemy_shot', { pitch: 0.8 });
          e.state = 'move';
          e.st = rand(2.8, 3.6) * cdMul(e);
        }
      }
      e.facing = dxp >= 0 ? 1 : -1;
      break;
    }
    case 'shield': {
      // Turns slowly: gives the player a window to flank after jumping over.
      e.mem.turn = (e.mem.turn ?? 0) - dt;
      const want: 1 | -1 = dxp >= 0 ? 1 : -1;
      if (want !== e.facing && e.mem.turn <= 0) {
        e.mem.turn = 1.1;
        e.mem.pendingFace = want;
      }
      if (e.mem.pendingFace && e.mem.turn < 0.45) {
        e.facing = e.mem.pendingFace as 1 | -1;
        e.mem.pendingFace = 0;
      }
      if (e.state === 'move') {
        const facingPlayer = e.facing === want;
        walkToward(e, facingPlayer ? px : e.x, e.def.speed * speedMul(e), dt);
        e.setAnim('walk');
        if (facingPlayer && Math.abs(dxp) < 34 && e.st <= 0) {
          e.state = 'bash';
          e.st = 0.35;
          e.vx = 0;
        }
      } else {
        e.setAnim('bash');
        if (e.st <= 0.1 && !e.mem.bashed) {
          e.mem.bashed = 1;
          e.kbx = e.facing * 140;
          audio.play('hit_heavy', { pitch: 0.7 });
        }
        if (e.st <= -0.3) {
          e.state = 'move';
          e.mem.bashed = 0;
          e.st = 1.8;
        }
      }
      break;
    }
    case 'summoner': {
      e.facing = dxp >= 0 ? 1 : -1;
      e.mem.t = (e.mem.t ?? 0) + dt;
      const ad = Math.abs(dxp);
      if (e.state === 'move') {
        let target = e.x;
        if (ad < 170) target = e.x - Math.sign(dxp) * 60;
        else if (ad > 250) target = px - Math.sign(dxp) * 210;
        walkToward(e, clamp(target, 20, ARENA_W - 20), e.def.speed * speedMul(e), dt);
        e.setAnim('float');
        if (e.st <= 0 && g.onScreen(e.x, 40)) {
          e.state = 'cast';
          e.st = 1.0 * cdMul(e);
          e.mem.rx = clamp(e.x + e.facing * rand(30, 60), 20, ARENA_W - 20);
          audio.play('summon');
          g.telegraph.circle(e.mem.rx, GROUND_Y - 8, 12, e.st, 0xc890ff);
        }
      } else {
        e.vx *= 0.8;
        e.setAnim('cast');
        if (Math.random() < 0.7) g.fx.p((e.mem.rx ?? e.x) + rand(-10, 10), GROUND_Y - rand(0, 16), 0, -30, 0.4, 0xc890ff, { add: true });
        if (e.st <= 0) {
          const alive = g.enemies.filter((q) => q.alive && q.owner === e).length;
          const n = alive < 6 ? 2 : 0;
          for (let i = 0; i < n; i++) {
            const c = g.spawnEnemy('crawler', (e.mem.rx ?? e.x) + i * 10 - 5, GROUND_Y - 10, null);
            if (c) {
              c.summoned = true;
              c.owner = e;
              c.vy = -150;
            }
          }
          // ward nearby allies
          for (const q of g.enemies) {
            if (q !== e && q.alive && !q.external && dist(q.x, q.y, e.x, e.y) < 100) q.buffT = 4;
          }
          g.fx.ring(e.x, e.y, 4, 100, 0.4, 0xc890ff, 1);
          e.state = 'move';
          e.st = rand(4.5, 5.5) * cdMul(e);
        }
      }
      // hover
      e.y = GROUND_Y - e.hh - 6 + Math.sin(e.mem.t * 2) * 2;
      e.vy = 0;
      break;
    }
    case 'exploder': {
      if (e.state === 'move') {
        e.facing = dxp >= 0 ? 1 : -1;
        walkToward(e, px, e.def.speed * speedMul(e), dt);
        e.setAnim('roll');
        if (d < 38) {
          e.state = 'fuse';
          e.st = 0.62;
          e.vx *= 0.3;
        }
      } else {
        e.vx *= 0.9;
        e.setAnim('fuse');
        e.mem.beep = (e.mem.beep ?? 0) - dt;
        if (e.mem.beep <= 0) {
          e.mem.beep = 0.12;
          audio.play('fuse', { pitch: 1 + (0.62 - e.st) });
          e.flash = 0.05;
        }
        e.sprite.setScale(1 + (0.62 - Math.max(0, e.st)) * 0.25);
        if (e.st <= 0) {
          g.combat.detonateExploder(e, false);
        }
      }
      break;
    }
    case 'rift': {
      e.setAnim('idle');
      e.mem.t = (e.mem.t ?? 0) + dt;
      e.y = (e.mem.baseY ?? e.y) + Math.sin(e.mem.t * 2) * 2;
      if (Math.random() < 0.5) g.fx.p(e.x + rand(-6, 6), e.y + rand(-16, 16), rand(-10, 10), rand(-10, 10), 0.4, 0xff3ca0, { add: true });
      if (e.st <= 0) {
        e.st = rand(3.2, 4.2);
        const alive = g.enemies.filter((q) => q.alive && q.owner === e).length;
        if (alive < 4) {
          const pool: EnemyId[] = ['crawler', 'flyer', 'exploder', 'crawler'];
          const id = pool[Math.floor(Math.random() * pool.length)];
          const c = g.spawnEnemy(id, e.x, id === 'flyer' ? e.y : GROUND_Y - 10, null);
          if (c) {
            c.owner = e;
            c.summoned = true;
            g.fx.ring(e.x, e.y, 4, 26, 0.3, 0xff3ca0, 1);
            audio.play('summon', { vol: 0.5, pitch: 1.3 });
          }
        }
      }
      break;
    }
  }
}

/** Physics + sprite sync shared by all regular enemies. */
export function integrateEnemy(e: Enemy, dt: number): void {
  if (e.def.flying || e.ai === 'summoner' || e.ai === 'rift') {
    e.x += (e.vx + e.kbx) * dt;
    e.y += e.vy * dt;
    if (e.ai !== 'summoner' && e.ai !== 'rift') e.y = clamp(e.y, SKY_TOP, GROUND_Y - e.hh - 2);
  } else {
    e.vy += 900 * dt;
    e.x += (e.vx + e.kbx) * dt;
    e.y += e.vy * dt;
    const floor = GROUND_Y - e.hh;
    if (e.y >= floor) {
      e.y = floor;
      e.vy = 0;
      e.grounded = true;
    } else e.grounded = false;
  }
  e.kbx *= Math.exp(-9 * dt);
  e.x = clamp(e.x, -40, ARENA_W + 40);
}

export function renderEnemy(e: Enemy, dt: number, time: number): void {
  if (e.external) return;
  const spr = e.sprite;
  const frames = e.art.anims[e.anim] ?? [0];
  if (e.frozen <= 0 && e.stun <= 0) e.animT += dt;
  const fi = frames[Math.floor(e.animT * e.art.fps) % frames.length];
  spr.setFrame(fi);
  const drawY = e.def.flying || e.ai === 'rift' ? e.y : e.y + e.hh;
  let jx = 0;
  if (e.mem.jit) {
    jx = Math.round(rand(-1, 1));
    e.mem.jit = 0;
  }
  if (e.mem.recoil) {
    jx -= e.facing * Math.round(e.mem.recoil);
    e.mem.recoil = Math.max(0, e.mem.recoil - dt * 20);
  }
  spr.setPosition(Math.round(e.x) + jx, Math.round(drawY));
  spr.setFlipX(e.facing < 0);
  if (e.flash > 0) spr.setTintFill(0xffffff);
  else if (e.frozen > 0) spr.setTint(0x9ce8ff);
  else if (e.slow > 0) spr.setTint(0xc8f0ff);
  else if (e.burnT > 0) spr.setTint(Math.floor(time * 12) % 2 === 0 ? 0xffc090 : 0xffe0b0);
  else if (e.buffT > 0 && Math.floor(time * 8) % 2 === 0) spr.setTint(0xe0b0ff);
  else spr.clearTint();
  if (e.dying > 0) {
    const t = 1 - e.dying / e.dyingMax;
    spr.setTintFill(Math.floor(t * 12) % 2 === 0 ? 0xffffff : 0xff8ab0);
    spr.setScale(1 + t * 0.25, 1 - t * 0.35);
    spr.x += rand(-1.5, 1.5);
  } else if (e.ai !== 'exploder') {
    spr.setScale(1);
  }
}

export { randSign };
