CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL,
 email varchar(255) NOT NULL UNIQUE, password_hash text NOT NULL,
 role varchar(20) NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin','teacher','student')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS papers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES users(id),
 school text NOT NULL DEFAULT '', exam text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '',
 duration text NOT NULL DEFAULT '', total_marks numeric(10,2), paper_type text NOT NULL DEFAULT 'Both',
 status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
 position integer NOT NULL, name text NOT NULL, title text NOT NULL DEFAULT '',
 instructions text NOT NULL DEFAULT '', marks_per_question numeric(10,2) NOT NULL DEFAULT 1 CHECK (marks_per_question >= 0)
);
CREATE TABLE IF NOT EXISTS questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
 position integer NOT NULL, type text NOT NULL CHECK(type IN ('Objective','Subjective','Fill in the Blanks','Match the Following','True/False')),
 body text NOT NULL DEFAULT '', image_url text, image_key text
);
CREATE TABLE IF NOT EXISTS question_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
 position integer NOT NULL, value text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS question_pairs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
 position integer NOT NULL, left_text text NOT NULL DEFAULT '', right_text text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_papers_author ON papers(author_id);
CREATE INDEX IF NOT EXISTS idx_sections_paper ON sections(paper_id, position);
CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section_id, position);
CREATE INDEX IF NOT EXISTS idx_options_question ON question_options(question_id, position);
CREATE INDEX IF NOT EXISTS idx_pairs_question ON question_pairs(question_id, position);
