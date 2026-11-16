import type { Request } from "express";
import { sql, type Transaction } from "kysely";
import type { AuthContext } from "./auth.js";
import { assertBranchAccess } from "./auth.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type EnquiryRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  enquiry_number: string;
  student_name: string;
  parent_name: string | null;
  mobile: string;
  mobile_normalized: string;
  alternate_mobile: string | null;
  alternate_mobile_normalized: string | null;
  email: string | null;
  current_class: string | null;
  school_name: string | null;
  course_id: string | null;
  source_id: string | null;
  status_key: string;
  assigned_to_membership_id: string | null;
  priority: string;
  interested_mode: string | null;
  preferred_contact_time: string | null;
  expected_joining_date: string | null;
  remarks: string | null;
  lost_reason: string | null;
  custom_fields: Record<string, unknown>;
  created_by_membership_id: string;
  updated_by_membership_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  row_version: number;
};

export function actorOf(request: Request): AuthContext {
  if (!request.auth) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return request.auth;
}

export function assertBranch(request: Request, branchId: string): void {
  if (!assertBranchAccess(request, branchId)) {
    throw new ApiError(403, "BRANCH_FORBIDDEN", "You do not have access to this branch.");
  }
}

export async function getEnquiry(
  trx: Transaction<any>,
  tenantId: string,
  enquiryId: string,
  includeArchived = false
): Promise<EnquiryRow> {
  const result = await sql<EnquiryRow>\`
    SELECT *
    FROM enquiries
    WHERE tenant_id = \${tenantId} AND id = \${enquiryId}
      AND (\${includeArchived} = true OR archived_at IS NULL)
    LIMIT 1
  \`.execute(trx);
  const enquiry = result.rows[0];
  if (!enquiry) throw new ApiError(404, "ENQUIRY_NOT_FOUND", "Enquiry was not found.");
  return enquiry;
}

export function assertEnquiryScope(request: Request, enquiry: EnquiryRow): void {
  assertBranch(request, enquiry.branch_id);
  const canReadAll = request.permissionSet?.has("enquiries.read_all") || request.permissionSet?.has("enquiries.assign");
  if (!canReadAll && enquiry.assigned_to_membership_id && enquiry.assigned_to_membership_id !== request.auth?.membershipId) {
    throw new ApiError(404, "ENQUIRY_NOT_FOUND", "Enquiry was not found.");
  }
}

export async function addActivity(
  trx: Transaction<any>,
  tenantId: string,
  enquiryId: string,
  actorMembershipId: string,
  activityType: string,
  title: string,
  description?: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await sql\`
    INSERT INTO enquiry_activities
      (tenant_id, enquiry_id, actor_membership_id, activity_type, title, description, metadata)
    VALUES (
      \${tenantId}, \${enquiryId}, \${actorMembershipId}, \${activityType},
      \${title}, \${description || null}, \${JSON.stringify(metadata)}::jsonb
    )
  \`.execute(trx);
}

export async function addAudit(
  trx: Transaction<any>,
  tenantId: string,
  actorMembershipId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  ipAddress: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await sql\`
    INSERT INTO audit_logs
      (tenant_id, actor_membership_id, action, entity_type, entity_id, ip_address, safe_metadata)
    VALUES (
      \${tenantId}, \${actorMembershipId}, \${action}, \${entityType}, \${entityId},
      \${ipAddress}, \${JSON.stringify(metadata)}::jsonb
    )
  \`.execute(trx);
}

export async function assignEnquiry(
  trx: Transaction<any>,
  request: Request,
  enquiry: EnquiryRow,
  membershipId: string,
  assignmentType: "manual" | "round_robin" | "reassignment" | "bulk",
  note?: string
): Promise<void> {
  const auth = actorOf(request);
  const counsellorResult = await sql<any>\`
    SELECT cp.membership_id
    FROM counsellor_profiles cp
    JOIN memberships m ON m.tenant_id = cp.tenant_id AND m.id = cp.membership_id
    WHERE cp.tenant_id = \${auth.tenantId}
      AND cp.membership_id = \${membershipId}
      AND cp.is_active = true AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM membership_branch_access mba
          WHERE mba.tenant_id = cp.tenant_id
            AND mba.membership_id = cp.membership_id
            AND mba.branch_id = \${enquiry.branch_id}
        )
        OR EXISTS (
          SELECT 1 FROM membership_roles mr
          JOIN role_permissions rp ON rp.tenant_id = mr.tenant_id AND rp.role_id = mr.role_id
          WHERE mr.tenant_id = cp.tenant_id
            AND mr.membership_id = cp.membership_id
            AND rp.permission_key IN ('enquiries.read_all','branches.manage')
        )
      )
    LIMIT 1
  \`.execute(trx);
  if (counsellorResult.rows.length === 0) {
    throw new ApiError(400, "COUNSELLOR_UNAVAILABLE", "Select an active counsellor who has access to this branch.");
  }

  const previous = enquiry.assigned_to_membership_id;
  await sql\`
    UPDATE enquiries
    SET assigned_to_membership_id = \${membershipId},
        status_key = CASE WHEN status_key = 'new' THEN 'assigned' ELSE status_key END,
        updated_by_membership_id = \${auth.membershipId},
        updated_at = now(),
        row_version = row_version + 1
    WHERE tenant_id = \${auth.tenantId} AND id = \${enquiry.id}
  \`.execute(trx);

  await sql\`
    INSERT INTO enquiry_assignments
      (tenant_id, enquiry_id, from_membership_id, to_membership_id, assigned_by_membership_id, assignment_type, note)
    VALUES (
      \${auth.tenantId}, \${enquiry.id}, \${previous}, \${membershipId},
      \${auth.membershipId}, \${assignmentType}, \${note || null}
    )
  \`.execute(trx);

  await addActivity(
    trx, auth.tenantId, enquiry.id, auth.membershipId, "assigned",
    previous ? "Counsellor reassigned" : "Counsellor assigned",
    note || null,
    { fromMembershipId: previous, toMembershipId: membershipId, assignmentType }
  );
  await addAudit(trx, auth.tenantId, auth.membershipId, "enquiry.assigned", "enquiry", enquiry.id, request.ip || null, {
    fromMembershipId: previous,
    toMembershipId: membershipId,
    assignmentType
  });
}

export async function chooseRoundRobinCounsellor(
  trx: Transaction<any>,
  request: Request,
  enquiry: EnquiryRow
): Promise<string> {
  const auth = actorOf(request);
  const settings = await sql<{ round_robin_mode: string }>\`
    SELECT round_robin_mode FROM tenant_enquiry_settings
    WHERE tenant_id = \${auth.tenantId}
  \`.execute(trx);
  const mode = settings.rows[0]?.round_robin_mode || "least_loaded";
  const candidates = await sql<{ membership_id: string }>\`
    SELECT cp.membership_id
    FROM counsellor_profiles cp
    JOIN memberships m ON m.tenant_id = cp.tenant_id AND m.id = cp.membership_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS open_count
      FROM enquiries e
      WHERE e.tenant_id = cp.tenant_id
        AND e.assigned_to_membership_id = cp.membership_id
        AND e.archived_at IS NULL
        AND e.status_key NOT IN ('converted','lost','not_interested')
    ) workload ON true
    LEFT JOIN LATERAL (
      SELECT max(ea.assigned_at) AS last_assigned_at
      FROM enquiry_assignments ea
      WHERE ea.tenant_id = cp.tenant_id AND ea.to_membership_id = cp.membership_id
    ) last_assignment ON true
    WHERE cp.tenant_id = \${auth.tenantId}
      AND cp.is_active = true AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM membership_branch_access mba
          WHERE mba.tenant_id = cp.tenant_id
            AND mba.membership_id = cp.membership_id
            AND mba.branch_id = \${enquiry.branch_id}
        )
        OR EXISTS (
          SELECT 1 FROM membership_roles mr
          JOIN role_permissions rp ON rp.tenant_id = mr.tenant_id AND rp.role_id = mr.role_id
          WHERE mr.tenant_id = cp.tenant_id
            AND mr.membership_id = cp.membership_id
            AND rp.permission_key IN ('enquiries.read_all','branches.manage')
        )
      )
    ORDER BY
      CASE WHEN \${mode} = 'round_robin' THEN 0 ELSE (COALESCE(workload.open_count, 0)::numeric / cp.capacity) END ASC,
      last_assignment.last_assigned_at ASC NULLS FIRST,
      cp.created_at ASC
    FOR UPDATE OF cp
  \`.execute(trx);
  const selected = candidates.rows[0]?.membership_id;
  if (!selected) throw new ApiError(409, "NO_ACTIVE_COUNSELLOR", "No active counsellor is available for this branch.");
  return selected;
}

export function isDuplicatePendingFollowupError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" &&
    "code" in error && (error as { code?: string }).code === "23505" &&
    "constraint" in error &&
    (error as { constraint?: string }).constraint === "followups_no_duplicate_pending_idx"
  );
}
