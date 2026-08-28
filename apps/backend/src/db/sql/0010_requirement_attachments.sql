-- Archivos adjuntos a un requerimiento con mayor detalle del que cabe en los campos
-- estructurados (spec pedido por usuario) — se extrae texto de cada uno al subirlo y ese texto
-- se incluye en el mensaje inicial de la conversación cuando se estima a partir de este
-- requerimiento, para que el agente lo "lea" como parte del requerimiento, no solo lo archive.
CREATE TABLE IF NOT EXISTS requirement_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id    uuid NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  filename          text NOT NULL,
  mime_type         text NOT NULL,
  size_bytes        integer NOT NULL,
  storage_url       text, -- null si el respaldo a Storage falló — no bloquea la lectura (nice-to-have)
  storage_key       text NOT NULL,
  extracted_text    text, -- null si no se pudo extraer (formato no soportado / archivo vacío / error)
  extraction_status text NOT NULL DEFAULT 'pending', -- ok|unsupported|error
  extraction_note   text,
  uploaded_by       text REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requirement_attachments_requirement ON requirement_attachments (requirement_id);
