-- Catálogo de requerimientos cargados de antemano (spec §2, adaptado a pedido del usuario:
-- mantenimiento CRUD + carga masiva + selección para disparar una estimación). Distinto de
-- `projects`: un requirement es la ENTRADA de un futuro proyecto (aún sin estimar/ejecutar),
-- projects son proyectos ya históricos/en curso/completados.
CREATE TABLE IF NOT EXISTS requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            integer GENERATED ALWAYS AS IDENTITY UNIQUE, -- identificador corto para buscar ("REQ-<number>")
  title             text NOT NULL,
  description       text NOT NULL,
  project_type      text,
  industry          text,
  technologies      text[] NOT NULL DEFAULT '{}',
  modules           text[] NOT NULL DEFAULT '{}',
  integrations      text[] NOT NULL DEFAULT '{}',
  num_users         integer,
  num_interfaces    integer,
  complexity        text,
  status            text NOT NULL DEFAULT 'new', -- new|in_estimation|estimated
  estimate_id       uuid REFERENCES project_estimates(id),
  created_by        text REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements (status);

-- Liga la conversación al requerimiento que la originó, cuando se estima "por número"
-- en vez de texto libre — permite marcar el requirement como 'estimated' al terminar.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS requirement_id uuid REFERENCES requirements(id);
