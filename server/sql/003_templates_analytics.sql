-- Additive: existing custom templates and papers remain unchanged.
ALTER TABLE paper_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_templates_owner_modified ON paper_templates(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);
CREATE INDEX IF NOT EXISTS idx_papers_subject ON papers(subject);
