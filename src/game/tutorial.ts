// In-play tutorial: one short prompt at a time, cleared by doing the thing.

import { store } from '../core/app';

type Step = 'move' | 'shoot' | 'jump' | 'dash' | 'xp' | 'skill';

const ORDER: Step[] = ['move', 'shoot', 'xp', 'jump', 'dash', 'skill'];
const KEYS: Record<Step, string> = {
  move: 'tut.move',
  shoot: 'tut.shoot',
  jump: 'tut.jump',
  dash: 'tut.dash',
  xp: 'tut.xp',
  skill: 'tut.skill',
};

export class Tutorial {
  private doneSet = new Set<Step>();
  private active: boolean;
  private hintKey: string | null = null;
  private hintT = 0;
  private stepT = 0;
  private showHints: boolean;

  constructor() {
    this.active = !store.data.tutorialDone;
    this.showHints = store.data.stats.runs < 3;
  }

  done(s: Step): void {
    if (this.doneSet.has(s)) return;
    if (this.current === s) this.stepT = 0;
    this.doneSet.add(s);
  }

  hint(key: string): void {
    if (!this.showHints && !key.startsWith('hint.boss')) return;
    this.hintKey = key;
    this.hintT = 4.5;
  }

  get current(): Step | null {
    if (!this.active) return null;
    for (const s of ORDER) if (!this.doneSet.has(s)) return s;
    return null;
  }

  /** Text key to show right now (tutorial step has priority over hints). */
  get text(): string | null {
    const c = this.current;
    if (c && this.stepT > 0.6) return KEYS[c];
    if (this.hintT > 0) return this.hintKey;
    return null;
  }

  update(dt: number): void {
    this.hintT = Math.max(0, this.hintT - dt);
    const c = this.current;
    if (c) {
      this.stepT += dt;
      // never nag: a prompt that was ignored for a while moves on by itself
      if (this.stepT > 14) this.done(c);
    }
    if (this.active && !c) {
      this.active = false;
      store.data.tutorialDone = true;
      store.save();
    }
  }

  /** Called when a step completes so the next one waits a moment. */
  advance(): void {
    this.stepT = 0;
  }
}
