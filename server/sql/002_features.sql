-- Additive migration: existing users, papers and questions are preserved.
CREATE TABLE IF NOT EXISTS academic_years (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL UNIQUE,
 starts_on date, ends_on date, active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT academic_year_dates CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_academic_year ON academic_years(active) WHERE active;
CREATE TABLE IF NOT EXISTS institution_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 name varchar(200) NOT NULL DEFAULT 'QPaper Studio', logo_url text,
 address text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '',
 accent_color varchar(7) NOT NULL DEFAULT '#4f46e5', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO institution_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS question_bank (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject varchar(150) NOT NULL DEFAULT '', chapter varchar(150) NOT NULL DEFAULT '', topic varchar(150) NOT NULL DEFAULT '',
 difficulty varchar(10) NOT NULL DEFAULT 'medium' CHECK(difficulty IN('easy','medium','hard')),
 marks numeric(8,2) NOT NULL DEFAULT 1 CHECK(marks >= 0),
 type text NOT NULL CHECK(type IN ('Objective','Subjective','Fill in the Blanks','Match the Following','True/False')),
 body text NOT NULL, options jsonb NOT NULL DEFAULT '[]', pairs jsonb NOT NULL DEFAULT '[]',
 answer text NOT NULL DEFAULT '', image_url text, fingerprint char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_question_bank_owner ON question_bank(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_bank_subject ON question_bank(subject,chapter,difficulty);
CREATE INDEX IF NOT EXISTS idx_question_bank_search ON question_bank USING gin(to_tsvector('simple',coalesce(body,'')||' '||coalesce(subject,'')||' '||coalesce(chapter,'')));
CREATE TABLE IF NOT EXISTS paper_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
 name varchar(120) NOT NULL, description text NOT NULL DEFAULT '',
 layout jsonb NOT NULL, is_public boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paper_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
 version_number integer NOT NULL, snapshot jsonb NOT NULL,
 saved_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(paper_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_paper_versions ON paper_versions(paper_id,version_number DESC);
CREATE TABLE IF NOT EXISTS invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) NOT NULL,
 name varchar(120), role varchar(20) NOT NULL DEFAULT 'teacher' CHECK(role IN ('teacher','student')),
 token_hash char(64) NOT NULL UNIQUE, invited_by uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash char(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contact_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL,
 email varchar(255) NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE papers ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES academic_years(id) ON DELETE SET NULL;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES paper_templates(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer text NOT NULL DEFAULT '';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS bank_question_id uuid REFERENCES question_bank(id) ON DELETE SET NULL;
