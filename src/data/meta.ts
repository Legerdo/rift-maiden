// Permanent progression bought with 균열 파편 (rift shards) in the workshop.
// Flat stat boosts exist but most entries unlock new systems or build rules.

export type MetaCat = 'weapon' | 'skill' | 'module' | 'gear' | 'boost';

export interface MetaDef {
  id: string;
  cat: MetaCat;
  icon: string;
  /** Cost per level (length = max level). */
  costs: number[];
  requires?: string;
}

export const META: MetaDef[] = [
  // Weapons
  { id: 'w_shotgun', cat: 'weapon', icon: 'w_shotgun', costs: [35] },
  { id: 'w_rail', cat: 'weapon', icon: 'w_rail', costs: [70] },
  { id: 'w_beam', cat: 'weapon', icon: 'w_beam', costs: [110] },
  // Skills
  { id: 's_orbital', cat: 'skill', icon: 'sk_orbital', costs: [45] },
  { id: 's_singularity', cat: 'skill', icon: 'sk_singularity', costs: [80] },
  // Upgrade modules (add new upgrades + fusions to the in-run pool)
  { id: 'm_lightning', cat: 'module', icon: 'chain', costs: [25] },
  { id: 'm_missile', cat: 'module', icon: 'missile', costs: [30] },
  { id: 'm_frost', cat: 'module', icon: 'frost', costs: [40] },
  { id: 'm_demolition', cat: 'module', icon: 'corpse_blast', costs: [40] },
  { id: 'm_orbit', cat: 'module', icon: 'orbit', costs: [50] },
  { id: 'm_droneai', cat: 'module', icon: 'drone_ai', costs: [60] },
  { id: 'm_phantom', cat: 'module', icon: 'dash_strike', costs: [60] },
  // Gear / automation
  { id: 'g_autocollect', cat: 'gear', icon: 'magnet', costs: [20] },
  { id: 'g_reroll', cat: 'gear', icon: 'reroll', costs: [20, 40, 70] },
  { id: 'g_startpick', cat: 'gear', icon: 'startpick', costs: [60] },
  { id: 'g_startdrone', cat: 'gear', icon: 'drone', costs: [90] },
  { id: 'g_revive', cat: 'gear', icon: 'revive', costs: [120] },
  // Boosts
  { id: 'b_hp', cat: 'boost', icon: 'vitality', costs: [30, 60, 100] },
  { id: 'b_shard', cat: 'boost', icon: 'shard', costs: [25, 50, 90] },
  { id: 'b_magnet', cat: 'boost', icon: 'magnet', costs: [15, 35] },
];

export const META_MAP: Record<string, MetaDef> = Object.fromEntries(META.map((m) => [m.id, m]));
export const META_IDS: string[] = META.map((m) => m.id);
export const META_CATS: MetaCat[] = ['weapon', 'skill', 'module', 'gear', 'boost'];

export function metaLevel(meta: Record<string, number>, id: string): number {
  return meta[id] ?? 0;
}

export function nextCost(meta: Record<string, number>, id: string): number | null {
  const def = META_MAP[id];
  if (!def) return null;
  const lv = metaLevel(meta, id);
  if (lv >= def.costs.length) return null;
  return def.costs[lv];
}
