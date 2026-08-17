-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector

-- Configuración global versionada, nunca hardcodeada en código de aplicación.
-- Claves esperadas: MIN_SIMILARITY_THRESHOLD, MAX_ADAPTIVE_ITERATIONS,
-- DEFAULT_CONTINGENCY_PCT, DEFAULT_OVERHEAD_PCT, OUTLIER_ZSCORE_THRESHOLD
CREATE TABLE IF NOT EXISTS system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  text, -- id de usuario InsForge (formato "usr_...", no UUID)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS phases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort_order  integer NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cost_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         uuid NOT NULL REFERENCES roles(id),
  currency        text NOT NULL DEFAULT 'USD',
  rate_per_hour   numeric(10,2) NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  version         integer NOT NULL DEFAULT 1,
  is_active       boolean NOT NULL DEFAULT true
);

-- Pesos de similitud multi-dimensional (spec §6). weights: {functionality, technology,
-- complexity, integrations, size, scope, context} — deben sumar 1.0. Uno activo a la vez.
CREATE TABLE IF NOT EXISTS similarity_weight_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  weights     jsonb NOT NULL,
  is_active   boolean NOT NULL DEFAULT false,
  created_by  text, -- id de usuario InsForge (formato "usr_...", no UUID)
  created_at  timestamptz NOT NULL DEFAULT now()
);
