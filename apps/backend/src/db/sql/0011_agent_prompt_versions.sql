-- Hace editable el system prompt del orquestador conversacional (spec pedido por usuario) —
-- versionado igual que skill_versions/similarity_weight_profiles/cost_rates: nunca se
-- sobreescribe, cada cambio crea una fila nueva y la activa, dejando la anterior como historial
-- para poder volver atrás si un cambio rompe el comportamiento del agente (alto impacto: afecta
-- a TODAS las conversaciones, no solo una skill puntual).
CREATE TABLE IF NOT EXISTS agent_prompt_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text NOT NULL,
  version     integer NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  note        text,
  created_by  text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- A lo sumo una versión activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompt_versions_one_active ON agent_prompt_versions (is_active) WHERE is_active;
