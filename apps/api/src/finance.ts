import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, assertBranch } from "./enquiry-service.js";

export const financeRouter = Router();
financeRouter.use(requireAuth);
financeRouter.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request, response, next);
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown, label: string, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
    return null;
  }
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "VALIDATION_ERROR", label + " is invalid.");
  return value;
}
function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
    return null;
  }
  if (typeof value !== "string") throw new ApiError(400, "VALIDATION_ERROR", label + " must be text.");
  const result = value.trim();
  if (required && !result) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
  if (result.length > max) throw new ApiError(400, "VALIDATION_ERROR", label + " is too long.");
  return result || null;
}
function money(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 9999999999.99) {
    throw new ApiError(400, "INVALID_AMOUNT", label + " must be greater than zero and within the supported range.");
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}
function dateOrNull(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "INVALID_DATE", label + " must use YYYY-MM-DD.");
  const parsed = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ApiError(400, "INVALID_DATE", label + " is not a valid calendar date.");
  return value;
}

financeRouter.get("/fees/charges", requirePermission("fees.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const studentId = uuid(request.query.studentId, "Student");
    const branchIds = request.accessibleBranchIds || [];
    const result = await withTenant(auth.tenantId, async (trx) => {
      if (studentId) {
        const studentAdmission = await sql<any>`
          SELECT branch_id FROM admissions
          WHERE tenant_id=${auth.tenantId} AND student_id=${studentId}
          ORDER BY admitted_at DESC LIMIT 1
        `.execute(trx);
        if (!studentAdmission.rows[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "No admission record was found for this student.");
        assertBranch(request, studentAdmission.rows[0].branch_id);
      }
      const rows = await sql<any>`
        SELECT ch.id, ch.student_id, st.student_number, st.full_name AS student_name,
               ch.admission_id, ch.charge_code, ch.description, ch.amount, ch.due_date,
               ch.status, ch.created_at, a.admission_number, a.branch_id,
               coalesce(paid.total_paid, 0)::numeric(12,2) AS paid_amount,
               (ch.amount - coalesce(paid.total_paid, 0))::numeric(12,2) AS balance_amount
        FROM student_fee_charges ch
        JOIN students st ON st.tenant_id=ch.tenant_id AND st.id=ch.student_id
        JOIN admissions a ON a.tenant_id=ch.tenant_id AND a.id=ch.admission_id
        LEFT JOIN LATERAL (
          SELECT sum(pa.amount)::numeric(12,2) AS total_paid
          FROM payment_allocations pa
          JOIN student_payments p ON p.tenant_id=pa.tenant_id AND p.id=pa.payment_id AND p.status='posted'
          WHERE pa.tenant_id=ch.tenant_id AND pa.charge_id=ch.id
        ) paid ON true
        WHERE ch.tenant_id=${auth.tenantId}
          AND (${studentId}::uuid IS NULL OR ch.student_id=${studentId})
          AND (${request.canAccessAllBranches === true} OR a.branch_id=ANY(${branchIds}::uuid[]))
        ORDER BY ch.due_date NULLS LAST, ch.created_at DESC
        LIMIT 500
      `.execute(trx);
      return rows.rows;
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result });
  } catch (error) { next(error); }
});

financeRouter.post("/fees/charges", requirePermission("fees.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const studentId = uuid(request.body?.studentId, "Student", true)!;
    const admissionId = uuid(request.body?.admissionId, "Admission", true)!;
    const chargeCode = text(request.body?.chargeCode, "Charge code", 50, true)!.toUpperCase();
    const description = text(request.body?.description, "Description", 180, true)!;
    const amount = money(request.body?.amount, "Charge amount");
    const dueDate = dateOrNull(request.body?.dueDate, "Due date");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const admission = await sql<any>`
        SELECT id, branch_id, student_id FROM admissions
        WHERE tenant_id=${auth.tenantId} AND id=${admissionId} AND student_id=${studentId}
      `.execute(trx);
      if (!admission.rows[0]) throw new ApiError(400, "ADMISSION_STUDENT_MISMATCH", "The selected admission does not belong to this student.");
      assertBranch(request, admission.rows[0].branch_id);
      const inserted = await sql<any>`
        INSERT INTO student_fee_charges
          (tenant_id, student_id, admission_id, charge_code, description, amount, due_date, created_by_membership_id)
        VALUES
          (${auth.tenantId}, ${studentId}, ${admissionId}, ${chargeCode}, ${description}, ${amount}, ${dueDate}, ${auth.membershipId})
        RETURNING *
      `.execute(trx);
      return inserted.rows[0];
    });
    response.status(201).json({ charge: result });
  } catch (error) { next(error); }
});

