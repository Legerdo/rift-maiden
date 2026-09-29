// The run: owns every gameplay system and the glue between them.

import Phaser from 'phaser';
import { ARENA_W, DEPTH, GAME_H, GAME_W, GROUND_Y } from '../core/constants';
import { clamp } from '../core/mathx';
import { rand, chance } from '../core/rng';
import { store, hasMeta, metaLv, unlockedPools, QA_ENABLED } from '../core/app';
import { WEAPONS, type WeaponId } from '../data/weapons';
import { ZONES, depthScale, MAX_DEPTH, type BossId } from '../data/zones';
import { ENEMIES, type EnemyId, type EliteMod } from '../data/enemies';
import { COMBO, PLAYER, ELITE_QUICK_KILL, comboMultiplier, comboTier, runShardBonus, xpForLevel } from '../data/balance';
import { UPGRADE_MAP, rollOffers, type UpgradeDef, type UpgradeId } from '../data/upgrades';
import type { SkillId } from '../data/skills';
import { META } from '../data/meta';
import { audio } from '../audio/audio';
import { t, upgradeName } from '../localization/i18n';
import { Build } from '../game/build';
import { Player, type Intent } from '../game/player';
import { Enemy, updateEnemy, integrateEnemy, renderEnemy, type BossLink } from '../game/enemy';
import { SpatialGrid } from '../game/spatial';
import { PlayerShots, EnemyShots } from '../game/shots';
import { Pickups } from '../game/pickups';
import { Fx } from '../game/fx';
import { CameraRig } from '../game/camera';
import { Combat, type DmgSource } from '../game/combat';
import { Automation } from '../game/automation';
import { Skills } from '../game/skills';
import { Director, type RiftEventKind } from '../game/director';
import { createBoss, type BossCtl } from '../game/bosses';
import { Telegraph } from '../game/telegraph';
import { Background } from '../game/background';
import { Tutorial } from '../game/tutorial';
import { botIntent } from '../game/bot';

export interface RunState {
  time: number;
  kills: number;
  level: number;
  xp: number;
  xpNext: number;
  combo: number;
  comboT: number;
  comboDecayT: number;
  bestCombo: number;
  shardsPicked: number;
  bosses: number;
  zonesCleared: number;
  pendingLevels: number;
  pendingCores: number;
  startPick: boolean;
  rerolls: number;
  perfectDodges: number;
  victory: boolean;
  eliteKills: number;
}

export interface RunSummary {
  victory: boolean;
  time: number;
  kills: number;
  bosses: number;
  bestCombo: number;
  level: number;
  zoneIndex: number;
  shardsPicked: number;
  shardBonus: number;
  shardsTotal: number;
  build: { id: string; lv: number }[];
  weapon: WeaponId;
  depth: number;
  depthUnlocked: number;
  records: string[];
  canBuy: string[];
}

export interface GameInit {
  weapon: WeaponId;
  skillQ: SkillId;
  skillE: SkillId;
  depth: number;
}

export interface LevelUpRequest {
  kind: 'level' | 'core' | 'start';
  offers: UpgradeDef[];
}

export class GameScene extends Phaser.Scene {
  run!: RunState;
  build!: Build;
  player!: Player;
  enemies: Enemy[] = [];
  private pool: Enemy[] = [];
  grid = new SpatialGrid<Enemy>(32);
  shots!: PlayerShots;
  eshots!: EnemyShots;
  pickups!: Pickups;
  fx!: Fx;
  cam!: CameraRig;
  combat!: Combat;
  auto!: Automation;
  skills!: Skills;
  director!: Director;
  telegraph!: Telegraph;
  bg!: Background;
  tutorial!: Tutorial;
  boss: BossCtl | null = null;
  beamFx = { active: false, x0: 0, y0: 0, x1: 0, y1: 0, power: 1, hit: false, prism: [] as number[] };
  private beamG!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Rectangle;
  private dark!: Phaser.GameObjects.Rectangle;
  private darkTarget = 0;
  private hitstopT = 0;
  private slowT = 0;
  private slowScale = 1;
  fireBlocked = false;
  god = false;
  bot = false;
  ended = false;
  private levelUpDelay = -1;
  private initData!: GameInit;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private rightPressed = false;
  private pressed = new Set<string>();
  private startX = 0;
  private endT = -1;
  private deadTimer = -1;
  /** QA: where damage came from. */
  hurtLog: string[] = [];
  /** QA: recent level-up offers. */
  offerLog: string[] = [];

  constructor() {
    super('Game');
  }

  init(data: GameInit): void {
    this.initData = data;
  }

