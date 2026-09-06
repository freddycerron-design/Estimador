-- Código corto de proyecto (spec pedido por usuario: análogo a REQ-<number> de requirements),
-- útil sobre todo para identificar proyectos completados/históricos sin exponer su UUID interno.
-- Se agrega a TODOS los proyectos por consistencia con el patrón de requirements (Postgres
-- retro-numera las filas existentes al agregar una columna IDENTITY); en la UI el código solo
-- se muestra para proyectos con status='completed' (spec).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS number integer GENERATED ALWAYS AS IDENTITY UNIQUE;
