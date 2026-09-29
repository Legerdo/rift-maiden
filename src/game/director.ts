// Wave director: runs the zone timeline, spawns groups, hazards, elites,
// the boss warning and zone transitions. Everything is driven by data/zones.

import { ARENA_W, GAME_W, GROUND_Y } from '../core/constants';
import { clamp } from '../core/mathx';
import { rand, randInt, weightedPick, pick } from '../core/rng';
import { ZONES, depthScale, type ZoneDef } from '../data/zones';
import { ELITE_MODS, type EnemyId, type EliteMod } from '../data/enemies';
import { audio } from '../audio/audio';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './enemy';

export type DirectorState = 'intro' | 'combat' | 'bossWarn' | 'boss' | 'finale' | 'clear' | 'warp' | 'victory';

export type RiftEventKind = 'supply' | 'surge' | 'bounty' | 'rain';

export interface RiftEvent {
  kind: RiftEventKind;
  t: number;
  dur: number;
  target: Enemy | null;
  acc: number;
}

interface Pending {
  t: number;
  fn: () => void;
}

export class Director {
  g: GameScene;
  zoneIndex = 0;
  zoneTime = 0;
  state: DirectorState = 'intro';
  st = 0;
  private spawnAcc = 0;
  private fired = new Set<number>();
  private hazardT = 5;
  private finaleElites: Enemy[] = [];
  private finaleT = 0;
  private pending: Pending[] = [];
  depth: number;

  constructor(g: GameScene, depth: number) {
    this.g = g;
    this.depth = depth;
  }

  get zone(): ZoneDef {
    return ZONES[this.zoneIndex];
  }

  get isLastZone(): boolean {
    return this.zoneIndex >= ZONES.length - 1;
  }

  /** Enemy HP multiplier: zone base x depth x in-zone ramp. */
  get hpMul(): number {
    const z = this.zone;
    const ramp = 1 + 0.7 * clamp(this.zoneTime / z.duration, 0, 1);
    return z.hpMul * depthScale(this.depth).hp * ramp;
  }

  /** Active rift event (supply / surge / bounty / rain). */
  event: RiftEvent | null = null;
  private eventT = 40;

  get surge(): boolean {
    return this.event?.kind === 'surge';
  }

  get zoneProgress(): number {
    return clamp(this.zoneTime / this.zone.duration, 0, 1);
  }

  get spawning(): boolean {
    return this.state === 'combat' || this.state === 'finale' || this.state === 'boss' || (this.state === 'intro' && this.st < 1.2);
  }

  startZone(i: number): void {
    this.zoneIndex = i;
    this.zoneTime = 0;
    this.state = 'intro';
    this.st = 2.8;
    this.spawnAcc = 0;
    this.fired.clear();
    this.hazardT = 6;
    this.finaleElites = [];
    this.pending = [];
    this.event = null;
    this.eventT = i === 0 ? 38 : 26;
    this.g.onZoneStart(i);
  }

  later(t: number, fn: () => void): void {
    this.pending.push({ t, fn });
  }

  private aliveCount(): number {
    let n = 0;
    for (const e of this.g.enemies) if (e.alive && !e.summoned && !e.external && e.ai !== 'rift' && e.ai !== 'capsule') n++;
    return n;
  }

  private phase() {
    const ph = this.zone.phases;
    let cur = ph[0];
    for (const p of ph) if (this.zoneTime >= p.t) cur = p;
    return cur;
  }

  spawnPos(flying: boolean, side?: 'left' | 'right' | 'sky'): { x: number; y: number } {
    const cam = this.g.cam.x;
    const s = side ?? (Math.random() < 0.5 ? 'left' : 'right');
    if (s === 'sky') return { x: clamp(cam + rand(40, GAME_W - 40), 20, ARENA_W - 20), y: -24 };
    const x = s === 'left' ? Math.max(-24, cam - 26) : Math.min(ARENA_W + 24, cam + GAME_W + 26);
    return { x, y: flying ? rand(50, 120) : GROUND_Y - 10 };
  }