financeRouter.get("/fees/payments", requirePermission("fees.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const studentId = uuid(request.query.studentId, "Student");
    const branchIds = request.accessibleBranchIds || [];
    const result = await withTenant(auth.tenantId, async (trx) => {
      const rows = await sql<any>`
        SELECT p.id, p.student_id, st.student_number, st.full_name AS student_name,
               p.receipt_number, p.payment_date, p.amount, p.method, p.reference,
               p.notes, p.status, u.full_name AS received_by,
               coalesce(alloc.total_allocated,0)::numeric(12,2) AS allocated_amount
        FROM student_payments p
        JOIN students st ON st.tenant_id=p.tenant_id AND st.id=p.student_id
        JOIN memberships m ON m.tenant_id=p.tenant_id AND m.id=p.received_by_membership_id
        JOIN users u ON u.id=m.user_id
        LEFT JOIN LATERAL (
          SELECT sum(amount)::numeric(12,2) AS total_allocated
          FROM payment_allocations pa
          WHERE pa.tenant_id=p.tenant_id AND pa.payment_id=p.id
        ) alloc ON true
        WHERE p.tenant_id=${auth.tenantId}
          AND (${studentId}::uuid IS NULL OR p.student_id=${studentId})
          AND EXISTS (
            SELECT 1 FROM admissions a
            WHERE a.tenant_id=p.tenant_id AND a.student_id=p.student_id
              AND (${request.canAccessAllBranches === true} OR a.branch_id=ANY(${branchIds}::uuid[]))
          )
        ORDER BY p.payment_date DESC LIMIT 500
      `.execute(trx);
      return rows.rows;
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result });
  } catch (error) { next(error); }
});

