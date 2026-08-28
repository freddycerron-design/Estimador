import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SimilarityWeightsSchema } from "@estimador/shared-types";
import { db, unwrap } from "../../db/insforge-client.js";
import type { SystemSettingRow, SimilarityWeightProfileRow, CostRateRow, PhaseRow, RoleRow } from "../../db/types.js";
import { invalidateSettingsCache } from "../../skills/skill-runtime.js";
import { invalidateCostRatesCache } from "../../config/cost-rates.js";
import { invalidateReferenceLookupCache } from "../../config/reference-lookup.js";
import { requireAdmin } from "../../plugins/require-admin.js";

const SettingBody = z.object({ key: z.string(), value: z.unknown() });
const WeightsBody = z.object({ weights: SimilarityWeightsSchema, name: z.string().default("custom") });
const CostRateBody = z.object({
  roleId: z.string().uuid(),
  ratePerHour: z.number().positive(),
  currency: z.string().default("USD"),
  // % de dedicación del rol al proyecto — no siempre es 100% (spec pedido por usuario).
  allocationPct: z.number().min(0.01).max(1).default(1),
});

export default async function adminConfigRoutes(app: FastifyInstance) {
  app.get("/admin/config/system-settings", async () => unwrap<SystemSettingRow[]>("select:system_settings", db.from("system_settings").select()));

  app.put("/admin/config/system-settings", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = SettingBody.parse(req.body);
    const [row] = await unwrap<SystemSettingRow[]>(
      "upsert:system_settings",
      db
        .from("system_settings")
        .update({ value: body.value, updated_by: req.userId, updated_at: new Date().toISOString() })
        .eq("key", body.key)
        .select()
    );
    let result = row;
    if (!result) {
      const [inserted] = await unwrap<SystemSettingRow[]>(
        "insert:system_settings",
        db.from("system_settings").insert([{ key: body.key, value: body.value, updated_by: req.userId }]).select()
      );
      result = inserted;
    }
    invalidateSettingsCache();
    reply.code(200);
    return result;
  });

  app.get("/admin/config/similarity-weights", async () =>
    unwrap<SimilarityWeightProfileRow[]>("select:similarity_weight_profiles", db.from("similarity_weight_profiles").select().order("version", { ascending: false }))
  );

  /** Crea una NUEVA versión de pesos y la activa, desactivando la anterior — nunca sobreescribe (spec §6: configurable, versionado). */
  app.put("/admin/config/similarity-weights", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = WeightsBody.parse(req.body);
    const current = await unwrap<SimilarityWeightProfileRow[]>(
      "select:similarity_weight_profiles:active",
      db.from("similarity_weight_profiles").select().eq("is_active", true).limit(1)
    );
    const nextVersion = (current[0]?.version ?? 0) + 1;

    await unwrap(
      "deactivate:similarity_weight_profiles",
      db.from("similarity_weight_profiles").update({ is_active: false }).eq("is_active", true).select()
    );
    const [created] = await unwrap<SimilarityWeightProfileRow[]>(
      "insert:similarity_weight_profiles",
      db
        .from("similarity_weight_profiles")
        .insert([{ name: body.name, version: nextVersion, weights: body.weights, is_active: true, created_by: req.userId }])
        .select()
    );
    reply.code(201);
    return created;
  });

  app.get("/admin/config/cost-rates", async () => unwrap<CostRateRow[]>("select:cost_rates", db.from("cost_rates").select().eq("is_active", true)));

  /** Igual que weights: nueva versión de tarifa por rol, no overwrite (spec §14: tarifas configurables y versionadas). */
  app.put("/admin/config/cost-rates", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = CostRateBody.parse(req.body);
    await unwrap(
      "deactivate:cost_rates",
      db.from("cost_rates").update({ is_active: false, effective_to: new Date().toISOString().slice(0, 10) }).eq("role_id", body.roleId).eq("is_active", true).select()
    );
    const [created] = await unwrap<CostRateRow[]>(
      "insert:cost_rates",
      db
        .from("cost_rates")
        .insert([
          {
            role_id: body.roleId,
            currency: body.currency,
            rate_per_hour: body.ratePerHour,
            allocation_pct: body.allocationPct,
            effective_from: new Date().toISOString().slice(0, 10),
            version: 1,
            is_active: true,
          },
        ])
        .select()
    );
    invalidateCostRatesCache();
    reply.code(201);
    return created;
  });

  app.get("/admin/config/phases", async () => unwrap<PhaseRow[]>("select:phases", db.from("phases").select().order("sort_order")));
  app.get("/admin/config/roles", async () => unwrap<RoleRow[]>("select:roles", db.from("roles").select()));

  app.post("/admin/config/refresh-cache", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    invalidateSettingsCache();
    invalidateCostRatesCache();
    invalidateReferenceLookupCache();
    return { refreshed: true };
  });
}
