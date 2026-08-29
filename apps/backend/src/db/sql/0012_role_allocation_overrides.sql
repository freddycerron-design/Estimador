-- % de asignación por rol editable por-estimación (spec pedido por usuario, junto a "roles a
-- incluir en el desglose"). Mismo criterio que `included_role_ids` (0008):
-- `conversations.role_allocation_overrides` guarda lo que el usuario editó al iniciar la
-- conversación (jsonb Record<roleId, pct 0-1>; null = sin override = usa el % global vigente en
-- `cost_rates.allocation_pct`); `project_estimates.role_allocation_overrides` congela lo
-- efectivamente usado, para trazabilidad y para que "Refinar estimación" precargue lo mismo.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS role_allocation_overrides jsonb;
ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS role_allocation_overrides jsonb;
