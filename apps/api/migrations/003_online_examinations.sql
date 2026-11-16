-- Versioned papers, student portal links and server-authoritative exam attempts.
CREATE TABLE IF NOT EXISTS student_portal_links (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  linked_by_membership_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, student_id),
  UNIQUE (tenant_id, membership_id),
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, linked_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS exam_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  paper_code text NOT NULL,
  title text NOT NULL,
  subject_name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  instructions text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  total_marks numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_marks >= 0),
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, paper_code),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, batch_id) REFERENCES batches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS exam_papers_batch_schedule_idx
  ON exam_papers(tenant_id, batch_id, starts_at DESC, status);

CREATE TABLE IF NOT EXISTS exam_paper_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  paper_id uuid NOT NULL,
  source_question_id uuid NOT NULL,
  source_question_version integer NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  question_snapshot jsonb NOT NULL,
  answer_snapshot jsonb,
  marks numeric(10,2) NOT NULL CHECK (marks > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, paper_id, position),
  UNIQUE (tenant_id, paper_id, source_question_id),
  FOREIGN KEY (tenant_id, paper_id) REFERENCES exam_papers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_question_id) REFERENCES question_bank(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS exam_paper_questions_paper_position_idx
  ON exam_paper_questions(tenant_id, paper_id, position);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  paper_id uuid NOT NULL,
  student_id uuid NOT NULL,
  paper_version integer NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','auto_submitted','awaiting_review','graded')),
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  submitted_at timestamptz,
  submit_reason text,
  total_marks numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_marks >= 0),
  score numeric(10,2),
  correct_count integer,
  incorrect_count integer,
  unanswered_count integer,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, paper_id, student_id),
  FOREIGN KEY (tenant_id, paper_id) REFERENCES exam_papers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS exam_attempts_student_idx
  ON exam_attempts(tenant_id, student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_paper_idx
  ON exam_attempts(tenant_id, paper_id, status);

CREATE TABLE IF NOT EXISTS exam_attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL,
  paper_question_id uuid NOT NULL,
  answer_value jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, attempt_id, paper_question_id),
  FOREIGN KEY (tenant_id, attempt_id) REFERENCES exam_attempts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, paper_question_id) REFERENCES exam_paper_questions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS exam_attempt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('started','answer_saved','submitted','auto_submitted','graded','reconnected')),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, attempt_id) REFERENCES exam_attempts(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS exam_attempt_events_idx
  ON exam_attempt_events(tenant_id, attempt_id, created_at);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'student_portal_links','exam_papers','exam_paper_questions','exam_attempts',
    'exam_attempt_answers','exam_attempt_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

INSERT INTO permissions(key, description) VALUES
  ('papers.read','View exam papers and schedules'),
  ('papers.manage','Create, edit and publish exam papers'),
  ('exam.monitor','Monitor student exam attempts'),
  ('results.read','View examination results'),
  ('results.manage','Evaluate and publish examination results'),
  ('student.exams.read','View assigned student examinations'),
  ('student.exams.attempt','Start, save and submit assigned examinations')
ON CONFLICT (key) DO NOTHING;
