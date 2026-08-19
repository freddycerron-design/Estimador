-- Parámetros de estimación por-conversación (spec pedido por usuario: al iniciar una estimación
-- el usuario ve los parámetros globales precargados con un check "aplicar en esta estimación" y
-- puede editar el valor; si no marca, se usa el default global sin cambios).
--
-- `conversations.parameters` guarda la INTENCIÓN del usuario al iniciar la conversación (qué
-- marcó y con qué valor). `project_estimates.parameters` congela lo EFECTIVAMENTE usado (merge
-- final: override si estaba incluido, si no el valor global vigente en ese momento) — trazabilidad
-- real de qué parametrización produjo esa estimación, y de dónde "Refinar estimación" precarga.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parameters jsonb;
ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS parameters jsonb;
