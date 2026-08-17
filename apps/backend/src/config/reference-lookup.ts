import { db, unwrap } from "../db/insforge-client.js";
import type { PhaseRow, RoleRow } from "../db/types.js";

interface ReferenceLookup {
  phasesById: Map<string, PhaseRow>;
  rolesById: Map<string, RoleRow>;
}

let cached: ReferenceLookup | null = null;

/** Cachea phases/roles por proceso — cambian con muy poca frecuencia (config de admin). */
export async function loadReferenceLookup(): Promise<ReferenceLookup> {
  if (cached) return cached;
  const [phases, roles] = await Promise.all([
    unwrap<PhaseRow[]>("select:phases", db.from("phases").select().eq("is_active", true)),
    unwrap<RoleRow[]>("select:roles", db.from("roles").select().eq("is_active", true)),
  ]);
  cached = {
    phasesById: new Map(phases.map((p) => [p.id, p])),
    rolesById: new Map(roles.map((r) => [r.id, r])),
  };
  return cached;
}

export function invalidateReferenceLookupCache() {
  cached = null;
}
