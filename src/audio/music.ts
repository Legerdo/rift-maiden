// Minimal chiptune sequencer. Songs are chord progressions + patterns, notes are
// scheduled ahead of time on the AudioContext clock.

interface Song {
  bpm: number;
  /** Root MIDI notes per bar, with chord quality. */
  chords: { root: number; minor: boolean; seventh?: boolean }[];
  /** 16 steps. Values are chord-tone indexes (0..3) or -1 for rest. */
  arp: number[];
  /** 16 steps bass: 1 = root, 2 = octave, 5 = fifth, 0 = rest. */
  bass: number[];
  kick: number[];
  snare: number[];
  hat: number[];
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  leadVol: number;
  bassVol: number;
  /** Pad (long chord) volume, 0 = none */
  padVol: number;
  arpOctave: number;
}

const S = (s: string) => s.split('').map((c) => (c === '.' ? -1 : parseInt(c, 10)));
const D = (s: string) => s.split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.6 : 0));

export const SONGS: Song[] = [
  // 0: Neon ruins – driving A minor
  {
    bpm: 124,
    chords: [
      { root: 57, minor: true },
      { root: 53, minor: false },
      { root: 48, minor: false },
      { root: 55, minor: false },
    ],
    arp: S('0120312.0120312.'),
    bass: S('1010201010102015').map((v) => (v < 0 ? 0 : v)),
    kick: D('x...x...x...x...'),
    snare: D('....x.......x...'),
    hat: D('..x...x...x...xo'),
    leadWave: 'square',
    bassWave: 'sawtooth',
    leadVol: 0.05,
    bassVol: 0.09,
    padVol: 0.02,
    arpOctave: 12,
  },
  // 1: Collapsed lab – tense D minor
  {
    bpm: 132,
    chords: [
      { root: 50, minor: true },
      { root: 46, minor: false },
      { root: 43, minor: true },
      { root: 45, minor: false },
    ],
    arp: S('0.1.2.3.2.1.0.3.'),
    bass: S('1101101011011020').map((v) => (v < 0 ? 0 : v)),
    kick: D('x..x..x...x..x..'),
    snare: D('....x.......x..o'),
    hat: D('xoxoxoxoxoxoxoxo'),
    leadWave: 'square',
    bassWave: 'square',
    leadVol: 0.045,
    bassVol: 0.08,
    padVol: 0.02,
    arpOctave: 24,
  },
  // 2: Rift core – aggressive E phrygian
  {
    bpm: 142,
    chords: [
      { root: 52, minor: true },
      { root: 53, minor: false },
      { root: 52, minor: true },
      { root: 50, minor: false },
    ],
    arp: S('0123210301232103'),
    bass: S('1111211111112151').map((v) => (v < 0 ? 0 : v)),
    kick: D('x.x.x.x.x.x.x.x.'),
    snare: D('....x.......x.x.'),
    hat: D('.x.x.x.x.x.x.x.x'),
    leadWave: 'sawtooth',
    bassWave: 'sawtooth',
    leadVol: 0.035,
    bassVol: 0.085,
    padVol: 0.025,
    arpOctave: 12,
  },
  // 3: Boss – C minor, heavy
  {
    bpm: 152,
    chords: [
      { root: 48, minor: true },
      { root: 44, minor: false },
      { root: 46, minor: false },
      { root: 43, minor: false },
    ],
    arp: S('0.2.1.3.0.2.3.1.'),
    bass: S('1012101210121015').map((v) => (v < 0 ? 0 : v)),
    kick: D('x.xx..x.x.xx..x.'),
    snare: D('....x.......x...'),
    hat: D('xxxxxxxxxxxxxxxx'),
    leadWave: 'square',
    bassWave: 'sawtooth',
    leadVol: 0.05,
    bassVol: 0.1,
    padVol: 0.02,
    arpOctave: 24,
  },
  // 4: Title / workshop – calm
  {
    bpm: 88,
    chords: [
      { root: 57, minor: true, seventh: true },
      { root: 53, minor: false, seventh: true },
      { root: 48, minor: false, seventh: true },
      { root: 52, minor: true, seventh: true },
    ],
    arp: S('0.2.3.1.2.0.3.2.'),
    bass: S('1000000010000000').map((v) => (v < 0 ? 0 : v)),
    kick: D('................'),
    snare: D('................'),
    hat: D('....o.......o...'),
    leadWave: 'triangle',
    bassWave: 'triangle',
    leadVol: 0.06,
    bassVol: 0.08,
    padVol: 0.03,
    arpOctave: 12,
  },
];

