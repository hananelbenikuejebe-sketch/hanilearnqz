/**
 * Chunked profile lookups.
 *
 * PostgREST puts `.in()` filters in the query string, so a single request with
 * hundreds of UUIDs blows past the URL length limit and fails — which used to
 * silently degrade every display name in group chats to "Learner". Always fetch
 * profiles through here.
 */

const CHUNK = 80;

export type LookedUpProfile = {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

export async function fetchProfiles(db: any, ids: Array<string>): Promise<Array<LookedUpProfile>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];

  const chunks: Array<Array<string>> = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await db
        .from("profiles")
        .select("id, full_name, handle, avatar_url")
        .in("id", chunk);
      if (error) throw error;
      return (data ?? []) as Array<LookedUpProfile>;
    }),
  );

  return results.flat();
}

export async function fetchProfileMap(db: any, ids: Array<string>) {
  const rows = await fetchProfiles(db, ids);
  return new Map(rows.map((p) => [p.id, p]));
}
