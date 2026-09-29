// Offline sound synthesis. Every sound effect is rendered into an AudioBuffer
// at boot from a small layered description – no audio files are shipped.

export type Wave = 'sine' | 'square' | 'saw' | 'tri' | 'noise';

export interface Layer {
  wave: Wave;
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  delay?: number;
  attack?: number;
  /** Envelope curvature; >1 = faster decay. */
  curve?: number;
  duty?: number;
  vibRate?: number;
  vibDepth?: number;
  /** One-pole lowpass cutoff (Hz). */
  lp?: number;
  /** Bit-crush levels (e.g. 8 = coarse). */
  crush?: number;
}

export type SfxDef = Layer[];

function osc(wave: Wave, phase: number, duty: number, noiseState: { v: number; last: number }, cyclePos: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'square':
      return cyclePos < duty ? 1 : -1;
    case 'saw':
      return cyclePos * 2 - 1;
    case 'tri':
      return cyclePos < 0.5 ? cyclePos * 4 - 1 : 3 - cyclePos * 4;
    case 'noise': {
      // Sample & hold noise: new random value each cycle -> pitched noise.
      const c = Math.floor(phase);
      if (c !== noiseState.last) {
        noiseState.last = c;
        noiseState.v = Math.random() * 2 - 1;
      }
      return noiseState.v;
    }
  }
}

export function renderLayers(layers: SfxDef, sampleRate: number): Float32Array {
  let total = 0;
  for (const l of layers) total = Math.max(total, (l.delay ?? 0) + l.dur);
  const n = Math.max(1, Math.ceil(total * sampleRate) + 32);
  const out = new Float32Array(n);
  for (const l of layers) {
    const start = Math.floor((l.delay ?? 0) * sampleRate);
    const len = Math.floor(l.dur * sampleRate);
    const f0 = l.f0;
    const f1 = l.f1 ?? l.f0;
    const attack = Math.max(0.0005, l.attack ?? 0.002);
    const curve = l.curve ?? 1.6;
    const duty = l.duty ?? 0.5;
    const ns = { v: 0, last: -1 };
    let phase = 0;
    let lpState = 0;
    const lpA = l.lp ? 1 - Math.exp((-2 * Math.PI * l.lp) / sampleRate) : 1;
    for (let i = 0; i < len; i++) {
      const tt = i / sampleRate;
      const p = i / len;
      let f = f0 * Math.pow(f1 / f0, p);
      if (l.vibRate && l.vibDepth) f *= 1 + Math.sin(tt * l.vibRate * Math.PI * 2) * l.vibDepth;
      phase += f / sampleRate;
      const cyclePos = phase - Math.floor(phase);
      let s = osc(l.wave, phase, duty, ns, cyclePos);
      if (l.lp) {
        lpState += (s - lpState) * lpA;
        s = lpState;
      }
      if (l.crush) s = Math.round(s * l.crush) / l.crush;
      const env = (tt < attack ? tt / attack : 1) * Math.pow(1 - p, curve);
      const idx = start + i;
      if (idx < n) out[idx] += s * env * l.vol;
    }
  }
  // Soft clip + tiny fade-out to avoid clicks.
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * 1.2) * 0.9;
  const fade = Math.min(64, n);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

