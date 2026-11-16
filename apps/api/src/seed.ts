import argon2 from "argon2";
import { sql } from "kysely";
import { db, pool, withTenant } from "./db.js";

const statuses = [
  ["new", "New", false],
  ["assigned", "Assigned", false],
  ["contacted", "Contacted", false],
  ["interested", "Interested", false],
  ["follow_up", "Follow-up", false],
  ["counselling", "Counselling", false],
  ["demo_scheduled", "Demo Scheduled", false],
  ["demo_completed", "Demo Completed", false],
  ["admission_pending", "Admission Pending", false],
  ["converted", "Converted", true],
  ["not_interested", "Not Interested", true],
  ["lost", "Lost", true],
  ["on_hold", "On Hold", false]
] as const;

const transitions: Record<string, string[]> = {
  new: ["assigned", "contacted", "interested", "follow_up", "on_hold", "not_interested", "lost"],
  assigned: ["contacted", "interested", "follow_up", "counselling", "demo_scheduled", "on_hold", "not_interested", "lost"],
  contacted: ["interested", "follow_up", "counselling", "demo_scheduled", "on_hold", "not_interested", "lost"],
  interested: ["follow_up", "counselling", "demo_scheduled", "admission_pending", "on_hold", "not_interested", "lost"],
  follow_up: ["contacted", "interested", "counselling", "demo_scheduled", "admission_pending", "on_hold", "not_interested", "lost"],
  counselling: ["follow_up", "demo_scheduled", "demo_completed", "admission_pending", "on_hold", "not_interested", "lost"],
  demo_scheduled: ["demo_completed", "follow_up", "admission_pending", "on_hold", "not_interested", "lost"],
  demo_completed: ["follow_up", "interested", "admission_pending", "on_hold", "not_interested", "lost"],
  admission_pending: ["follow_up", "converted", "on_hold", "not_interested", "lost"],
  on_hold: ["contacted", "interested", "follow_up", "counselling", "demo_scheduled", "admission_pending", "not_interested", "lost"],
  not_interested: ["follow_up"],
  lost: [],
  converted: []
};

const permissions = [
  "enquiries.read", "enquiries.create", "enquiries.update", "enquiries.archive",
  "enquiries.assign", "enquiries.bulk", "enquiries.read_all",
  "followups.read", "followups.manage", "counsellors.manage", "sources.manage",
  "enquiries.settings", "reports.read", "admissions.convert", "admissions.read",
  "branches.manage", "courses.manage", "users.manage"
];

