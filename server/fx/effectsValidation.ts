export const FX_EFFECT_TYPES = ['fight', 'horror', 'explosion'] as const;
export type ServerMovieEffect = { t: number; d: number; type: typeof FX_EFFECT_TYPES[number] };

export function validateMovieEffects(value: unknown): ServerMovieEffect[] {
  if (!Array.isArray(value)) throw new Error('Effects must be an array');
  if (value.length > 300) throw new Error('At most 300 effects are allowed');
  const result = value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Invalid effect at index ${index}`);
    const candidate = entry as Record<string, unknown>;
    const t = Number(candidate.t), d = Number(candidate.d), type = candidate.type;
    if (!Number.isFinite(t) || t < 0 || t > 86400) throw new Error(`Invalid effect time at index ${index}`);
    if (!Number.isFinite(d) || d < 0.5 || d > 30) throw new Error(`Invalid effect duration at index ${index}`);
    if (typeof type !== 'string' || !(FX_EFFECT_TYPES as readonly string[]).includes(type)) throw new Error(`Invalid effect type at index ${index}`);
    return { t, d, type: type as ServerMovieEffect['type'] };
  });
  return result.sort((a, b) => a.t - b.t);
}