export const SFX: Record<string, SfxDef> = {
  smg: [
    { wave: 'square', f0: 1100, f1: 320, dur: 0.055, vol: 0.28, duty: 0.3 },
    { wave: 'noise', f0: 9000, f1: 2500, dur: 0.05, vol: 0.28 },
    { wave: 'sine', f0: 200, f1: 70, dur: 0.05, vol: 0.35 },
  ],
  shotgun: [
    { wave: 'noise', f0: 5200, f1: 300, dur: 0.3, vol: 0.75, lp: 5000, curve: 1.8 },
    { wave: 'sine', f0: 150, f1: 38, dur: 0.24, vol: 0.9 },
    { wave: 'square', f0: 320, f1: 60, dur: 0.1, vol: 0.25 },
    { wave: 'noise', f0: 1800, f1: 900, dur: 0.06, vol: 0.2, delay: 0.16 },
  ],
  rail: [
    { wave: 'saw', f0: 260, f1: 2600, dur: 0.07, vol: 0.2 },
    { wave: 'noise', f0: 11000, f1: 1500, dur: 0.32, vol: 0.45, delay: 0.035 },
    { wave: 'sine', f0: 2100, f1: 110, dur: 0.36, vol: 0.45, delay: 0.035 },
    { wave: 'square', f0: 95, f1: 40, dur: 0.3, vol: 0.32, delay: 0.035 },
  ],
  beam_start: [
    { wave: 'saw', f0: 180, f1: 900, dur: 0.12, vol: 0.25 },
    { wave: 'noise', f0: 6000, f1: 3000, dur: 0.1, vol: 0.15 },
  ],
  beam_overheat: [
    { wave: 'noise', f0: 3000, f1: 400, dur: 0.5, vol: 0.4, lp: 3000 },
    { wave: 'square', f0: 500, f1: 120, dur: 0.35, vol: 0.2 },
  ],
  hit: [
    { wave: 'noise', f0: 7000, f1: 3000, dur: 0.035, vol: 0.32 },
    { wave: 'square', f0: 1300, f1: 800, dur: 0.028, vol: 0.12, duty: 0.25 },
  ],
  hit_heavy: [
    { wave: 'noise', f0: 4000, f1: 800, dur: 0.08, vol: 0.45 },
    { wave: 'sine', f0: 260, f1: 90, dur: 0.08, vol: 0.4 },
  ],
  hit_crit: [
    { wave: 'square', f0: 1900, f1: 2700, dur: 0.06, vol: 0.2, duty: 0.25 },
    { wave: 'noise', f0: 9000, f1: 5000, dur: 0.05, vol: 0.28 },
    { wave: 'sine', f0: 2600, f1: 1300, dur: 0.09, vol: 0.2 },
  ],
  hit_block: [
    { wave: 'square', f0: 2500, f1: 2300, dur: 0.05, vol: 0.14, duty: 0.2 },
    { wave: 'tri', f0: 1700, f1: 1650, dur: 0.14, vol: 0.2, curve: 2.5 },
  ],
  hit_weak: [
    { wave: 'square', f0: 900, f1: 1800, dur: 0.07, vol: 0.2 },
    { wave: 'noise', f0: 8000, f1: 3000, dur: 0.06, vol: 0.3 },
    { wave: 'sine', f0: 1800, f1: 2400, dur: 0.1, vol: 0.18, delay: 0.03 },
  ],
  kill: [
    { wave: 'noise', f0: 2600, f1: 300, dur: 0.16, vol: 0.5 },
    { wave: 'square', f0: 420, f1: 80, dur: 0.12, vol: 0.25 },
  ],
  kill_big: [
    { wave: 'noise', f0: 1600, f1: 60, dur: 0.55, vol: 0.85, lp: 3000 },
    { wave: 'sine', f0: 95, f1: 28, dur: 0.5, vol: 0.9 },
    { wave: 'square', f0: 220, f1: 40, dur: 0.3, vol: 0.25 },
  ],
  explosion: [
    { wave: 'noise', f0: 1300, f1: 50, dur: 0.45, vol: 0.8, lp: 2600 },
    { wave: 'sine', f0: 110, f1: 32, dur: 0.4, vol: 0.8 },
  ],
  explosion_small: [
    { wave: 'noise', f0: 2600, f1: 160, dur: 0.22, vol: 0.5, lp: 4000 },
    { wave: 'sine', f0: 170, f1: 50, dur: 0.18, vol: 0.5 },
  ],
  pickup_xp: [
    { wave: 'sine', f0: 1250, f1: 1300, dur: 0.07, vol: 0.28 },
    { wave: 'square', f0: 1875, dur: 0.04, vol: 0.06, duty: 0.25 },
  ],
  pickup_shard: [
    { wave: 'tri', f0: 1500, f1: 3000, dur: 0.12, vol: 0.3 },
    { wave: 'sine', f0: 3000, f1: 3200, dur: 0.14, vol: 0.2, delay: 0.06 },
  ],
  pickup_heal: [
    { wave: 'sine', f0: 600, f1: 1200, dur: 0.22, vol: 0.35 },
    { wave: 'tri', f0: 900, f1: 1800, dur: 0.22, vol: 0.2, delay: 0.05 },
  ],
  pickup_core: [
    { wave: 'tri', f0: 400, f1: 1600, dur: 0.35, vol: 0.35 },
    { wave: 'square', f0: 800, f1: 3200, dur: 0.3, vol: 0.1, duty: 0.25, delay: 0.08 },
  ],
  levelup: [
    { wave: 'square', f0: 523, dur: 0.09, vol: 0.2, duty: 0.25 },
    { wave: 'square', f0: 659, dur: 0.09, vol: 0.2, duty: 0.25, delay: 0.07 },
    { wave: 'square', f0: 784, dur: 0.09, vol: 0.2, duty: 0.25, delay: 0.14 },
    { wave: 'square', f0: 1046, dur: 0.3, vol: 0.2, duty: 0.25, delay: 0.21 },
    { wave: 'tri', f0: 1046, f1: 1060, dur: 0.4, vol: 0.25, delay: 0.21 },
  ],
  upgrade: [
    { wave: 'tri', f0: 800, f1: 1600, dur: 0.3, vol: 0.3 },
    { wave: 'square', f0: 1200, dur: 0.14, vol: 0.12, duty: 0.25, delay: 0.1 },
    { wave: 'sine', f0: 2400, f1: 2500, dur: 0.25, vol: 0.2, delay: 0.18 },
  ],
  fusion: [
    { wave: 'square', f0: 392, dur: 0.12, vol: 0.18, duty: 0.25 },
    { wave: 'square', f0: 523, dur: 0.12, vol: 0.18, duty: 0.25, delay: 0.1 },
    { wave: 'square', f0: 784, dur: 0.12, vol: 0.18, duty: 0.25, delay: 0.2 },
    { wave: 'saw', f0: 1046, f1: 1568, dur: 0.5, vol: 0.2, delay: 0.3 },
    { wave: 'noise', f0: 9000, dur: 0.4, vol: 0.12, delay: 0.3 },
  ],
  ui_hover: [{ wave: 'tri', f0: 950, dur: 0.03, vol: 0.14 }],
  ui_select: [
    { wave: 'square', f0: 660, dur: 0.05, vol: 0.16, duty: 0.25 },
    { wave: 'square', f0: 990, dur: 0.08, vol: 0.16, duty: 0.25, delay: 0.05 },
  ],
  ui_back: [{ wave: 'square', f0: 520, f1: 300, dur: 0.08, vol: 0.16, duty: 0.25 }],
  ui_error: [
    { wave: 'square', f0: 190, dur: 0.1, vol: 0.2 },
    { wave: 'square', f0: 150, dur: 0.12, vol: 0.2, delay: 0.08 },
  ],
  ui_buy: [
    { wave: 'tri', f0: 700, f1: 1400, dur: 0.12, vol: 0.25 },
    { wave: 'sine', f0: 1400, f1: 2800, dur: 0.2, vol: 0.2, delay: 0.08 },
    { wave: 'noise', f0: 10000, dur: 0.1, vol: 0.08, delay: 0.1 },
  ],
  card_flip: [{ wave: 'noise', f0: 5000, f1: 9000, dur: 0.05, vol: 0.12 }],
  dash: [
    { wave: 'noise', f0: 900, f1: 4500, dur: 0.15, vol: 0.32, lp: 6000, attack: 0.02 },
    { wave: 'sine', f0: 280, f1: 620, dur: 0.1, vol: 0.12 },
  ],
  jump: [{ wave: 'square', f0: 230, f1: 460, dur: 0.08, vol: 0.12, duty: 0.25 }],
  land: [{ wave: 'noise', f0: 500, f1: 120, dur: 0.07, vol: 0.22 }],
  hurt: [
    { wave: 'square', f0: 420, f1: 90, dur: 0.26, vol: 0.4 },
    { wave: 'noise', f0: 3000, f1: 500, dur: 0.2, vol: 0.4 },
  ],
  shield_block: [
    { wave: 'tri', f0: 1400, f1: 1000, dur: 0.22, vol: 0.3 },
    { wave: 'square', f0: 2800, dur: 0.05, vol: 0.12, duty: 0.2 },
    { wave: 'noise', f0: 8000, f1: 4000, dur: 0.1, vol: 0.15 },
  ],
  enemy_shot: [
    { wave: 'square', f0: 720, f1: 340, dur: 0.1, vol: 0.14, duty: 0.4 },
    { wave: 'tri', f0: 360, f1: 200, dur: 0.1, vol: 0.14 },
  ],
  enemy_charge: [{ wave: 'saw', f0: 90, f1: 380, dur: 0.5, vol: 0.16, vibRate: 18, vibDepth: 0.06 }],
  enemy_dash: [{ wave: 'noise', f0: 700, f1: 2200, dur: 0.2, vol: 0.25 }],
  summon: [
    { wave: 'sine', f0: 200, f1: 800, dur: 0.4, vol: 0.2, vibRate: 12, vibDepth: 0.1 },
    { wave: 'noise', f0: 4000, f1: 1000, dur: 0.4, vol: 0.1 },
  ],
  fuse: [{ wave: 'square', f0: 880, dur: 0.05, vol: 0.12, duty: 0.25 }],
  boss_warn: [
    { wave: 'square', f0: 620, dur: 0.26, vol: 0.2, curve: 0.3 },
    { wave: 'square', f0: 460, dur: 0.26, vol: 0.2, curve: 0.3, delay: 0.28 },
    { wave: 'square', f0: 620, dur: 0.26, vol: 0.2, curve: 0.3, delay: 0.56 },
    { wave: 'square', f0: 460, dur: 0.3, vol: 0.2, curve: 0.5, delay: 0.84 },
  ],
  boss_slam: [
    { wave: 'sine', f0: 85, f1: 24, dur: 0.65, vol: 1 },
    { wave: 'noise', f0: 900, f1: 60, dur: 0.6, vol: 0.8, lp: 2000 },
  ],
  boss_step: [{ wave: 'sine', f0: 70, f1: 30, dur: 0.2, vol: 0.55 }],
  boss_roar: [
    { wave: 'saw', f0: 130, f1: 60, dur: 0.9, vol: 0.35, vibRate: 22, vibDepth: 0.08 },
    { wave: 'noise', f0: 1200, f1: 300, dur: 0.9, vol: 0.3, lp: 1500 },
  ],
  boss_hurt: [
    { wave: 'saw', f0: 300, f1: 120, dur: 0.3, vol: 0.3 },
    { wave: 'noise', f0: 3000, f1: 400, dur: 0.3, vol: 0.3 },
  ],
  laser_charge: [{ wave: 'saw', f0: 280, f1: 1300, dur: 0.8, vol: 0.18, vibRate: 30, vibDepth: 0.04, curve: 0.4 }],
  laser_fire: [
    { wave: 'saw', f0: 95, f1: 80, dur: 0.7, vol: 0.4 },
    { wave: 'noise', f0: 5000, f1: 2000, dur: 0.7, vol: 0.3, curve: 0.8 },
    { wave: 'square', f0: 190, f1: 160, dur: 0.7, vol: 0.12, curve: 0.8 },
  ],
  lightning: [
    { wave: 'noise', f0: 6500, f1: 1800, dur: 0.13, vol: 0.34, crush: 4 },
    { wave: 'square', f0: 3000, f1: 700, dur: 0.08, vol: 0.1, duty: 0.2 },
  ],
  missile: [
    { wave: 'noise', f0: 600, f1: 2600, dur: 0.2, vol: 0.28, attack: 0.03 },
    { wave: 'saw', f0: 200, f1: 500, dur: 0.12, vol: 0.08 },
  ],
  freeze: [
    { wave: 'tri', f0: 2000, f1: 3200, dur: 0.16, vol: 0.25 },
    { wave: 'noise', f0: 12000, dur: 0.12, vol: 0.14 },
  ],
  shockwave: [
    { wave: 'sine', f0: 220, f1: 40, dur: 0.45, vol: 0.9 },
    { wave: 'noise', f0: 3200, f1: 200, dur: 0.38, vol: 0.5, lp: 4000 },
  ],
  overdrive: [
    { wave: 'saw', f0: 200, f1: 900, dur: 0.45, vol: 0.25 },
    { wave: 'square', f0: 400, f1: 1800, dur: 0.35, vol: 0.1, duty: 0.25, delay: 0.1 },
  ],
  singularity: [{ wave: 'sine', f0: 420, f1: 60, dur: 1.1, vol: 0.4, vibRate: 9, vibDepth: 0.12, curve: 0.6 }],
  perfect: [
    { wave: 'tri', f0: 1200, f1: 2400, dur: 0.14, vol: 0.28 },
    { wave: 'sine', f0: 2400, f1: 2450, dur: 0.25, vol: 0.2, delay: 0.1 },
  ],
  combo_tier: [
    { wave: 'square', f0: 784, dur: 0.06, vol: 0.13, duty: 0.25 },
    { wave: 'square', f0: 1175, dur: 0.1, vol: 0.13, duty: 0.25, delay: 0.06 },
  ],
  rift_close: [
    { wave: 'tri', f0: 1600, f1: 300, dur: 0.35, vol: 0.3 },
    { wave: 'noise', f0: 4000, f1: 500, dur: 0.3, vol: 0.2 },
  ],
  revive: [
    { wave: 'tri', f0: 392, dur: 0.12, vol: 0.25 },
    { wave: 'tri', f0: 523, dur: 0.12, vol: 0.25, delay: 0.1 },
    { wave: 'tri', f0: 784, dur: 0.12, vol: 0.25, delay: 0.2 },
    { wave: 'tri', f0: 1046, dur: 0.4, vol: 0.25, delay: 0.3 },
  ],
  defeat: [
    { wave: 'square', f0: 440, f1: 110, dur: 0.9, vol: 0.2, duty: 0.25, curve: 1 },
    { wave: 'tri', f0: 220, f1: 55, dur: 1.0, vol: 0.3, curve: 1 },
  ],
  victory: [
    { wave: 'square', f0: 523, dur: 0.12, vol: 0.18, duty: 0.25 },
    { wave: 'square', f0: 659, dur: 0.12, vol: 0.18, duty: 0.25, delay: 0.12 },
    { wave: 'square', f0: 784, dur: 0.12, vol: 0.18, duty: 0.25, delay: 0.24 },
    { wave: 'square', f0: 1046, dur: 0.6, vol: 0.18, duty: 0.25, delay: 0.36, curve: 0.8 },
    { wave: 'tri', f0: 523, dur: 0.9, vol: 0.25, delay: 0.36, curve: 0.8 },
  ],
  debris: [
    { wave: 'noise', f0: 1200, f1: 100, dur: 0.35, vol: 0.55, lp: 2000 },
    { wave: 'sine', f0: 120, f1: 40, dur: 0.25, vol: 0.5 },
  ],
  shell: [{ wave: 'tri', f0: 3200, f1: 2800, dur: 0.03, vol: 0.05 }],
  zone_warp: [
    { wave: 'saw', f0: 80, f1: 1600, dur: 1.2, vol: 0.25, curve: 0.5 },
    { wave: 'noise', f0: 2000, f1: 12000, dur: 1.2, vol: 0.15, curve: 0.5 },
  ],
};

/** Seamless 1s loop used while the beam weapon fires. */
export function renderBeamLoop(sampleRate: number): Float32Array {
  const n = sampleRate; // exactly 1 second -> integer cycles for all partials
  const out = new Float32Array(n);
  let crackle = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sampleRate;
    const vib = Math.sin(tt * Math.PI * 2 * 6) * 0.5;
    const a = ((tt * 110) % 1) * 2 - 1;
    const b = ((tt * 112) % 1) * 2 - 1;
    const c = Math.sin(tt * Math.PI * 2 * 440) * 0.25;
    if (Math.random() < 0.002) crackle = 1;
    crackle *= 0.995;
    const noise = (Math.random() * 2 - 1) * crackle * 0.4;
    out[i] = Math.tanh((a * 0.35 + b * 0.35 + c * (0.6 + vib * 0.4) + noise) * 0.9) * 0.55;
  }
  return out;
}
