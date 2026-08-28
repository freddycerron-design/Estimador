import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { CostBreakdown, CostLine, EstimateLineItem, EffortRange } from "@estimador/shared-types";
import { defineSkill } from "../types.js";
import { loadActiveCostRates } from "../../config/cost-rates.js";
import { getSetting } from "../../config/system-settings.js";

const LineItemSchema = z.object({
  phaseId: z.string(),
  phaseName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
  hours: z.number(),
  provenance: z.string(),
  sourceNote: z.string().optional(),
});

const InputSchema = z.object({
  lineItems: z.array(LineItemSchema),
  effortHoursRange: z.object({ optimistic: z.number(), probable: z.number(), pessimistic: z.number() }),
  currency: z.string().default("USD"),
});

export const costCalculationSkill = defineSkill<
  { lineItems: EstimateLineItem[]; effortHoursRange: EffortRange; currency?: string },
  CostBreakdown
>({
  key: "cost-calculation",
  toolName: "calculate_cost",
  description:
    "Calcula el costo de la estimación (horas × tarifa por rol) y agrega overhead y contingencia, usando tarifas, moneda y porcentajes configurables (spec §14).",
  inputSchema: zodToJsonSchema(InputSchema) as any,
  async execute(input, ctx) {
    const parsed = InputSchema.parse({ ...input, currency: input.currency ?? "USD" });
    const rates = await loadActiveCostRates();
    const overheadPct = getSetting(ctx.settings, "DEFAULT_OVERHEAD_PCT", 0.1);
    const contingencyPct = getSetting(ctx.settings, "DEFAULT_CONTINGENCY_PCT", 0.15);

    // Horas totales por rol (para el costo "probable", basado en lineItems ya calculados).
    const hoursByRole = new Map<string, { name: string; hours: number }>();
    for (const item of parsed.lineItems) {
      const acc = hoursByRole.get(item.roleId) ?? { name: item.roleName, hours: 0 };
      acc.hours += item.hours;
      hoursByRole.set(item.roleId, acc);
    }

    const byRole: CostLine[] = [];
    let laborCost = 0;
    for (const [roleId, { name, hours }] of hoursByRole) {
      const rate = Number(rates.get(roleId)?.rate_per_hour ?? 40);
      const allocationPct = Number(rates.get(roleId)?.allocation_pct ?? 1);
      const cost = hours * rate;
      laborCost += cost;
      byRole.push({ roleId, roleName: name, hours, ratePerHour: rate, allocationPct, cost: Math.round(cost) });
    }
    byRole.sort((a, b) => b.cost - a.cost);

    const overheadCost = Math.round(laborCost * overheadPct);
    const contingencyCost = Math.round(laborCost * contingencyPct);
    const probableCost = Math.round(laborCost + overheadCost + contingencyCost);

    // Rango de costo: aplica el mismo ratio horas-optimista/pesimista sobre el costo probable.
    const probableHours = parsed.effortHoursRange.probable || 1;
    const optimisticCost = Math.round(probableCost * (parsed.effortHoursRange.optimistic / probableHours));
    const pessimisticCost = Math.round(probableCost * (parsed.effortHoursRange.pessimistic / probableHours));

    return {
      currency: parsed.currency,
      byRole,
      laborCost: Math.round(laborCost),
      overheadPct,
      contingencyPct,
      overheadCost,
      contingencyCost,
      totalCost: { optimistic: optimisticCost, probable: probableCost, pessimistic: pessimisticCost },
    };
  },
});
