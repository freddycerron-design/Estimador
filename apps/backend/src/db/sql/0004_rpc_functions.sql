-- Funciones Postgres invocadas en runtime vía insforge.database.rpc(name, args) —
-- necesarias porque InsForge no expone conexión Postgres directa para operadores
-- pgvector crudos (<=>) desde el cliente REST/SDK.

-- Similitud semántica por embedding de proyectos históricos/candidatos (spec §5, §6).
CREATE OR REPLACE FUNCTION match_projects(
  query_embedding vector(1536),
  match_count int DEFAULT 20,
  filter_status text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  semantic_similarity double precision
) LANGUAGE sql STABLE AS $$
  SELECT p.id, 1 - (p.embedding <=> query_embedding) AS semantic_similarity
  FROM projects p
  WHERE p.embedding IS NOT NULL
    AND (filter_status IS NULL OR p.status = filter_status)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Recuperación semántica de experiencias/lecciones aprendidas relevantes (spec §18-20).
CREATE OR REPLACE FUNCTION match_experiences(
  query_embedding vector(1536),
  match_count int DEFAULT 10
) RETURNS TABLE (
  id uuid,
  summary text,
  lesson text,
  similarity double precision
) LANGUAGE sql STABLE AS $$
  SELECT e.id, e.summary, e.lesson, 1 - (e.embedding <=> query_embedding) AS similarity
  FROM experiences e
  WHERE e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Recuperación semántica de memorias (reglas/patrones aprendidos en lenguaje estructurado).
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_scope text DEFAULT NULL,
  match_count int DEFAULT 10
) RETURNS TABLE (
  id uuid,
  scope text,
  key text,
  value jsonb,
  similarity double precision
) LANGUAGE sql STABLE AS $$
  SELECT m.id, m.scope, m.key, m.value, 1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.embedding IS NOT NULL
    AND (match_scope IS NULL OR m.scope = match_scope)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;