  private groupSize(id: EnemyId): number {
    const z = this.zoneIndex;
    if (id === 'crawler') return z === 0 ? randInt(1, this.zoneTime < 40 ? 2 : 3) : randInt(2, 4);
    if (id === 'flyer') return randInt(1, z === 0 ? 1 : 2);
    if (id === 'exploder') return randInt(1, 2);
    return 1;
  }

  private spawnGroup(): void {
    const ph = this.phase();
    const entries = Object.entries(ph.weights).map(([k, w]) => ({ item: k as EnemyId, weight: w ?? 0 }));
    const id = weightedPick(entries);
    if (!id) return;
    const n = this.groupSize(id);
    const side: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right';
    const ds = depthScale(this.depth);
    // Later zones sprinkle in elites on their own; the hunter's pact adds more.
    const eliteChance = ds.eliteChance + this.zoneIndex * 0.008 + this.g.build.eliteBonusChance;
    for (let i = 0; i < n; i++) {
      const flying = id === 'flyer' || id === 'watcher';
      const pos = this.spawnPos(flying, side);
      const elite: EliteMod | null = id !== 'crawler' && Math.random() < eliteChance ? pick(ELITE_MODS) : null;
      const e = this.g.spawnEnemy(id, pos.x + (side === 'left' ? -i * 14 : i * 14), pos.y, elite);
      if (e && this.surge) e.mem.spd = (e.mem.spd ?? 1) * 1.2;
      if (e && elite) e.hpBarT = 99;
    }
  }

  spawnElite(id: EnemyId, mod?: EliteMod, announce = true): Enemy | null {
    const flying = id === 'flyer' || id === 'watcher';
    const pos = this.spawnPos(flying);
    const m = mod ?? pick(ELITE_MODS);
    const e = this.g.spawnEnemy(id, pos.x, pos.y, m);
    if (e && announce) this.g.onEliteSpawn(e);
    return e;
  }

