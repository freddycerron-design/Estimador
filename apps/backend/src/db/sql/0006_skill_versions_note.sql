-- Nota/descripción libre para una versión de skill (spec §21/§25): el admin humano que crea
-- una nueva versión puede dejar contexto de por qué la creó ("subo candidateLimit a 15 porque..."),
-- separado de `definition` (que es SOLO parametrización consumida en runtime por skill-runtime.ts).
ALTER TABLE skill_versions ADD COLUMN IF NOT EXISTS note text;