  create(): void {
    const d = this.initData;
    this.enemies = [];
    this.pool = [];
    this.boss = null;
    this.ended = false;
    this.endT = -1;
    this.deadTimer = -1;
    this.levelUpDelay = -1;
    this.hitstopT = 0;
    this.slowT = 0;
    this.darkTarget = 0;
    this.fireBlocked = false;
    this.bot = false;
    this.god = false;
    this.cameras.main.setBackgroundColor(0x07050d);
    this.cameras.main.setRoundPixels(true);

    this.build = new Build(WEAPONS[d.weapon]);
    if (hasMeta('g_startdrone')) this.build.add('drone');
    this.run = {
      time: 0,
      kills: 0,
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      combo: 0,
      comboT: 0,
      comboDecayT: 0,
      bestCombo: 0,
      shardsPicked: 0,
      bosses: 0,
      zonesCleared: 0,
      pendingLevels: 0,
      pendingCores: 0,
      startPick: hasMeta('g_startpick'),
      rerolls: 1 + metaLv('g_reroll'),
      perfectDodges: 0,
      victory: false,
      eliteKills: 0,
    };

    this.bg = new Background(this);
    this.telegraph = new Telegraph(this);
    this.fx = new Fx(this);
    this.cam = new CameraRig(this.cameras.main);
    this.shots = new PlayerShots(this);
    this.eshots = new EnemyShots(this);
    this.pickups = new Pickups(this);
    this.combat = new Combat(this);
    this.tutorial = new Tutorial();
    this.startX = 240;
    this.player = new Player(this, this.startX);
    this.player.maxHp = PLAYER.maxHp + metaLv('b_hp');
    this.player.hp = this.player.maxHp;
    this.player.reviveAvailable = hasMeta('g_revive');
    this.auto = new Automation(this);
    this.skills = new Skills(this, d.skillQ, d.skillE);
    this.director = new Director(this, d.depth);
    this.beamG = this.add.graphics().setDepth(DEPTH.PLAYER_SHOT + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.overlay = this.add.rectangle(0, 0, GAME_W + 40, GAME_H + 40, 0xffffff, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(90);
    this.overlay.setPosition(-20, -20);
    this.dark = this.add.rectangle(-20, -20, GAME_W + 40, GAME_H + 40, 0x10000a, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.BG_NEAR + 0.8);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      A: kb.addKey(K.A),
      D: kb.addKey(K.D),
      LEFT: kb.addKey(K.LEFT),
      RIGHT: kb.addKey(K.RIGHT),
      W: kb.addKey(K.W),
      UP: kb.addKey(K.UP),
      SPACE: kb.addKey(K.SPACE),
      SHIFT: kb.addKey(K.SHIFT),
      Q: kb.addKey(K.Q),
      E: kb.addKey(K.E),
      ESC: kb.addKey(K.ESC),
      P: kb.addKey(K.P),
    };
    kb.addCapture([K.SPACE, K.UP, K.DOWN, K.LEFT, K.RIGHT]);
    // Buffer key presses so taps shorter than a frame are never lost.
    this.pressed.clear();
    kb.on('keydown', (ev: KeyboardEvent) => {
      if (!ev.repeat) this.pressed.add(ev.code);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.rightPressed = true;
      audio.unlock();
    });
    this.game.events.on('blur', this.onBlur, this);
    this.events.on('resume', () => this.pressed.clear());
    this.events.once('shutdown', () => {
      this.game.events.off('blur', this.onBlur, this);
      audio.stopAllLoops();
      this.player?.destroy();
    });

    this.director.startZone(0);
    this.cam.snapTo(this.player.x);
    this.scene.launch('Hud', { game: this });
    this.scene.bringToTop('Hud');
    if (QA_ENABLED) this.installQa();
  }

  private onBlur(): void {
    if (!this.ended && this.scene.isActive() && !this.player.dead) this.openPause();
  }

  // ------------------------------------------------------------------ helpers
  onScreen(x: number, margin = 0): boolean {
    return x > this.cam.x - margin && x < this.cam.x + GAME_W + margin;
  }

  hitstop(ms: number): void {
    this.hitstopT = Math.max(this.hitstopT, Math.min(0.12, ms / 1000));
  }

  slowmo(scale: number, dur: number): void {
    this.slowScale = scale;
    this.slowT = Math.max(this.slowT, dur);
  }

  flash(color: number, alpha: number): void {
    this.overlay.setFillStyle(color, 1);
    this.overlay.setAlpha(Math.max(this.overlay.alpha, alpha));
  }

  setDarkness(a: number): void {
    this.darkTarget = a;
  }

  hudPulse(kind: string): void {
    this.events.emit('pulse', kind);
  }

  banner(text: string, sub = '', color = 0xffffff, dur = 2.2): void {
    this.events.emit('banner', { text, sub, color, dur });
  }

  spawnEnemy(id: EnemyId, x: number, y: number, elite: EliteMod | null): Enemy | null {
    let alive = 0;
    for (const e of this.enemies) if (e.alive) alive++;
    if (alive > 150) return null;
    const e = this.pool.pop() ?? new Enemy(this);
    e.init(id, x, y, this.director.hpMul, this.run.time, id === 'rift' ? null : elite);
    this.enemies.push(e);
    return e;
  }

  spawnExternal(x: number, y: number, hw: number, hh: number, hp: number, link: BossLink, threat: number): Enemy {
    const e = this.pool.pop() ?? new Enemy(this);
    e.initExternal(x, y, hw, hh, hp, link, threat);
    this.enemies.push(e);
    return e;
  }

  addXp(v: number): void {
    const r = this.run;
    r.xp += v;
    let guard = 0;
    while (r.xp >= r.xpNext && guard++ < 50) {
      r.xp -= r.xpNext;
      r.level++;
      r.xpNext = xpForLevel(r.level);
      r.pendingLevels++;
    }
    this.hudPulse('xp');
  }

  // ------------------------------------------------------------------ events from systems
  onEnemyKilled(e: Enemy, source: DmgSource, crit: boolean): void {
    const r = this.run;
    const b = this.build;
    r.kills++;
    this.addCombo();
    this.auto.onKill();
    const big = e.isElite || e.def.hp >= 40;
    audio.play(big ? 'kill_big' : 'kill', { vol: big ? 0.8 : 0.6, pitch: big ? 1 : rand(0.9, 1.15) });
    if (e.isElite) {
      this.hitstop(70);
      this.cam.shake(0.35);
      this.cam.punch(0.02);
      r.eliteKills++;
    } else if (big) this.cam.shake(0.08);
    if (crit && big) this.hitstop(30);

    // endless overdrive: kills extend the skill
    const p = this.player;
    if (p.overdriveT > 0 && b.has('sk_od_plus') && p.odExtended < 6) {
      p.overdriveT += 0.4;
      p.odExtended += 0.4;
    }

    // rewards
    const z = this.director.zone;
    let xp = e.def.xp * z.xpMul * comboMultiplier(r.combo) * b.rewardMul * (this.director.surge ? 1.6 : 1);
    if (e.lastHitWeak) xp *= 1.5;
    if (b.pointblankMul > 0 && Math.abs(e.x - this.player.x) < b.pointblankRange) xp *= 1.5;
    if (e.summoned) xp *= 0.5;
    if (e.isElite) xp *= 7;
    e.mem.xpDrop = xp;
    let shards = 0;
    const ds = depthScale(this.director.depth);
    if (e.isElite) shards += 3;
    if (Math.random() < e.def.shardChance * (e.lastHitWeak ? 2 : 1)) shards += 1;
    if (e.ai === 'rift') {
      shards += 2;
      this.banner(t('banner.riftClosed'), '', 0xff9ad0, 1.3);
      audio.play('rift_close');
    }
    if (e.ai === 'capsule') {
      shards += 4;
      e.mem.healDrop = 1;
      this.cam.shake(0.15);
      audio.play('pickup_core');
    }
    e.mem.cores = 0;
    if (e.isElite) {
      // Elites only pay out a core when taken down quickly: a skill reward that
      // also keeps the number of picks per run in check.
      if (!e.mem.bounty && this.run.time - e.spawnAt < ELITE_QUICK_KILL) {
        e.mem.cores = 1;
        this.fx.text(e.x, e.top - 14, t('banner.quickKill'), 0xffcf4a, 'body', 1);
      }
      if (b.has('c_hunter')) e.mem.cores += 1;
    }
    if (e.mem.bounty) {
      e.mem.cores += 1;
      shards += 6;
      r.combo += 10;
      this.flash(0xffcf4a, 0.25);
      this.hitstop(90);
      audio.play('fusion', { vol: 0.8 });
    }
    e.mem.shardDrop = Math.round(shards * ds.shards * (1 + 0.15 * metaLv('b_shard')) * b.rewardMul);
    if (b.has('combo_heal') && r.combo > 0 && r.combo % 30 === 0) this.player.heal(1);
    if (r.kills >= 3) this.tutorial.done('shoot');
  }

  private finalizeDeath(e: Enemy): void {
    const fx = this.fx;
    const big = e.isElite || e.def.hp >= 40;
    fx.debris(e.x, e.y, e.def.debris, big ? 14 : 6, big ? 1.3 : 1);
    fx.sparks(e.x, e.y, big ? 16 : 7, [0xffffff, ...e.def.debris], big ? 180 : 120, 0, Math.PI * 2, 0.3);
    fx.glow(e.x, e.y, big ? 10 : 4, 0xff8ad0, 60, 0.45);
    if (big) fx.ring(e.x, e.y, 4, e.isElite ? 46 : 26, 0.25, 0xffffff, e.isElite ? 2 : 1);
    if (e.isElite) fx.explosion(e.x, e.y, 30);
    const xp = e.mem.xpDrop ?? 0;
    if (xp > 0) this.pickups.xp(e.x, e.y - 2, xp);
    if (e.mem.shardDrop) this.pickups.shard(e.x, e.y - 2, e.mem.shardDrop);
    for (let i = 0; i < (e.mem.cores ?? 0); i++) this.pickups.core(e.x + i * 8, e.y - 4);
    if (e.mem.healDrop) this.pickups.heal(e.x, e.y - 4);
    else if (!e.isElite && !e.summoned && chance(0.012)) this.pickups.heal(e.x, e.y - 2);
    e.release();
  }

  private addCombo(): void {
    const r = this.run;
    const before = comboTier(r.combo);
    r.combo++;
    r.comboT = COMBO.window;
    r.comboDecayT = COMBO.decayStep;
    r.bestCombo = Math.max(r.bestCombo, r.combo);
    const after = comboTier(r.combo);
    if (after > before) {
      audio.play('combo_tier', { pitch: 1 + after * 0.12 });
      this.hudPulse('combo');
      this.fx.ring(this.player.x, this.player.centerY, 4, 30 + after * 8, 0.3, COMBO.tiers[after].color, 1);
    }
  }

  onPlayerHurt(dmg: number, src = '?'): void {
    const r = this.run;
    this.hurtLog.push(`${Math.round(r.time)}s:${src}`);
    r.combo = this.build.has('combo_heal') ? Math.floor(r.combo * 0.75) : Math.floor(r.combo / 2);
    this.hitstop(80);
    this.cam.shake(0.42);
    this.cam.kick(0, 3);
    this.flash(0xff2a4a, 0.28);
    audio.play('hurt');
    this.hudPulse('hurt');
    this.fx.sparks(this.player.x, this.player.centerY, 10, [0xff5c7a, 0xffffff], 140);
    if (this.build.has('retaliate') && this.player.hp > 0) {
      const p = this.player;
      const R = 95;
      this.director.later(0.02, () => {
        this.fx.ring(p.x, p.centerY, 6, R, 0.3, 0x6ef4ff, 3);
        this.eshots.clearCircle(p.x, p.centerY, R);
        for (const e of this.enemies.slice()) {
          if (!e.alive || e.dying > 0 || !e.targetable) continue;
          if (Math.hypot(e.x - p.x, e.y - p.centerY) > R + e.hw) continue;
          this.combat.damage(e, 36 * this.director.hpMul, { source: 'skill', canCrit: false, knockX: Math.sign(e.x - p.x || 1) * 280 });
        }
        audio.play('shockwave', { vol: 0.7, pitch: 1.3 });
      });
      p.iframes += 0.45;
    }
    void dmg;
  }

  onRevive(): void {
    this.banner(t('banner.revive'), '', 0x9cff8a, 1.8);
    audio.play('revive');
    this.flash(0x9cff8a, 0.4);
    this.eshots.clearCircle(this.player.x, this.player.centerY, 200);
    this.fx.ring(this.player.x, this.player.centerY, 6, 120, 0.5, 0x9cff8a, 2);
  }

  onPlayerDeath(): void {
    this.slowmo(0.4, 1.4);
    this.cam.shake(0.6);
    this.flash(0xff2a4a, 0.5);
    audio.stopMusic(1.2);
    audio.play('defeat');
    this.deadTimer = 3.0;
    this.fireBlocked = true;
  }

  onEliteSpawn(e: Enemy): void {
    const name = `${t('elite.prefix')} · ${t(`elite.${e.elite}`)} ${t(`enemy.${e.ai}`)} · ${t('banner.eliteHint', { s: ELITE_QUICK_KILL })}`;
    this.banner(t('banner.elite'), name, 0xffcf4a, 2);
    audio.play('boss_warn', { vol: 0.25, pitch: 1.6 });
    e.hpBarT = 99;
  }

  onZoneStart(i: number): void {
    const z = ZONES[i];
    this.bg.build(z.theme);
    audio.playMusic(z.music);
    if (i > 0) {
      this.player.resetForZone(this.startX);
      this.player.heal(2);
    }
    this.cam.snapTo(this.player.x);
    this.banner(t(`zone.${z.id}`), `${t('zone.label', { n: i + 1 })} · ${t(`zone.${z.id}.sub`)}`, 0xffffff, 2.8);
    store.data.stats.deepestZone = Math.max(store.data.stats.deepestZone, i + 1);
  }

  onBossWarning(): void {
    this.events.emit('bossWarn');
    audio.play('boss_warn');
    audio.stopMusic(1.5);
    this.flash(0xff2a4a, 0.15);
  }

  startBoss(id: BossId, hpMul: number): void {
    this.boss = createBoss(this, id, hpMul);
    audio.playMusic(3);
    this.tutorial.hint(id === 'warden' ? 'hint.bossWarden' : 'hint.bossOrbis');
    this.events.emit('bossStart', this.boss);
  }

  onBossDying(_b: BossCtl): void {
    this.slowmo(0.35, 1.6);
    this.eshots.clear();
    this.telegraph.clear();
    // every other enemy pops in a rippling wave
    let k = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.dying > 0 || e.external) continue;
      const q = e;
      this.director.later(0.05 + k * 0.035, () => {
        if (q.alive && q.dying <= 0) this.combat.damage(q, 1e9, { source: 'skill', canCrit: false, quiet: true });
      });
      k++;
    }
  }

  onBossDefeated(b: BossCtl): void {
    const r = this.run;
    r.bosses++;
    r.zonesCleared++;
    store.data.stats.bossesDefeated++;
    const shards = Math.round((b.id === 'warden' ? 18 : 30) * depthScale(this.director.depth).shards * (1 + 0.15 * metaLv('b_shard')));
    this.pickups.shard(b.x, b.y - 40, shards);
    this.pickups.xp(b.x, b.y - 40, b.id === 'warden' ? 60 : 120);
    if (!this.director.isLastZone) this.pickups.core(b.x, b.y - 50);
    this.pickups.vacuumAll(true);
    this.director.onBossDefeated();
    this.hitstop(120);
    const last = this.director.isLastZone;
    this.banner(last ? t('banner.victory') : t('banner.zoneClear'), t(b.nameKey), last ? 0xffcf4a : 0x9cff8a, 3);
    audio.play(last ? 'victory' : 'levelup');
    this.time.delayedCall(1200, () => {
      if (this.boss === b) {
        b.destroy();
        this.boss = null;
      }
    });
  }

  onFinaleStart(): void {
    this.banner(t('banner.eliteRush'), '', 0xff5c7a, 2.4);
    audio.play('boss_warn', { vol: 0.6 });
  }

  onZoneCleared(_boss: boolean): void {
    this.run.zonesCleared++;
    this.banner(t('banner.eliteRushClear'), t('banner.next'), 0x9cff8a, 2.6);
    this.pickups.vacuumAll(true);
    audio.play('levelup');
    this.eshots.clear();
    for (const e of this.enemies) if (e.alive && e.dying <= 0 && !e.external) this.combat.damage(e, 1e9, { source: 'skill', quiet: true });
  }

  onRiftEvent(kind: RiftEventKind, start: boolean, success: boolean): void {
    if (start) {
      const col = kind === 'surge' ? 0xff5c7a : kind === 'bounty' ? 0xffcf4a : kind === 'rain' ? 0x9cff8a : 0x6ef4ff;
      this.banner(t(`event.${kind}`), t(`event.${kind}.sub`), col, 2.2);
      audio.play(kind === 'surge' ? 'boss_warn' : 'upgrade', { vol: kind === 'surge' ? 0.45 : 0.7, pitch: kind === 'surge' ? 1.3 : 1 });
      if (kind === 'surge') this.setDarkness(0.18);
      this.events.emit('riftEvent', kind);
    } else {
      if (kind === 'surge') this.setDarkness(0);
      if (kind === 'bounty') {
        this.banner(success ? t('event.bountyDone') : t('event.bountyFail'), '', success ? 0xffcf4a : 0x8a80b0, 1.6);
        if (!success) audio.play('ui_back');
      }
      this.events.emit('riftEvent', null);
    }
  }

  warpToZone(i: number): void {
    audio.play('zone_warp');
    this.auto.clearTurrets();
    this.fireBlocked = true;
    this.flash(0xffffff, 0.6);
    this.cameras.main.fadeOut(500, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.pickups.vacuumAll(false);
      this.pickups.clear();
      this.eshots.clear();
      this.shots.clear();
      this.telegraph.clear();
      for (const e of this.enemies) if (!e.external) e.release();
      this.enemies = this.enemies.filter((e) => e.alive);
      this.fx.clearAll();
      this.director.startZone(i);
      this.fireBlocked = false;
      this.cameras.main.fadeIn(500, 255, 255, 255);
    });
  }

  onVictory(): void {
    this.run.victory = true;
    this.player.victory = true;
    this.player.stopBeam();
    this.fireBlocked = true;
    this.endT = 3.2;
    audio.stopMusic(2);
  }

  // ------------------------------------------------------------------ upgrades
  openLevelUp(): void {
    const r = this.run;
    let kind: LevelUpRequest['kind'] = 'level';
    if (r.startPick) kind = 'start';
    else if (r.pendingCores > 0 && r.pendingLevels === 0) kind = 'core';
    const offers = this.rollUpgradeOffers(kind === 'core');
    this.player.stopBeam();
    audio.duck(true);
    this.scene.pause();
    this.scene.launch('LevelUp', { game: this, kind, offers } as LevelUpRequest & { game: GameScene });
  }

  rollUpgradeOffers(core: boolean): UpgradeDef[] {
    const ctx = {
      weapon: this.build.weapon.id,
      levels: this.build.levels,
      unlockedPools: unlockedPools(),
      level: this.run.level,
      skills: [...this.skills.slots],
    };
    let offers = rollOffers(ctx, 3);
    if (core && offers.every((o) => o.rarity === 'common')) {
      const better = rollOffers(ctx, 8).find((o) => (o.rarity === 'rare' || o.rarity === 'legendary') && !offers.includes(o));
      if (better) offers[offers.length - 1] = better;
    }
    offers = offers.slice(0, 3);
    if (QA_ENABLED) {
      this.offerLog.push(`L${this.run.level}:${offers.map((o) => o.id).join('/')}`);
      if (this.offerLog.length > 40) this.offerLog.shift();
    }
    return offers;
  }

  /** Called by the LevelUp scene. `id` may be a fallback card. */
  applyUpgrade(id: string, kind: LevelUpRequest['kind']): void {
    const r = this.run;
    if (kind === 'start') r.startPick = false;
    else if (kind === 'core') r.pendingCores = Math.max(0, r.pendingCores - 1);
    else r.pendingLevels = Math.max(0, r.pendingLevels - 1);
    const p = this.player;
    if (id === 'fallback_heal') p.heal(2);
    else if (id === 'fallback_shard') r.shardsPicked += 6;
    else {
      const def = UPGRADE_MAP[id];
      const lv = this.build.add(id as UpgradeId);
      if (id === 'vitality') {
        p.maxHp += 1;
        p.heal(2);
      }
      if (id === 'barrier' && lv === 1) {
        p.barrierUp = true;
        p.barrierT = this.build.barrierCooldown;
      }
      if (id === 'phase_dash') p.dashCharges = this.build.dashCharges;
      if (id === 'ov_life') {
        p.maxHp += 1;
        p.heal(1);
      }
      if (id === 'c_glass') {
        p.maxHp = Math.max(1, p.maxHp - 2);
        p.hp = Math.min(p.hp, p.maxHp);
        this.flash(0xff4a6a, 0.3);
      }
      if (def?.rarity === 'curse') audio.play('boss_roar', { pitch: 1.8, vol: 0.5 });
      if (id === 'awaken') {
        const w = this.build.weapon.id;
        this.banner(t('banner.awaken'), t(`awaken.${w}`), 0xffe08a, 2.4);
        this.flash(0xffe08a, 0.45);
        this.cam.shake(0.3);
        this.cam.punch(0.04);
        this.fx.ring(p.x, p.centerY, 6, 120, 0.5, 0xffe08a, 3);
        audio.play('fusion');
      }
      this.fx.text(p.x, p.y - 64, `${upgradeName(id)}${def?.maxLevel && def.maxLevel > 1 ? ` Lv${lv}` : ''}`, def?.fusion ? 0xffcf4a : 0x9cf8ff, 'body', 1.4);
      if (def?.fusion) {
        this.banner(t('banner.fusion'), upgradeName(id), 0xffcf4a, 2);
        this.flash(0xffcf4a, 0.3);
        audio.play('fusion');
      }
    }
    this.fx.ring(p.x, p.centerY, 4, 60, 0.4, 0x9cf8ff, 2);
    this.fx.sparks(p.x, p.centerY, 24, [0x9cf8ff, 0xffffff, 0xffe860], 200);
    this.tutorial.done('xp');
    // a moment of slow-motion to see the change
    this.slowmo(0.5, 0.25);
    this.levelUpDelay = -1;
  }

  // ------------------------------------------------------------------ pause / end
  openPause(): void {
    if (this.ended || !this.scene.isActive('Game')) return;
    this.player.stopBeam();
    audio.duck(true);
    this.scene.pause();
    this.scene.launch('Pause', { game: this });
  }

  giveUp(): void {
    this.endRun(false);
  }

  private endRun(victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    audio.stopAllLoops();
    audio.duck(false);
    const r = this.run;
    const st = store.data.stats;
    const records: string[] = [];
    const zoneIndex = this.director.zoneIndex;
    const bonus = Math.round(
      runShardBonus(r.kills, r.zonesCleared, r.bosses, r.time, victory) * depthScale(this.director.depth).shards * (1 + 0.15 * metaLv('b_shard')),
    );
    const total = r.shardsPicked + bonus;
    if (r.time > st.bestTime) records.push('time');
    if (r.bestCombo > st.bestCombo) records.push('combo');
    st.runs++;
    st.kills += r.kills;
    st.bestTime = Math.max(st.bestTime, r.time);
    st.bestCombo = Math.max(st.bestCombo, r.bestCombo);
    st.bestLevel = Math.max(st.bestLevel, r.level);
    st.totalShards += total;
    store.data.shards += total;
    let depthUnlocked = 0;
    if (victory) {
      st.clears++;
      const d = this.director.depth;
      if (d >= store.data.maxDepth && d < MAX_DEPTH) {
        store.data.maxDepth = d + 1;
        depthUnlocked = d + 1;
      }
    }
    store.data.tutorialDone = true;
    store.save();
    const canBuy: string[] = [];
    for (const m of META) {
      const lv = store.data.meta[m.id] ?? 0;
      if (lv < m.costs.length && m.costs[lv] <= store.data.shards) canBuy.push(m.id);
    }
    const summary: RunSummary = {
      victory,
      time: r.time,
      kills: r.kills,
      bosses: r.bosses,
      bestCombo: r.bestCombo,
      level: r.level,
      zoneIndex,
      shardsPicked: r.shardsPicked,
      shardBonus: bonus,
      shardsTotal: total,
      build: this.build.order.map((id) => ({ id, lv: this.build.lv(id) })),
      weapon: this.build.weapon.id,
      depth: this.director.depth,
      depthUnlocked,
      records,
      canBuy: canBuy.slice(0, 3),
    };
    this.scene.stop('Hud');
    this.scene.stop('LevelUp');
    this.scene.stop('Pause');
    this.scene.start('Result', { summary, init: this.initData });
  }

  // ------------------------------------------------------------------ input
  private readIntent(realDt: number): Intent {
    const k = this.keys;
    const pr = this.pressed;
    const p = this.input.activePointer;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const it: Intent = {
      move: (k.A.isDown || k.LEFT.isDown ? -1 : 0) + (k.D.isDown || k.RIGHT.isDown ? 1 : 0),
      jumpPressed: pr.has('KeyW') || pr.has('Space') || pr.has('ArrowUp'),
      jumpHeld: k.W.isDown || k.SPACE.isDown || k.UP.isDown,
      dashPressed: pr.has('ShiftLeft') || pr.has('ShiftRight') || this.rightPressed,
      fire: p.leftButtonDown(),
      skill1: pr.has('KeyQ'),
      skill2: pr.has('KeyE'),
      aimX: w.x,
      aimY: w.y,
    };
    this.rightPressed = false;
    pr.clear();
    if (this.bot) return botIntent(this, realDt);
    return it;
  }

  // ------------------------------------------------------------------ main loop
  update(_time: number, delta: number): void {
    const realDt = Math.min(delta / 1000, 1 / 20);
    if (this.pressed.has('Escape') || this.pressed.has('KeyP')) {
      this.pressed.clear();
      this.openPause();
      return;
    }
    let dt = realDt;
    if (this.hitstopT > 0) {
      this.hitstopT -= realDt;
      dt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      dt = realDt * this.slowScale;
    }

    const it = this.readIntent(realDt);
    if (dt > 0) this.step(dt, it);

    // presentation (runs in real time so hit-stop freezes the world but not the camera)
    this.fx.update(dt);
    this.telegraph.update(dt);
    this.bg.update(realDt, this.cam.x);
    this.cam.focusX = this.boss && this.boss.alive ? this.boss.x : null;
    this.cam.focusWeight = this.boss && this.boss.alive ? 0.32 : 0;
    this.cam.update(realDt, this.player.x, this.player.dead ? 0 : Math.cos(this.player.aimAng), this.player.vx);
    this.player.render(dt);
    for (const e of this.enemies) if (e.alive) renderEnemy(e, dt, this.run.time);
    this.drawBeam();
    this.overlay.setAlpha(Math.max(0, this.overlay.alpha - realDt * 2.4));
    this.dark.setAlpha(this.dark.alpha + (this.darkTarget - this.dark.alpha) * Math.min(1, realDt * 2));

    // level-up trigger
    const r = this.run;
    if (!this.ended && !this.player.dead && !this.player.victory && this.director.state !== 'warp' && this.director.state !== 'victory') {
      if (r.startPick && r.time > 0.4) this.openLevelUp();
      else if (r.pendingLevels + r.pendingCores > 0) {
        if (this.levelUpDelay < 0) {
          this.levelUpDelay = 0.4;
          audio.play(r.pendingLevels > 0 ? 'levelup' : 'pickup_core');
          this.fx.ring(this.player.x, this.player.centerY, 6, 70, 0.4, r.pendingLevels > 0 ? 0x9cff8a : 0xffcf4a, 2);
          this.fx.sparks(this.player.x, this.player.centerY, 20, [0x9cff8a, 0xffffff], 160, -Math.PI / 2, 2.4);
          this.fx.text(this.player.x, this.player.y - 60, r.pendingLevels > 0 ? t('banner.levelup') : t('banner.core'), r.pendingLevels > 0 ? 0x9cff8a : 0xffcf4a, 'big', 0.8);
          this.slowmo(0.35, 0.4);
        } else {
          this.levelUpDelay -= realDt;
          if (this.levelUpDelay <= 0) this.openLevelUp();
        }
      }
    }

    if (this.deadTimer > 0) {
      this.deadTimer -= realDt;
      if (this.deadTimer <= 0) this.endRun(false);
    }
    if (this.endT > 0) {
      this.endT -= realDt;
      if (this.endT <= 0) this.endRun(true);
    }
  }

  private step(dt: number, it: Intent): void {
    const r = this.run;
    const p = this.player;
    if (!p.dead && !p.victory) r.time += dt;

    p.update(dt, it);
    if (Math.abs(p.x - this.startX) > 40) this.tutorial.done('move');
    if (!p.grounded && p.vy < 0 && p.dashT <= 0) this.tutorial.done('jump');
    if (p.dashT > 0) this.tutorial.done('dash');
    this.tutorial.update(dt);

    this.auto.update(dt);
    this.skills.update(dt);
    this.director.update(dt);
    this.combat.update(dt);
    if (this.boss && this.boss.alive) this.boss.update(dt);

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.dying > 0) {
        if (e.external) continue;
        e.dying -= dt;
        e.x += e.kbx * dt * 0.5;
        if (e.dying <= 0) this.finalizeDeath(e);
        continue;
      }
      e.flash = Math.max(0, e.flash - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.slow = Math.max(0, e.slow - dt);
      e.buffT = Math.max(0, e.buffT - dt);
      e.hpBarT = Math.max(0, e.hpBarT - dt);
      if (e.frozen > 0) {
        e.frozen -= dt;
        if (e.frozen <= 0) this.fx.sparks(e.x, e.y, 6, [0xa8ecff, 0xffffff], 60);
      }
      if (e.burnT > 0) {
        this.combat.tickBurn(e, dt);
        if (e.dying > 0 || !e.alive) continue;
      }
      if (!e.external) {
        if (e.frozen > 0 || e.stun > 0) {
          e.vx *= 0.8;
          if (e.def.flying) e.vy *= 0.8;
        } else updateEnemy(e, dt, this);
        integrateEnemy(e, dt);
      }
      // contact damage
      if (e.contact && e.frozen <= 0 && e.dying <= 0 && !p.dead) {
        if (Math.abs(e.x - p.x) < e.hw + PLAYER.hitboxHW - 2 && Math.abs(e.y - (p.y - PLAYER.hitboxHH)) < e.hh + PLAYER.hitboxHH - 3) {
          p.hurt(e.mem.contactDmg ?? e.def.contactDmg, e.x, e.external ? 'boss' : e.ai);
        }
      }
    }
    // cleanup + grid
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) this.enemies[w++] = e;
      else this.pool.push(e);
    }
    this.enemies.length = w;
    this.grid.clear();
    for (const e of this.enemies) if (e.alive && e.dying <= 0 && e.targetable) this.grid.insert(e);

    this.shots.update(dt);
    this.eshots.update(dt);
    this.pickups.update(dt);

    // combo decay: gentle, never a hard reset
    if (r.combo > 0) {
      r.comboT -= dt;
      if (r.comboT <= 0) {
        r.comboDecayT -= dt;
        if (r.comboDecayT <= 0) {
          r.comboDecayT = COMBO.decayStep;
          r.combo = Math.floor(r.combo * (1 - COMBO.decayFrac));
        }
      }
    }
  }

  private drawBeam(): void {
    const g = this.beamG;
    g.clear();
    const b = this.beamFx;
    if (b.active && !this.player.dead) {
      const w = Math.round(2 + b.power * 1.5);
      const t2 = this.time.now * 0.03;
      const dx = b.x1 - b.x0;
      const dy = b.y1 - b.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      // wobbling outer glow
      g.lineStyle(w + 4, 0x3ab8e0, 0.35);
      g.beginPath();
      g.moveTo(b.x0, b.y0);
      const segs = Math.max(2, Math.floor(len / 12));
      for (let i = 1; i <= segs; i++) {
        const tt = i / segs;
        const off = Math.sin(t2 + i * 1.3) * (i === segs ? 0 : 1.5);
        g.lineTo(b.x0 + dx * tt + nx * off, b.y0 + dy * tt + ny * off);
      }
      g.strokePath();
      g.lineStyle(w, 0x8ff8ff, 0.9);
      g.lineBetween(Math.round(b.x0), Math.round(b.y0), Math.round(b.x1), Math.round(b.y1));
      g.lineStyle(Math.max(1, w - 2), 0xffffff, 1);
      g.lineBetween(Math.round(b.x0), Math.round(b.y0), Math.round(b.x1), Math.round(b.y1));
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(Math.round(b.x1), Math.round(b.y1), 2 + b.power);
      g.fillStyle(0x8ff8ff, 0.5);
      g.fillCircle(Math.round(b.x0), Math.round(b.y0), 3 + b.power);
      if (b.hit && Math.random() < 0.6) this.fx.sparks(b.x1, b.y1, 2, [0xffffff, 0x8ff8ff], 120, Math.atan2(-dy, -dx), 1.8, 0.15);
      for (let i = 0; i + 3 < b.prism.length; i += 4) {
        g.lineStyle(2, 0xc890ff, 0.8);
        g.lineBetween(b.prism[i], b.prism[i + 1], b.prism[i + 2], b.prism[i + 3]);
      }
    }
    b.prism.length = 0;
  }

  // ------------------------------------------------------------------ QA hooks
  private installQa(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__RM = {
      state: () => ({
        time: this.run.time,
        zone: this.director.zoneIndex,
        dir: this.director.state,
        zoneTime: this.director.zoneTime,
        level: this.run.level,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        dead: this.player.dead,
        kills: this.run.kills,
        combo: this.run.combo,
        enemies: this.enemies.filter((e) => e.alive).length,
        shots: this.shots.activeCount,
        eshots: this.eshots.activeCount,
        particles: this.fx.particleCount,
        boss: this.boss ? { id: this.boss.id, hp: this.boss.hpFrac(), phase: this.boss.phase } : null,
        build: { ...this.build.levels },
        fps: this.game.loop.actualFps,
        hurt: this.hurtLog.slice(-12),
        ended: this.ended,
        event: this.director.event ? this.director.event.kind : null,
        bossDmg: Object.fromEntries(Object.entries(this.combat.bossDmg).map(([k, v]) => [k, Math.round(v)])),
        offers: this.offerLog.slice(-4),
        xp: this.run.xp,
        xpNext: this.run.xpNext,
      }),
      bot: (on: boolean) => (this.bot = on),
      god: (on: boolean) => (this.god = on),
      give: (id: string) => {
        const pending = this.run.pendingLevels;
        this.applyUpgrade(id, 'level');
        this.run.pendingLevels = pending;
      },
      skip: (sec: number) => (this.director.zoneTime += sec),
      xp: (n: number) => this.addXp(n),
      killAll: () => {
        for (const e of this.enemies) if (e.alive && !e.external) this.combat.damage(e, 1e9, { source: 'skill', quiet: true });
      },
      event: (kind: RiftEventKind) => this.director.startEvent(kind),
      /** Open the level-up screen with specific cards (for screenshots). */
      offer: (ids: string[]) => {
        const offers = ids.map((id) => UPGRADE_MAP[id]).filter(Boolean);
        this.run.pendingLevels++;
        this.player.stopBeam();
        this.scene.pause();
        this.scene.launch('LevelUp', { game: this, kind: 'level', offers } as LevelUpRequest & { game: GameScene });
      },
      bossHp: (frac: number) => {
        const b = this.boss;
        if (!b) return;
        for (const e of this.enemies) if (e.external && e.boss === b && e.targetable) e.hp = Math.max(1, e.maxHp * frac);
      },
      hurt: (n: number) => this.player.hurt(n, this.player.x - 10),
      weapon: (id: WeaponId) => {
        this.player.stopBeam();
        this.build.weapon = WEAPONS[id];
      },
      skills: (a: SkillId, b: SkillId) => {
        this.skills.slots = [a, b];
        this.skills.cd = [0, 0];
      },
      boss: (id: BossId) => {
        this.director.state = 'boss';
        this.startBoss(id, ZONES[this.director.zoneIndex].hpMul);
      },
      spawn: (id: EnemyId, elite?: EliteMod) => this.spawnEnemy(id, clamp(this.player.x + 120, 20, ARENA_W - 20), ENEMIES[id].flying ? 100 : GROUND_Y - 10, elite ?? null),
    };
  }
}
