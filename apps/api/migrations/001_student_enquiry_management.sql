-- Student Enquiry Management: shared-schema PostgreSQL with tenant and branch isolation.
-- Apply with: npm run migrate --workspace @coaching/api
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','left')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, user_id)
);

-- Minimal pre-authentication directory: it contains no contact data and is used only
-- to discover workspace membership after a valid email is supplied at login.
CREATE TABLE IF NOT EXISTS login_membership_directory (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_status text NOT NULL,
  PRIMARY KEY (tenant_id, membership_id)
);
CREATE INDEX IF NOT EXISTS login_membership_directory_user_idx
  ON login_membership_directory(user_id, membership_status);

CREATE OR REPLACE FUNCTION sync_login_membership_directory() RETURNS trigger
LANGUAGE plpgsql AS $
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM login_membership_directory
    WHERE tenant_id = OLD.tenant_id AND membership_id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO login_membership_directory (tenant_id, membership_id, user_id, membership_status)
  VALUES (NEW.tenant_id, NEW.id, NEW.user_id, NEW.status)
  ON CONFLICT (tenant_id, membership_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, membership_status = EXCLUDED.membership_status;
  RETURN NEW;
END $;

DROP TRIGGER IF EXISTS memberships_login_directory_sync ON memberships;
CREATE TRIGGER memberships_login_directory_sync
AFTER INSERT OR UPDATE OF user_id, status OR DELETE ON memberships
FOR EACH ROW EXECUTE FUNCTION sync_login_membership_directory();

INSERT INTO login_membership_directory (tenant_id, membership_id, user_id, membership_status)
SELECT tenant_id, id, user_id, status FROM memberships
ON CONFLICT (tenant_id, membership_id) DO UPDATE
SET user_id = EXCLUDED.user_id, membership_status = EXCLUDED.membership_status;

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_code text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, branch_code)
);

