export type NameableProfile = {
  full_name?: string | null;
  handle?: string | null;
  id?: string | null;
} | null | undefined;

/** Derive a friendly, never-"User" display name for a profile. */
export function displayName(profile: NameableProfile): string {
  if (!profile) return "Learner";
  if (profile.full_name && profile.full_name.trim()) return profile.full_name.trim();
  if (profile.handle && profile.handle.trim()) return `@${profile.handle.trim()}`;
  const id = profile.id ?? "";
  return `Learner ${id ? id.slice(0, 6) : "?"}`;
}

export function initialsOf(profile: NameableProfile): string {
  const name = profile?.full_name || profile?.handle;
  if (!name) {
    const id = profile?.id ?? "";
    return id ? id.slice(0, 2).toUpperCase() : "?";
  }
  return name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