  update(dt: number): void {
    const g = this.g;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        p.fn();
      }
    }
    const z = this.zone;
    const ds = depthScale(this.depth);
    switch (this.state) {
      case 'intro':
        this.st -= dt;
        if (this.st <= 0) this.state = 'combat';
        break;
      case 'combat': {
        this.zoneTime += dt;
        for (let i = 0; i < z.events.length; i++) {
          const ev = z.events[i];
          if (this.fired.has(i) || this.zoneTime < ev.t) continue;
          this.fired.add(i);
          if (ev.type === 'swarm') {
            for (let k = 0; k < ev.count; k++) {
              const side = ev.side === 'both' ? (k % 2 === 0 ? 'left' : 'right') : ev.side;
              const flying = ev.enemy === 'flyer' || ev.enemy === 'watcher';
              const pos = this.spawnPos(flying, side);
              this.later(k * 0.12, () => g.spawnEnemy(ev.enemy, pos.x + rand(-8, 8), pos.y + (side === 'sky' ? -k * 6 : 0), null));
            }
          } else if (ev.type === 'elite') this.spawnElite(ev.enemy, ev.mod);
          else if (ev.type === 'hint') g.tutorial.hint(ev.key);
        }
        this.runSpawns(dt, this.surge ? 1.8 : 1);
        this.runHazards(dt);
        this.runEvents(dt);
        if (this.zoneTime >= z.duration) {
          this.endEvent(false);
          if (z.boss) {
            this.state = 'bossWarn';
            this.st = 3;
            g.onBossWarning();
          } else if (z.finale === 'elite_rush') {
            this.state = 'finale';
            this.finaleT = 0;
            this.finaleElites = [];
            g.onFinaleStart();
            const picks: EnemyId[] = ['shield', 'watcher', 'charger', 'gunner', 'summoner'];
            for (let k = 0; k < 3; k++) {
              this.later(k * 4 + 1, () => {
                const e = this.spawnElite(pick(picks));
                if (e) this.finaleElites.push(e);
              });
            }
          }
        }
        break;
      }
      case 'bossWarn':
        this.st -= dt;
        if (this.st <= 0) {
          this.state = 'boss';
          if (z.boss) g.startBoss(z.boss, z.hpMul * ds.hp);
        }
        break;
      case 'boss':
        if (z.boss === 'warden') this.runSpawns(dt, 0.22, 6, ['crawler']);
        this.runHazards(dt * 0.5);
        break;
      case 'finale': {
        this.finaleT += dt;
        this.runSpawns(dt, 0.55);
        this.runHazards(dt);
        const allDead = this.finaleElites.length >= 3 && this.finaleElites.every((e) => !e.alive || e.dying > 0 || !e.isElite);
        if (allDead && this.finaleT > 10) {
          this.state = 'clear';
          this.st = 3.2;
          g.onZoneCleared(false);
        }
        break;
      }
      case 'clear':
        this.st -= dt;
        if (this.st <= 0) {
          if (this.isLastZone) {
            this.state = 'victory';
            g.onVictory();
          } else {
            this.state = 'warp';
            g.warpToZone(this.zoneIndex + 1);
          }
        }
        break;
      case 'warp':
      case 'victory':
        break;
    }
  }

  private runSpawns(dt: number, rateMul: number, maxOverride?: number, only?: EnemyId[]): void {
    const ph = this.phase();
    const ds = depthScale(this.depth);
    const b = this.g.build;
    const max = Math.round((maxOverride ?? ph.maxAlive) * (b.spawnMul > 1 ? 1.3 : 1) * (this.surge ? 1.3 : 1));
    // Pressure: when the player clears the field quickly the rift pushes back
    // harder, so a strong build keeps meeting resistance instead of an empty screen.
    const fill = this.aliveCount() / Math.max(1, max);
    const pressure = maxOverride !== undefined ? 1 : fill < 0.3 ? 1.9 : fill < 0.55 ? 1.35 : 1;
    this.spawnAcc += dt * ph.rate * rateMul * ds.rate * b.spawnMul * pressure;
    let guard = 0;
    while (this.spawnAcc >= 1 && guard++ < 4) {
      this.spawnAcc -= 1;
      if (this.aliveCount() >= max) {
        this.spawnAcc = Math.min(this.spawnAcc, 0.5);
        break;
      }
      if (only) {
        const id = pick(only);
        const pos = this.spawnPos(false);
        const n = this.groupSize(id);
        for (let i = 0; i < n; i++) this.g.spawnEnemy(id, pos.x + i * 12, pos.y, null);
      } else this.spawnGroup();
    }
  }

  // -------------------------------------------------------------- rift events
  private runEvents(dt: number): void {
    const g = this.g;
    const ev = this.event;
    if (!ev) {
      this.eventT -= dt;
      // don't start an event right before the zone ends
      if (this.eventT <= 0 && this.zoneTime < this.zone.duration - 25) this.startEvent();
      return;
    }
    ev.t += dt;
    switch (ev.kind) {
      case 'rain': {
        ev.acc -= dt;
        while (ev.acc <= 0) {
          ev.acc += 0.07;
          const x = clamp(g.cam.x + rand(20, GAME_W - 20), 10, ARENA_W - 10);
          g.pickups.rain(x, Math.max(1, Math.round(this.zone.xpMul * rand(0.8, 1.6))));
        }
        break;
      }
      case 'bounty': {
        const tg = ev.target;
        if (!tg || !tg.alive || tg.dying > 0) {
          // killed -> reward handled by onEnemyKilled via mem.bounty
          this.endEvent(true);
          return;
        }
        break;
      }
      case 'supply': {
        const tg = ev.target;
        if (!tg || !tg.alive || tg.dying > 0) {
          this.endEvent(true);
          return;
        }
        break;
      }
      case 'surge':
        break;
    }
    if (ev.t >= ev.dur) this.endEvent(false);
  }

  startEvent(force?: RiftEventKind): void {
    const g = this.g;
    if (this.event) this.endEvent(false);
    const opts: { item: RiftEventKind; weight: number }[] = [
      { item: 'supply', weight: 1 },
      { item: 'bounty', weight: 1.1 },
      { item: 'rain', weight: 0.7 },
      { item: 'surge', weight: this.zoneIndex >= 1 || this.zoneTime > 80 ? 1.1 : 0 },
    ];
    const last = this.lastEvent;
    for (const o of opts) if (o.item === last) o.weight *= 0.25;
    const kind = force ?? weightedPick(opts) ?? 'supply';
    this.lastEvent = kind;
    const dur = kind === 'surge' ? 20 : kind === 'bounty' ? 25 : kind === 'rain' ? 6 : 22;
    const ev: RiftEvent = { kind, t: 0, dur, target: null, acc: 0 };
    this.event = ev;
    if (kind === 'supply') {
      const x = clamp(g.player.x + (Math.random() < 0.5 ? -1 : 1) * rand(90, 170), 30, ARENA_W - 30);
      g.telegraph.column(x, 22, 0.9, 0x6ef4ff);
      this.later(0.5, () => {
        const e = g.spawnEnemy('capsule', x, GROUND_Y - 10, null);
        if (e) {
          e.y = -30;
          e.vy = 260;
          e.grounded = false;
          e.contact = false;
          e.hpBarT = 99;
          ev.target = e;
        }
      });
    } else if (kind === 'bounty') {
      const ph = this.phase();
      const ids = Object.keys(ph.weights).filter((k) => k !== 'crawler' && k !== 'exploder') as EnemyId[];
      const e = this.spawnElite(ids.length ? pick(ids) : 'gunner', undefined, false);
      if (e) {
        e.mem.bounty = 1;
        e.hpBarT = 99;
        ev.target = e;
      }
    }
    g.onRiftEvent(kind, true, false);
  }

  /** Finish the current event. `success` = objective completed. */
  endEvent(success: boolean): void {
    const ev = this.event;
    if (!ev) return;
    this.event = null;
    this.eventT = rand(48, 62);
    if (ev.kind === 'bounty' && !success && ev.target && ev.target.alive && ev.target.dying <= 0) {
      // the target escapes through a rift
      const tg = ev.target;
      this.g.fx.ring(tg.x, tg.y, 4, 34, 0.35, 0xffcf4a, 2);
      this.g.fx.glow(tg.x, tg.y, 14, 0xffcf4a, 80, 0.5);
      tg.release();
    }
    if (ev.kind === 'supply' && !success && ev.target && ev.target.alive) ev.target.release();
    this.g.onRiftEvent(ev.kind, false, success);
  }

  private lastEvent: RiftEventKind | null = null;

  private runHazards(dt: number): void {
    const g = this.g;
    const z = this.zone;
    if (z.hazard === 'none') return;
    this.hazardT -= dt;
    if (this.hazardT > 0) return;
    if (z.hazard === 'debris') {
      this.hazardT = rand(4.5, 7.5) - this.zoneProgress * 1.5;
      const n = 1 + (this.zoneTime > 70 ? 1 : 0) + (this.zoneTime > 130 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = clamp(g.player.x + rand(-120, 120) + (i === 0 ? rand(-20, 20) : 0), 16, ARENA_W - 16);
        g.telegraph.column(x, 24, 1.0);
        this.later(0.42, () => g.eshots.fire(x, -24, 0, 200, 'debris', 1));
      }
      audio.play('debris', { vol: 0.25, pitch: 1.6 });
    } else if (z.hazard === 'rifts') {
      this.hazardT = rand(12, 16);
      const rifts = g.enemies.filter((e) => e.alive && e.ai === 'rift').length;
      const maxR = this.zoneTime > 90 ? 3 : 2;
      if (rifts >= maxR) return;
      let x = g.player.x + (Math.random() < 0.5 ? -1 : 1) * rand(130, 220);
      if (x < 40 || x > ARENA_W - 40) x = g.player.x - (x - g.player.x);
      x = clamp(x, 40, ARENA_W - 40);
      const y = rand(90, 150);
      const e = g.spawnEnemy('rift', x, y, null);
      if (e) {
        e.mem.baseY = y;
        e.st = 1.6;
        g.fx.ring(x, y, 4, 40, 0.5, 0xff3ca0, 2);
        audio.play('summon', { pitch: 0.6 });
      }
    }
  }

  onBossDefeated(): void {
    this.state = 'clear';
    this.st = this.isLastZone ? 3.4 : 3.6;
  }
}
