// WebAudio engine: master / music / sfx buses, voice limiting and pitch
// variation so rapid-fire sounds don't turn into a single buzzing tone.

import { Music } from './music';
import { SFX, renderLayers, renderBeamLoop } from './synth';

interface PlayOpts {
  vol?: number;
  pitch?: number;
  /** Random pitch variation (fraction). */
  vary?: number;
  pan?: number;
}

const LIMITS: Record<string, { voices: number; gap: number }> = {
  smg: { voices: 3, gap: 0.03 },
  hit: { voices: 4, gap: 0.025 },
  hit_crit: { voices: 3, gap: 0.03 },
  hit_block: { voices: 2, gap: 0.05 },
  kill: { voices: 4, gap: 0.03 },
  pickup_xp: { voices: 3, gap: 0.03 },
  explosion: { voices: 3, gap: 0.05 },
  explosion_small: { voices: 3, gap: 0.04 },
  lightning: { voices: 2, gap: 0.05 },
  enemy_shot: { voices: 3, gap: 0.05 },
  shell: { voices: 2, gap: 0.05 },
  missile: { voices: 2, gap: 0.06 },
  fuse: { voices: 2, gap: 0.08 },
  ui_hover: { voices: 1, gap: 0.04 },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private sfxBus!: GainNode;
  private comp!: DynamicsCompressorNode;
  private buffers = new Map<string, AudioBuffer>();
  private lastPlay = new Map<string, number>();
  private active = new Map<string, number>();
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  music: Music | null = null;
  private vols = { master: 0.8, music: 0.6, sfx: 0.8 };
  private pendingSong = -1;

  /** Create the context. Must be called from a user gesture to be audible. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        this.ctx = null;
        return;
      }
      const ctx = this.ctx;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.15;
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicDuck = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.musicDuck);
      this.musicDuck.connect(this.master);
      this.sfxBus.connect(this.comp);
      this.comp.connect(this.master);
      this.master.connect(ctx.destination);
      this.applyVolumes();
      this.build();
      this.music = new Music(ctx, this.musicBus);
      if (this.pendingSong >= 0) {
        this.music.play(this.pendingSong);
        this.pendingSong = -1;
      }
    }
    const c = this.ctx;
    if (c && c.state === 'suspended') void c.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private build(): void {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    for (const [id, def] of Object.entries(SFX)) {
      const data = renderLayers(def, sr);
      const buf = ctx.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      this.buffers.set(id, buf);
    }
    const loop = renderBeamLoop(sr);
    const lb = ctx.createBuffer(1, loop.length, sr);
    lb.getChannelData(0).set(loop);
    this.buffers.set('beam_loop', lb);
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vols = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vols.master, now, 0.02);
    this.musicBus.gain.setTargetAtTime(this.vols.music * 0.9, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vols.sfx, now, 0.02);
  }

  /** Lower the music (pause menu, level-up). */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.musicDuck.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, 0.08);
  }

  play(id: string, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    const lim = LIMITS[id] ?? { voices: 6, gap: 0.012 };
    const now = ctx.currentTime;
    const last = this.lastPlay.get(id) ?? -1;
    if (now - last < lim.gap) return;
    const act = this.active.get(id) ?? 0;
    if (act >= lim.voices) return;
    this.lastPlay.set(id, now);
    this.active.set(id, act + 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const vary = opts.vary ?? 0.06;
    src.playbackRate.value = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
    const g = ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    let node: AudioNode = g;
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(this.sfxBus);
    src.start();
    src.onended = () => {
      this.active.set(id, Math.max(0, (this.active.get(id) ?? 1) - 1));
      src.disconnect();
      g.disconnect();
      if (node !== g) node.disconnect();
    };
  }

  startLoop(id: string, vol = 0.5): void {
    const ctx = this.ctx;
    if (!ctx || this.loops.has(id)) return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);
    src.connect(g);
    g.connect(this.sfxBus);
    src.start();
    this.loops.set(id, { src, gain: g });
  }

  setLoopPitch(id: string, rate: number): void {
    const l = this.loops.get(id);
    if (l && this.ctx) l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
  }

  stopLoop(id: string): void {
    const l = this.loops.get(id);
    if (!l || !this.ctx) return;
    const now = this.ctx.currentTime;
    l.gain.gain.cancelScheduledValues(now);
    l.gain.gain.setValueAtTime(l.gain.gain.value, now);
    l.gain.gain.linearRampToValueAtTime(0, now + 0.06);
    l.src.stop(now + 0.08);
    this.loops.delete(id);
  }

  stopAllLoops(): void {
    for (const id of [...this.loops.keys()]) this.stopLoop(id);
  }

  playMusic(id: number): void {
    if (!this.music) {
      this.pendingSong = id;
      return;
    }
    this.music.play(id);
  }

  stopMusic(fade = 0.6): void {
    this.pendingSong = -1;
    this.music?.stop(fade);
  }
}

export const audio = new AudioEngine();
