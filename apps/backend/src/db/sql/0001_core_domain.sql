-- Perfil de usuario de la app, referenciando el id de usuario emitido por InsForge Auth.
-- No duplica credenciales: InsForge Auth es la fuente de verdad de email/password/OAuth.
-- id es TEXT (no uuid): InsForge emite ids con prefijo, ej. "usr_abc123", no UUIDs.
CREATE TABLE IF NOT EXISTS users (
  id          text PRIMARY KEY, -- = id de usuario de InsForge Auth
  email       text NOT NULL UNIQUE,
  name        text,
  app_role    text NOT NULL DEFAULT 'estimator', -- 'admin' | 'estimator' | 'viewer'
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Catálogo de Skills y sus versiones parametrizadas (spec §21, §25).
-- La "definition" es JSON de configuración/umbrales, NUNCA código ejecutable:
-- evita auto-modificación de lógica sin revisión humana.
CREATE TABLE IF NOT EXISTS skills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE, -- 'project-similarity', 'estimation', ...
  display_name  text NOT NULL,
  description   text
);

CREATE TABLE IF NOT EXISTS skill_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id      uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  definition    jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'draft', -- draft|evaluation|pending_approval|approved|active|deprecated
  created_by    text REFERENCES users(id),
  approved_by   text REFERENCES users(id),
  activated_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version)
);
CREATE INDEX IF NOT EXISTS idx_skill_versions_active ON skill_versions (skill_id, status);

CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES users(id),
  title       text,
  status      text NOT NULL DEFAULT 'NEW', -- ver ConversationStatus en shared-types
  context     jsonb NOT NULL DEFAULT '{}'::jsonb, -- requerimiento estructurado acumulado + iteration_count
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text NOT NULL, -- 'user' | 'assistant' | 'tool'
  content          text,
  tool_calls       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);
