export type SkillId = 'shockwave' | 'overdrive' | 'orbital' | 'singularity';

export interface SkillDef {
  id: SkillId;
  cooldown: number;
  icon: string;
  /** Meta unlock id (undefined = available from the start). */
  unlock?: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  shockwave: { id: 'shockwave', cooldown: 9, icon: 'sk_shockwave' },
  overdrive: { id: 'overdrive', cooldown: 22, icon: 'sk_overdrive' },
  orbital: { id: 'orbital', cooldown: 15, icon: 'sk_orbital', unlock: 's_orbital' },
  singularity: { id: 'singularity', cooldown: 18, icon: 'sk_singularity', unlock: 's_singularity' },
};

export const SKILL_ORDER: SkillId[] = ['shockwave', 'overdrive', 'orbital', 'singularity'];