async function main() {
  const tenantName = process.env.BOOTSTRAP_TENANT_NAME?.trim();
  const tenantSlug = process.env.BOOTSTRAP_TENANT_SLUG?.trim().toLowerCase();
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!tenantName || !tenantSlug || !adminName || !email || !password || password.length < 12) {
    throw new Error("Set BOOTSTRAP_TENANT_NAME, BOOTSTRAP_TENANT_SLUG, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (minimum 12 characters).");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const tenantResult = await sql<{ id: string }>\`
    INSERT INTO tenants (name, slug)
    VALUES (\${tenantName}, \${tenantSlug})
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  \`.execute(db);
  const tenantId = tenantResult.rows[0]?.id;
  if (!tenantId) throw new Error("Could not create or locate bootstrap tenant.");

  await withTenant(tenantId, async (trx) => {
    const branchResult = await sql<{ id: string }>\`
      INSERT INTO branches (tenant_id, branch_code, name)
      VALUES (\${tenantId}, 'MAIN', 'Main Branch')
      ON CONFLICT (tenant_id, branch_code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    \`.execute(trx);
    const branchId = branchResult.rows[0].id;

    const userResult = await sql<{ id: string }>\`
      INSERT INTO users (email, email_normalized, full_name, password_hash)
      VALUES (\${email}, \${email}, \${adminName}, \${passwordHash})
      ON CONFLICT (email_normalized) DO UPDATE
      SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash, is_active = true, updated_at = now()
      RETURNING id
    \`.execute(trx);
    const userId = userResult.rows[0].id;

    const membershipResult = await sql<{ id: string }>\`
      INSERT INTO memberships (tenant_id, user_id, status)
      VALUES (\${tenantId}, \${userId}, 'active')
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active'
      RETURNING id
    \`.execute(trx);
    const membershipId = membershipResult.rows[0].id;

    const roleIds: Record<string, string> = {};
    for (const [key, name] of [
      ["owner", "Institute Owner"],
      ["branch_admin", "Branch Admin"],
      ["counsellor", "Admission Counsellor"],
      ["front_desk", "Front Desk"]
    ] as const) {
      const role = await sql<{ id: string }>\`
        INSERT INTO roles (tenant_id, key, name)
        VALUES (\${tenantId}, \${key}, \${name})
        ON CONFLICT (tenant_id, key) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      \`.execute(trx);
      roleIds[key] = role.rows[0].id;
    }

    await sql\`
      INSERT INTO membership_roles (tenant_id, membership_id, role_id)
      VALUES (\${tenantId}, \${membershipId}, \${roleIds.owner})
      ON CONFLICT DO NOTHING
    \`.execute(trx);

    await sql`
      INSERT INTO tenant_enquiry_settings (tenant_id)
      VALUES (${tenantId})
      ON CONFLICT (tenant_id) DO NOTHING
    `.execute(trx);

    const sourceRows = [
      ["walk_in", "Walk-in"], ["phone", "Phone Call"], ["website", "Website"],
      ["whatsapp", "WhatsApp"], ["referral", "Referral"], ["social_media", "Social Media"],
      ["advertisement", "Advertisement"], ["other", "Other"]
    ] as const;
    for (const [key, name] of sourceRows) {
      await sql\`
        INSERT INTO enquiry_sources (tenant_id, key, name)
        VALUES (\${tenantId}, \${key}, \${name})
        ON CONFLICT (tenant_id, key) DO UPDATE SET name = EXCLUDED.name
      \`.execute(trx);
    }

    for (const [index, [key, label, terminal]] of statuses.entries()) {
      await sql\`
        INSERT INTO enquiry_statuses (tenant_id, key, label, is_terminal, sort_order)
        VALUES (\${tenantId}, \${key}, \${label}, \${terminal}, \${index})
        ON CONFLICT (tenant_id, key) DO UPDATE
        SET label = EXCLUDED.label, is_terminal = EXCLUDED.is_terminal, sort_order = EXCLUDED.sort_order
      \`.execute(trx);
    }

    for (const [fromKey, toKeys] of Object.entries(transitions)) {
      for (const toKey of toKeys) {
        await sql\`
          INSERT INTO enquiry_status_transitions (tenant_id, from_status_key, to_status_key)
          VALUES (\${tenantId}, \${fromKey}, \${toKey})
          ON CONFLICT DO NOTHING
        \`.execute(trx);
      }
    }

    const rolePermissionMap: Record<string, string[]> = {
      owner: permissions,
      branch_admin: permissions.filter((key) => key !== "users.manage"),
      counsellor: ["enquiries.read", "enquiries.create", "enquiries.update", "followups.read", "followups.manage"],
      front_desk: ["enquiries.read", "enquiries.create", "followups.read", "followups.manage"]
    };
    for (const [roleKey, keys] of Object.entries(rolePermissionMap)) {
      for (const permissionKey of keys) {
        await sql\`
          INSERT INTO role_permissions (tenant_id, role_id, permission_key)
          VALUES (\${tenantId}, \${roleIds[roleKey]}, \${permissionKey})
          ON CONFLICT DO NOTHING
        \`.execute(trx);
      }
    }

    await sql\`
      INSERT INTO membership_branch_access (tenant_id, membership_id, branch_id)
      VALUES (\${tenantId}, \${membershipId}, \${branchId})
      ON CONFLICT DO NOTHING
    \`.execute(trx);
  });

  console.log("Bootstrap completed for tenant:", tenantSlug, "admin:", email);
  console.log("Change/remove BOOTSTRAP_ADMIN_PASSWORD after first provisioning.");
}

main()
  .catch((error) => {
    console.error("Database bootstrap failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
    await pool.end();
  });
