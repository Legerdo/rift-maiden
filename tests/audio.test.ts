import { describe, it, expect } from 'vitest';
import { SFX, renderLayers, renderBeamLoop } from '../src/audio/synth';

describe('procedural sfx', () => {
  it('every effect renders finite, audible, non-clipping samples', () => {
    for (const [id, def] of Object.entries(SFX)) {
      const data = renderLayers(def, 22050);
      let peak = 0;
      let bad = 0;
      for (const v of data) {
        if (!Number.isFinite(v)) bad++;
        peak = Math.max(peak, Math.abs(v));
      }
      expect(bad, id).toBe(0);
      expect(peak, `${id} audible`).toBeGreaterThan(0.02);
      expect(peak, `${id} clipping`).toBeLessThanOrEqual(1);
      expect(data.length / 22050, `${id} length`).toBeLessThan(2);
    }
  });

  it('weapons sound different from each other', () => {
    const sig = (id: string) => {
      const d = renderLayers(SFX[id], 22050);
      let e = 0;
      for (const v of d) e += v * v;
      return { len: d.length, energy: e };
    };
    const smg = sig('smg');
    const sg = sig('shotgun');
    const rail = sig('rail');
    expect(sg.len).toBeGreaterThan(smg.len * 3);
    expect(rail.len).toBeGreaterThan(smg.len * 3);
    expect(sg.energy).toBeGreaterThan(smg.energy);
  });

  it('beam loop is one second long', () => {
    expect(renderBeamLoop(8000).length).toBe(8000);
  });
});
