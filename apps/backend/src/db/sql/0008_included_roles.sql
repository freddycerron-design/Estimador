-- Selección de roles a incluir/excluir por-estimación (spec pedido por usuario: junto a los
-- parámetros, elegir qué roles participan en el desglose de esfuerzo). Mismo criterio que
-- `parameters` (0007): `conversations.included_role_ids` guarda la selección del usuario al
-- iniciar la conversación (array de role.id, null = sin filtrar = comportamiento actual);
-- `project_estimates.included_role_ids` congela lo efectivamente usado, para trazabilidad y
-- para que "Refinar estimación" pueda precargar la misma selección.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS included_role_ids jsonb;
ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS included_role_ids jsonb;
