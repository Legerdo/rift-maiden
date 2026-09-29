// Tiny localisation layer. Only Korean ships today, but every player-facing
// string goes through here so another language can be dropped in later.

import { KO_STRINGS, KO_UPGRADES, type UpgradeText } from './ko';

let strings: Record<string, string> = KO_STRINGS;
let upgrades: Record<string, UpgradeText> = KO_UPGRADES;

export function setLanguage(s: Record<string, string>, u: Record<string, UpgradeText>): void {
  strings = s;
  upgrades = u;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = strings[key];
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    s = key;
  }
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  }
  return s;
}

export function upgradeName(id: string): string {
  if (id === 'fallback_heal' || id === 'fallback_shard') return t(`upg.${id}`);
  return upgrades[id]?.name ?? id;
}

/** Description for acquiring level `nextLevel` (1-based). */
export function upgradeDesc(id: string, nextLevel: number, weapon?: string): string {
  if (id === 'fallback_heal' || id === 'fallback_shard') return t(`upg.${id}.desc`);
  const u = upgrades[id];
  if (!u) return id;
  const list = (weapon && u.weaponDesc?.[weapon]) || u.desc;
  return list[Math.min(list.length - 1, Math.max(0, nextLevel - 1))] ?? '';
}
