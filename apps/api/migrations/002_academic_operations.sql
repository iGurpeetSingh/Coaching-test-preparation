-- Academic operations, finance ledger and version-ready question bank.
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  session_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  topic text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','locked')),
  created_by_membership_id uuid NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, batch_id, starts_at),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, batch_id) REFERENCES batches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS attendance_sessions_batch_date_idx
  ON attendance_sessions(tenant_id, batch_id, session_date DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  remarks text,
  marked_by_membership_id uuid NOT NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id, student_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES attendance_sessions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, marked_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx
  ON attendance_records(tenant_id, student_id, marked_at DESC);

CREATE TABLE IF NOT EXISTS student_fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL,
  admission_id uuid,
  charge_code text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','waived','cancelled')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, student_id, charge_code),
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, admission_id) REFERENCES admissions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS student_fee_charges_student_idx
  ON student_fee_charges(tenant_id, student_id, due_date);

CREATE TABLE IF NOT EXISTS student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL,
  receipt_number text NOT NULL,
  payment_date timestamptz NOT NULL DEFAULT now(),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','upi','bank_transfer','cheque','card','other')),
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  received_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, receipt_number),
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, received_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS student_payments_student_date_idx
  ON student_payments(tenant_id, student_id, payment_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS student_payments_reference_idx
  ON student_payments(tenant_id, reference) WHERE reference IS NOT NULL AND reference <> '';

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, payment_id, charge_id),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES student_payments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, charge_id) REFERENCES student_fee_charges(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS payment_allocations_charge_idx
  ON payment_allocations(tenant_id, charge_id);

CREATE TABLE IF NOT EXISTS payment_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('refund','reversal')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES student_payments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS fee_receipt_sequences (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (tenant_id, period_key)
);

CREATE TABLE IF NOT EXISTS academic_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS syllabus_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, subject_id, code),
  FOREIGN KEY (tenant_id, subject_id) REFERENCES academic_subjects(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS syllabus_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  chapter_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, chapter_id, code),
  FOREIGN KEY (tenant_id, chapter_id) REFERENCES syllabus_chapters(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  topic_id uuid,
  question_code text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('single_choice','multiple_choice','true_false','short_answer','long_answer')),
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_key jsonb,
  explanation text,
  marks numeric(8,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, question_code, version),
  FOREIGN KEY (tenant_id, topic_id) REFERENCES syllabus_topics(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS question_bank_topic_status_idx
  ON question_bank(tenant_id, topic_id, status, difficulty);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'attendance_sessions','attendance_records','student_fee_charges','student_payments',
    'payment_allocations','payment_adjustments','fee_receipt_sequences',
    'academic_subjects','syllabus_chapters','syllabus_topics','question_bank'
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
  ('attendance.read','View attendance registers and class sessions'),
  ('attendance.manage','Create class sessions and mark attendance'),
  ('fees.read','View student fee ledgers and receipts'),
  ('fees.manage','Create charges, collect payments and issue adjustments'),
  ('question_bank.read','View syllabus and question bank'),
  ('question_bank.manage','Create and manage syllabus and questions')
ON CONFLICT (key) DO NOTHING;
