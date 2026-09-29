// App-wide singletons: the save store and helpers around meta unlocks.

import { SaveStore } from './save';
import { META, META_IDS } from '../data/meta';
import { WEAPON_ORDER, WEAPON_UNLOCK, type WeaponId } from '../data/weapons';
import { SKILL_ORDER, SKILLS, type SkillId } from '../data/skills';
import { MAX_DEPTH } from '../data/zones';
import { audio } from '../audio/audio';

export const store = new SaveStore({
  metaIds: META_IDS,
  metaMax: Object.fromEntries(META.map((m) => [m.id, m.costs.length])),
  weapons: WEAPON_ORDER,
  skills: SKILL_ORDER,
  maxDepth: MAX_DEPTH,
});

export function metaLv(id: string): number {
  return store.data.meta[id] ?? 0;
}

export function hasMeta(id: string): boolean {
  return metaLv(id) > 0;
}

export function weaponUnlocked(w: WeaponId): boolean {
  const u = WEAPON_UNLOCK[w];
  return !u || hasMeta(u);
}

export function skillUnlocked(s: SkillId): boolean {
  const u = SKILLS[s].unlock;
  return !u || hasMeta(u);
}

/** Make sure the saved loadout only references unlocked content. */
export function validateLoadout(): void {
  const d = store.data;
  if (!weaponUnlocked(d.weapon as WeaponId)) d.weapon = 'smg';
  if (!skillUnlocked(d.skillQ as SkillId)) d.skillQ = 'shockwave';
  if (!skillUnlocked(d.skillE as SkillId)) d.skillE = 'overdrive';
  if (d.skillQ === d.skillE) {
    d.skillQ = 'shockwave';
    d.skillE = 'overdrive';
  }
  if (d.depth > d.maxDepth) d.depth = d.maxDepth;
}

export function unlockedPools(): Set<string> {
  const s = new Set<string>();
  for (const id of META_IDS) if (id.startsWith('m_') && hasMeta(id)) s.add(id);
  return s;
}

export function applyAudioSettings(): void {
  const st = store.data.settings;
  audio.setVolumes(st.master, st.music, st.sfx);
}

/** Debug / QA hooks (enabled in dev builds or with ?qa in the URL). */
export const QA_ENABLED: boolean =
  (typeof import.meta !== 'undefined' && !!import.meta.env?.DEV) ||
  (typeof location !== 'undefined' && location.search.includes('qa'));

if (QA_ENABLED && typeof window !== 'undefined') {
  const w = window as unknown as { __store?: SaveStore; __audio?: typeof audio };
  w.__store = store;
  w.__audio = audio;
}