CREATE TABLE IF NOT EXISTS permissions (
  key text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  key text NOT NULL,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE RESTRICT,
  PRIMARY KEY (tenant_id, role_id, permission_key),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS membership_roles (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, membership_id, role_id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS membership_branch_access (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, membership_id, branch_id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  duration_months integer CHECK (duration_months IS NULL OR duration_months > 0),
  default_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_fee >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  course_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  start_date date,
  end_date date,
  seat_limit integer CHECK (seat_limit IS NULL OR seat_limit > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, branch_id, code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, course_id) REFERENCES courses(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL,
  name text NOT NULL,
  total_fee numeric(12,2) NOT NULL CHECK (total_fee >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, course_id) REFERENCES courses(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS counsellor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  capacity integer NOT NULL DEFAULT 30 CHECK (capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, membership_id),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS enquiry_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  key text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS enquiry_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  key text NOT NULL,
  label text NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS enquiry_status_transitions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  from_status_key text NOT NULL,
  to_status_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, from_status_key, to_status_key),
  FOREIGN KEY (tenant_id, from_status_key) REFERENCES enquiry_statuses(tenant_id, key) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, to_status_key) REFERENCES enquiry_statuses(tenant_id, key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enquiry_id_sequences (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  period_key text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (tenant_id, branch_id, period_key),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  enquiry_number text NOT NULL,
  student_name text NOT NULL,
  parent_name text,
  mobile text NOT NULL,
  mobile_normalized text NOT NULL,
  alternate_mobile text,
  alternate_mobile_normalized text,
  email text,
  current_class text,
  school_name text,
  course_id uuid,
  source_id uuid,
  status_key text NOT NULL DEFAULT 'new',
  assigned_to_membership_id uuid,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  interested_mode text CHECK (interested_mode IS NULL OR interested_mode IN ('offline','online','hybrid')),
  preferred_contact_time text,
  expected_joining_date date,
  remarks text,
  lost_reason text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, enquiry_number),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, course_id) REFERENCES courses(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, source_id) REFERENCES enquiry_sources(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, status_key) REFERENCES enquiry_statuses(tenant_id, key) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_to_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS enquiries_tenant_created_idx ON enquiries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_tenant_status_idx ON enquiries(tenant_id, status_key, created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_tenant_branch_idx ON enquiries(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_tenant_counsellor_idx ON enquiries(tenant_id, assigned_to_membership_id, status_key);
CREATE INDEX IF NOT EXISTS enquiries_mobile_lookup_idx ON enquiries(tenant_id, mobile_normalized);
CREATE INDEX IF NOT EXISTS enquiries_parent_mobile_lookup_idx ON enquiries(tenant_id, alternate_mobile_normalized);
CREATE INDEX IF NOT EXISTS enquiries_active_followup_dashboard_idx ON enquiries(tenant_id, assigned_to_membership_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS enquiry_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  enquiry_id uuid NOT NULL,
  from_membership_id uuid,
  to_membership_id uuid NOT NULL,
  assigned_by_membership_id uuid NOT NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN ('manual','round_robin','reassignment','bulk')),
  note text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, enquiry_id) REFERENCES enquiries(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, from_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, to_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS enquiry_assignments_history_idx ON enquiry_assignments(tenant_id, enquiry_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  enquiry_id uuid NOT NULL,
  assigned_to_membership_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  channel text NOT NULL CHECK (channel IN ('call','whatsapp','email','visit','meeting','demo','other')),
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  outcome text,
  completed_at timestamptz,
  completed_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, enquiry_id) REFERENCES enquiries(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, assigned_to_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, completed_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS followups_no_duplicate_pending_idx
  ON follow_ups(tenant_id, enquiry_id, scheduled_at, channel)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS followups_due_idx ON follow_ups(tenant_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS followups_counsellor_due_idx ON follow_ups(tenant_id, assigned_to_membership_id, scheduled_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS enquiry_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  enquiry_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('created','updated','status_changed','assigned','call','whatsapp','email','visit','counselling','demo_scheduled','demo_completed','note','archived','restored','converted','followup_completed')),
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, enquiry_id) REFERENCES enquiries(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS enquiry_activity_timeline_idx ON enquiry_activities(tenant_id, enquiry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  student_number text NOT NULL,
  full_name text NOT NULL,
  mobile text,
  mobile_normalized text,
  email text,
  date_of_birth date,
  guardian_name text,
  guardian_mobile text,
  guardian_mobile_normalized text,
  gender text,
  created_from_enquiry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, student_number),
  FOREIGN KEY (tenant_id, created_from_enquiry_id) REFERENCES enquiries(tenant_id, id) ON DELETE SET NULL (created_from_enquiry_id)
);
CREATE INDEX IF NOT EXISTS students_mobile_lookup_idx ON students(tenant_id, mobile_normalized);

CREATE TABLE IF NOT EXISTS admission_id_sequences (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  period_key text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (tenant_id, branch_id, period_key),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  admission_number text NOT NULL,
  enquiry_id uuid NOT NULL,
  student_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  course_id uuid NOT NULL,
  batch_id uuid,
  fee_structure_id uuid,
  base_fee numeric(12,2) NOT NULL CHECK (base_fee >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_fee numeric(12,2) NOT NULL CHECK (final_fee >= 0),
  discount_reason text,
  admitted_by_membership_id uuid NOT NULL,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, admission_number),
  UNIQUE (tenant_id, enquiry_id),
  FOREIGN KEY (tenant_id, enquiry_id) REFERENCES enquiries(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, course_id) REFERENCES courses(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, batch_id) REFERENCES batches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, fee_structure_id) REFERENCES fee_structures(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, admitted_by_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS admissions_tenant_created_idx ON admissions(tenant_id, admitted_at DESC);
CREATE INDEX IF NOT EXISTS admissions_branch_course_idx ON admissions(tenant_id, branch_id, course_id, admitted_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_membership_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  ip_address inet,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE SET NULL (actor_membership_id)
);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_created_idx ON audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_membership_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, actor_membership_id, idempotency_key),
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE
);

-- Standard statuses for every newly provisioned tenant.
-- Permissions, roles, transitions and RLS policies are seeded by the tenant bootstrap routine.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'branches','memberships','roles','role_permissions','membership_roles',
    'membership_branch_access','courses','batches','fee_structures',
    'counsellor_profiles','enquiry_sources','enquiry_statuses',
    'enquiry_status_transitions','enquiry_id_sequences','enquiries',
    'enquiry_assignments','follow_ups','enquiry_activities','students',
    'admission_id_sequences','admissions','audit_logs','idempotency_keys'
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
 ('enquiries.read','View enquiries and enquiry dashboard'),
 ('enquiries.create','Create new enquiries'),
 ('enquiries.update','Edit enquiries and change status'),
 ('enquiries.archive','Archive and restore enquiries'),
 ('enquiries.assign','Assign and reassign counsellors'),
 ('enquiries.bulk','Perform bulk enquiry operations'),
 ('enquiries.read_all','View enquiries across counsellors in permitted branches'),
 ('followups.read','View follow-up worklists'),
 ('followups.manage','Create, complete and cancel follow-ups'),
 ('counsellors.manage','Manage counsellor profiles and workload settings'),
 ('sources.manage','Manage enquiry sources'),
 ('enquiries.settings','Manage enquiry statuses and transitions'),
 ('reports.read','View enquiry reports and analytics'),
 ('admissions.convert','Convert enquiries into admissions'),
 ('admissions.read','View admissions created from enquiries'),
 ('branches.manage','Manage institute branches'),
 ('courses.manage','Manage courses and batches'),
 ('users.manage','Manage institute users and roles')
ON CONFLICT (key) DO NOTHING;