financeRouter.post("/fees/payments", requirePermission("fees.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const studentId = uuid(request.body?.studentId, "Student", true)!;
    const amount = money(request.body?.amount, "Payment amount");
    const method = text(request.body?.method, "Payment method", 20, true)!;
    if (!["cash", "upi", "bank_transfer", "cheque", "card", "other"].includes(method)) {
      throw new ApiError(400, "INVALID_PAYMENT_METHOD", "Payment method is invalid.");
    }
    const reference = text(request.body?.reference, "Payment reference", 120);
    const notes = text(request.body?.notes, "Payment notes", 1000);
    const allocationInput = request.body?.allocations;
    if (!Array.isArray(allocationInput) || allocationInput.length < 1 || allocationInput.length > 50) {
      throw new ApiError(400, "INVALID_ALLOCATIONS", "Allocate the payment to between 1 and 50 fee charges.");
    }
    const allocations = allocationInput.map((item: any) => ({
      chargeId: uuid(item?.chargeId, "Charge ID", true)!,
      amount: money(item?.amount, "Allocation amount")
    }));
    if (new Set(allocations.map((item) => item.chargeId)).size !== allocations.length) {
      throw new ApiError(400, "DUPLICATE_ALLOCATION", "A fee charge can appear only once in a payment.");
    }
    const allocatedPaise = allocations.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    if (allocatedPaise !== Math.round(amount * 100)) {
      throw new ApiError(400, "ALLOCATION_MISMATCH", "The allocation total must exactly match the payment amount.");
    }

    const result = await withTenant(auth.tenantId, async (trx) => {
      const charges = await sql<any>`
        SELECT ch.id, ch.student_id, ch.amount, ch.status, a.branch_id,
               coalesce(paid.total_paid,0)::numeric(12,2) AS total_paid
        FROM student_fee_charges ch
        JOIN admissions a ON a.tenant_id=ch.tenant_id AND a.id=ch.admission_id
        LEFT JOIN LATERAL (
          SELECT sum(pa.amount)::numeric(12,2) AS total_paid
          FROM payment_allocations pa
          JOIN student_payments p ON p.tenant_id=pa.tenant_id AND p.id=pa.payment_id AND p.status='posted'
          WHERE pa.tenant_id=ch.tenant_id AND pa.charge_id=ch.id
        ) paid ON true
        WHERE ch.tenant_id=${auth.tenantId}
          AND ch.id=ANY(${allocations.map((item) => item.chargeId)}::uuid[])
        FOR UPDATE OF ch
      `.execute(trx);
      if (charges.rows.length !== allocations.length) throw new ApiError(400, "CHARGE_NOT_FOUND", "One or more fee charges were not found.");
      for (const allocation of allocations) {
        const charge = charges.rows.find((item: any) => item.id === allocation.chargeId);
        if (!charge || charge.student_id !== studentId) throw new ApiError(400, "CHARGE_STUDENT_MISMATCH", "Every fee charge must belong to the selected student.");
        if (charge.status !== "open") throw new ApiError(409, "CHARGE_NOT_OPEN", "Only open fee charges can receive payments.");
        assertBranch(request, charge.branch_id);
        const outstanding = Math.round((Number(charge.amount) - Number(charge.total_paid)) * 100);
        if (Math.round(allocation.amount * 100) > outstanding) {
          throw new ApiError(409, "OVER_ALLOCATION", "A payment allocation cannot exceed the outstanding charge balance.");
        }
      }

      const period = new Date().toISOString().slice(0, 7).replace("-", "");
      const sequence = await sql<{ last_value: number }>`
        INSERT INTO fee_receipt_sequences (tenant_id, period_key, last_value)
        VALUES (${auth.tenantId}, ${period}, 1)
        ON CONFLICT (tenant_id, period_key)
        DO UPDATE SET last_value=fee_receipt_sequences.last_value+1
        RETURNING last_value
      `.execute(trx);
      const receiptNumber = "RCT-" + period + "-" + String(sequence.rows[0].last_value).padStart(6, "0");
      const payment = await sql<any>`
        INSERT INTO student_payments
          (tenant_id, student_id, receipt_number, amount, method, reference, notes, received_by_membership_id)
        VALUES
          (${auth.tenantId}, ${studentId}, ${receiptNumber}, ${amount}, ${method}, ${reference}, ${notes}, ${auth.membershipId})
        RETURNING *
      `.execute(trx);
      for (const allocation of allocations) {
        await sql`
          INSERT INTO payment_allocations (tenant_id, payment_id, charge_id, amount)
          VALUES (${auth.tenantId}, ${payment.rows[0].id}, ${allocation.chargeId}, ${allocation.amount})
        `.execute(trx);
      }
      return { payment: payment.rows[0], allocations };
    });
    response.status(201).json(result);
  } catch (error) { next(error); }
});

financeRouter.get("/fees/receipts/:receiptNumber", requirePermission("fees.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const receiptNumber = text(request.params.receiptNumber, "Receipt number", 40, true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const payment = await sql<any>`
        SELECT p.*, st.student_number, st.full_name AS student_name, st.mobile
        FROM student_payments p
        JOIN students st ON st.tenant_id=p.tenant_id AND st.id=p.student_id
        WHERE p.tenant_id=${auth.tenantId} AND p.receipt_number=${receiptNumber}
      `.execute(trx);
      if (!payment.rows[0]) throw new ApiError(404, "RECEIPT_NOT_FOUND", "Receipt was not found.");
      const branch = await sql<any>`
        SELECT branch_id FROM admissions
        WHERE tenant_id=${auth.tenantId} AND student_id=${payment.rows[0].student_id}
        ORDER BY admitted_at DESC LIMIT 1
      `.execute(trx);
      if (!branch.rows[0]) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student admission was not found.");
      assertBranch(request, branch.rows[0].branch_id);
      const allocations = await sql<any>`
        SELECT pa.amount, ch.charge_code, ch.description
        FROM payment_allocations pa
        JOIN student_fee_charges ch ON ch.tenant_id=pa.tenant_id AND ch.id=pa.charge_id
        WHERE pa.tenant_id=${auth.tenantId} AND pa.payment_id=${payment.rows[0].id}
        ORDER BY ch.description
      `.execute(trx);
      return { payment: payment.rows[0], allocations: allocations.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});
