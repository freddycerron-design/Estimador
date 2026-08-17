-- Proyectos históricos (referencia) y proyectos-en-estimación (spec §4).
-- embedding: vector(1536) porque el modelo de embeddings por defecto es
-- openai/text-embedding-3-small vía OpenRouter/InsForge Model Gateway.
CREATE TABLE IF NOT EXISTS projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text NOT NULL,
  project_type      text NOT NULL,
  industry          text,
  technologies      text[] NOT NULL DEFAULT '{}',
  team_size         integer,
  duration_weeks    numeric,
  actual_cost       numeric,
  status            text NOT NULL DEFAULT 'historical_reference', -- historical_reference|active_estimate|completed
  embedding         vector(1536),
  source            text NOT NULL DEFAULT 'synthetic', -- synthetic|imported|real
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_embedding ON projects USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

-- Características extraídas de cada proyecto, con trazabilidad de procedencia (spec §31).
CREATE TABLE IF NOT EXISTS project_features (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category      text NOT NULL, -- functional|technical|integration|non_functional
  feature_key   text NOT NULL,
  feature_value jsonb NOT NULL,
  extracted_by  text NOT NULL DEFAULT 'manual', -- manual|agent
  confidence    numeric,
  provenance    text NOT NULL DEFAULT 'FACTUAL'
);
CREATE INDEX IF NOT EXISTS idx_project_features_project ON project_features (project_id);

CREATE TABLE IF NOT EXISTS project_estimates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  uuid REFERENCES projects(id),
  conversation_id             uuid REFERENCES conversations(id),
  template_used               text, -- 'executive' | 'detailed'
  status                      text NOT NULL DEFAULT 'draft', -- draft|final|superseded
  duration_weeks_optimistic   numeric,
  duration_weeks_probable     numeric,
  duration_weeks_pessimistic  numeric,
  cost_optimistic             numeric,
  cost_probable               numeric,
  cost_pessimistic            numeric,
  currency                    text NOT NULL DEFAULT 'USD',
  confidence_score            numeric, -- 0..1
  confidence_factors          jsonb,   -- {similarity_avg, sample_size, dispersion, info_completeness}
  similarity_threshold_met    boolean NOT NULL DEFAULT false,
  skill_versions_used         jsonb,   -- {similarity: skill_version_id, estimation: skill_version_id, ...}
  risks                       text[],  -- salida de analyze_risks al momento del reporte (para exportar Excel/PPTX fielmente)
  recommendations             text[],
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_estimates_conversation ON project_estimates (conversation_id);

CREATE TABLE IF NOT EXISTS estimate_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id   uuid NOT NULL REFERENCES project_estimates(id) ON DELETE CASCADE,
  phase_id      uuid NOT NULL REFERENCES phases(id),
  role_id       uuid NOT NULL REFERENCES roles(id),
  hours         numeric NOT NULL,
  provenance    text NOT NULL,
  source_note   text
);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate ON estimate_line_items (estimate_id);

-- Auditoría de qué proyectos se usaron como referencia para una estimación, y por qué (spec §10, §16).
CREATE TABLE IF NOT EXISTS reference_projects (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id            uuid NOT NULL REFERENCES project_estimates(id) ON DELETE CASCADE,
  reference_project_id   uuid NOT NULL REFERENCES projects(id),
  similarity_score       numeric NOT NULL,
  similarity_breakdown   jsonb NOT NULL, -- {functionality, technology, complexity, integrations, size, scope, context}
  weight_applied         numeric NOT NULL,
  differences_note       text,
  is_outlier             boolean NOT NULL DEFAULT false,
  outlier_reason         text
);
CREATE INDEX IF NOT EXISTS idx_reference_projects_estimate ON reference_projects (estimate_id);

-- Auditoría de TODOS los candidatos evaluados en una búsqueda de similitud, no solo los elegidos.
CREATE TABLE IF NOT EXISTS similarity_results (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id        uuid REFERENCES conversations(id),
  candidate_project_id   uuid NOT NULL REFERENCES projects(id),
  total_similarity       numeric NOT NULL,
  dimension_scores       jsonb NOT NULL,
  weight_profile_id      uuid REFERENCES similarity_weight_profiles(id),
  computed_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_similarity_results_conversation ON similarity_results (conversation_id);

-- Resultados reales de un proyecto terminado, comparados contra su estimación (spec §18).
CREATE TABLE IF NOT EXISTS project_actuals (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid NOT NULL REFERENCES projects(id),
  estimate_id              uuid REFERENCES project_estimates(id),
  actual_effort_hours      jsonb NOT NULL, -- {phase_id: {role_id: hours}}
  actual_duration_weeks    numeric,
  actual_cost              numeric,
  effort_variance_pct      numeric,
  duration_variance_pct    numeric,
  cost_variance_pct        numeric,
  completed_at             date,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_actuals_project ON project_actuals (project_id);

CREATE TABLE IF NOT EXISTS feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id   uuid NOT NULL REFERENCES project_estimates(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id),
  rating        integer,
  comments      text,
  categories    text[],
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_estimate ON feedback (estimate_id);
