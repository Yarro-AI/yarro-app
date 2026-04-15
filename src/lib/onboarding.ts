/**
 * Read onboarding_step from a PM record.
 * Added by migration but not yet in generated Supabase types.
 * Use this instead of inline type-casts.
 */
export function getOnboardingStep(pm: unknown): string | null {
  if (!pm || typeof pm !== 'object') return null
  return (pm as Record<string, unknown>).onboarding_step as string | null ?? null
}