function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class Music {
  private ctx: AudioContext;
  private out: GainNode;
  private songGain: GainNode | null = null;
  private song: Song | null = null;
  private songId = -1;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private kickBuf: AudioBuffer;
  private snareBuf: AudioBuffer;
  private hatBuf: AudioBuffer;

  constructor(ctx: AudioContext, out: GainNode) {
    this.ctx = ctx;
    this.out = out;
    this.kickBuf = this.makeDrum('kick');
    this.snareBuf = this.makeDrum('snare');
    this.hatBuf = this.makeDrum('hat');
  }

  private makeDrum(kind: 'kick' | 'snare' | 'hat'): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const dur = kind === 'kick' ? 0.25 : kind === 'snare' ? 0.18 : 0.05;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let phase = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const env = Math.pow(1 - p, kind === 'hat' ? 3 : 2);
      if (kind === 'kick') {
        const f = 140 * Math.pow(40 / 140, p);
        phase += f / sr;
        d[i] = Math.sin(phase * Math.PI * 2) * env * 0.9;
      } else if (kind === 'snare') {
        const noise = Math.random() * 2 - 1;
        phase += 190 / sr;
        d[i] = (noise * 0.6 + Math.sin(phase * Math.PI * 2) * 0.4 * (1 - p)) * env * 0.6;
      } else {
        const noise = Math.random() * 2 - 1;
        lp += (noise - lp) * 0.5;
        d[i] = (noise - lp) * env * 0.5;
      }
    }
    return buf;
  }

  get currentSong(): number {
    return this.songId;
  }

  play(id: number): void {
    if (id === this.songId && this.song) return;
    this.stop(0.6);
    const song = SONGS[id];
    if (!song) return;
    this.song = song;
    this.songId = id;
    this.step = 0;
    this.songGain = this.ctx.createGain();
    this.songGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.songGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.8);
    this.songGain.connect(this.out);
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(fade = 0.5): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const g = this.songGain;
    if (g) {
      const now = this.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
      window.setTimeout(() => g.disconnect(), (fade + 0.2) * 1000);
    }
    this.songGain = null;
    this.song = null;
    this.songId = -1;
  }

  private schedule(): void {
    const song = this.song;
    const g = this.songGain;
    if (!song || !g) return;
    const stepDur = 60 / song.bpm / 4;
    // If the tab was suspended, skip ahead rather than bursting notes.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.14) {
      this.playStep(song, g, this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private chordNotes(c: Song['chords'][number]): number[] {
    const third = c.minor ? 3 : 4;
    const top = c.seventh ? (c.minor ? 10 : 11) : 12;
    return [c.root, c.root + third, c.root + 7, c.root + top];
  }

  private playStep(song: Song, g: GainNode, step: number, time: number, stepDur: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16) % song.chords.length;
    const chord = song.chords[bar];
    const notes = this.chordNotes(chord);

    const a = song.arp[s];
    if (a >= 0) this.note(g, song.leadWave, midiHz(notes[a] + song.arpOctave), time, stepDur * 0.9, song.leadVol, 2400);

    const b = song.bass[s];
    if (b > 0) {
      const m = b === 2 ? chord.root - 12 : b === 5 ? chord.root - 12 + 7 : chord.root - 24;
      this.note(g, song.bassWave, midiHz(m), time, stepDur * 0.85, song.bassVol, 700);
    }
    if (s === 0 && song.padVol > 0) {
      for (let i = 0; i < 3; i++) this.note(g, 'triangle', midiHz(notes[i] + 12), time, stepDur * 15, song.padVol, 1800, 0.25);
    }
    if (song.kick[s] > 0) this.drum(g, this.kickBuf, time, 0.55 * song.kick[s]);
    if (song.snare[s] > 0) this.drum(g, this.snareBuf, time, 0.35 * song.snare[s]);
    if (song.hat[s] > 0) this.drum(g, this.hatBuf, time, 0.18 * song.hat[s]);
  }

  private note(g: GainNode, wave: OscillatorType, freq: number, time: number, dur: number, vol: number, cutoff: number, attack = 0.005): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(freq, time);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, time);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, time);
    e.gain.linearRampToValueAtTime(vol, time + attack);
    e.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.01, dur));
    o.connect(f);
    f.connect(e);
    e.connect(g);
    o.start(time);
    o.stop(time + dur + 0.05);
    o.onended = () => {
      o.disconnect();
      f.disconnect();
      e.disconnect();
    };
  }

  private drum(g: GainNode, buf: AudioBuffer, time: number, vol: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const e = this.ctx.createGain();
    e.gain.value = vol;
    src.connect(e);
    e.connect(g);
    src.start(time);
    src.onended = () => {
      src.disconnect();
      e.disconnect();
    };
  }
}
