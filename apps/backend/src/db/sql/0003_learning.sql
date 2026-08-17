-- Memoria de largo plazo del sistema (no del modelo — spec: "no reentrenar Claude").
CREATE TABLE IF NOT EXISTS memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL, -- 'global' | 'skill' | 'project_type'
  key         text NOT NULL,
  value       jsonb NOT NULL,
  embedding   vector(1536),
  created_by  text NOT NULL, -- 'learning_agent' | 'human'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS experiences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id),
  estimate_id   uuid REFERENCES project_estimates(id),
  summary       text NOT NULL,
  lesson        text NOT NULL,
  tags          text[],
  embedding     vector(1536),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_experiences_embedding ON experiences USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS learning_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 text NOT NULL, -- variance_detected|feedback_received|pattern_detected
  source_estimate_id   uuid REFERENCES project_estimates(id),
  payload              jsonb NOT NULL,
  detected_at          timestamptz NOT NULL DEFAULT now(),
  processed            boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_learning_events_unprocessed ON learning_events (processed) WHERE processed = false;

-- Reglas de estimación versionadas — mismo ciclo de vida que skill_versions (spec §25).
CREATE TABLE IF NOT EXISTS estimation_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  rule_type     text NOT NULL, -- phase_multiplier|role_adjustment|risk_factor|...
  definition    jsonb NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'draft',
  created_by    text REFERENCES users(id),
  approved_by   text REFERENCES users(id),
  activated_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  input             jsonb NOT NULL,
  expected_output   jsonb NOT NULL,
  category          text
);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_case_id    uuid NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
  skill_version_id      uuid REFERENCES skill_versions(id),
  estimation_rule_id    uuid REFERENCES estimation_rules(id),
  passed                boolean NOT NULL,
  actual_output         jsonb NOT NULL,
  score                 numeric,
  run_at                timestamptz NOT NULL DEFAULT now()
);

-- Propuestas de mejora del Learning Agent (spec §24, §25). Nunca llegan a ACTIVE sin aprobación humana.
CREATE TABLE IF NOT EXISTS learning_proposals (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                         text NOT NULL, -- new_rule|rule_update|skill_update
  title                        text NOT NULL,
  description                  text,
  rationale                    text,
  diff                         jsonb NOT NULL,
  status                       text NOT NULL DEFAULT 'DRAFT',
  related_learning_event_ids   uuid[],
  target_estimation_rule_id    uuid REFERENCES estimation_rules(id),
  target_skill_id              uuid REFERENCES skills(id),
  evaluation_summary           jsonb,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  submitted_for_approval_at    timestamptz,
  approved_by                  text REFERENCES users(id),
  approved_at                  timestamptz,
  activated_at                 timestamptz
);
CREATE INDEX IF NOT EXISTS idx_learning_proposals_status ON learning_proposals (status);
