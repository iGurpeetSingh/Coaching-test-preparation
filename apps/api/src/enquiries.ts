import { Router } from "express";
import { requireAuth, requireCsrf, requirePermission, assertBranch } from "./auth.js";
import { withTenant } from "./db.js";
import { actorOf } from "./enquiry-service.js";
import { sql, type RawBuilder } from "kysely";
import { ApiError, getEnquiry, assertEnquiryScope, addActivity, addAudit, assignEnquiry, chooseRoundRobinCounsellor } from "./enquiry-service.js";
import { canTransition, normalizePhone, validatePhone, normalizePersonName, parsePositiveInteger, validateFee } from "./enquiry-domain.js";

export const enquiryRouter = Router();
enquiryRouter.use(requireAuth);
enquiryRouter.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request, response, next);
});

enquiryRouter.get("/enquiries/summary", requirePermission("enquiries.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const result = await withTenant(auth.tenantId, async (trx) => {
      return sql`SELECT count(*)::integer AS total FROM enquiries WHERE tenant_id = ${auth.tenantId} AND archived_at IS NULL`.execute(trx);
    });
    response.json({ total: Number(result.rows[0]?.total || 0) });
  } catch (error) {
    next(error);
  }
});




function inputText(value: unknown, label: string, max = 250, required = false): string | null {
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

function inputUuid(value: unknown, label: string, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
    return null;
  }
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " is invalid.");
  }
  return value;
}

function inputDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " must use YYYY-MM-DD.");
  }
  return value;
}

function scopeConditions(request: Request, alias = "e"): RawBuilder<unknown>[] {
  const auth = actorOf(request);
  const conditions: RawBuilder<unknown>[] = [sql`${sql.raw(alias)}.tenant_id = ${auth.tenantId}`];
  const branches = request.accessibleBranchIds || [];
  if (!request.canAccessAllBranches) {
    conditions.push(branches.length ? sql`${sql.raw(alias)}.branch_id = ANY(${branches}::uuid[])` : sql`false`);
    if (!request.permissionSet?.has("enquiries.read_all")) {
      conditions.push(sql`(${sql.raw(alias)}.assigned_to_membership_id = ${auth.membershipId} OR ${sql.raw(alias)}.assigned_to_membership_id IS NULL)`);
    }
  }
  return conditions;
}

async function assertReference(trx: any, tenantId: string, table: "branches" | "courses" | "enquiry_sources", id: string | null, label: string): Promise<void> {
  if (!id) return;
  const found = await sql<{id:string}>`SELECT id FROM ${sql.raw(table)} WHERE tenant_id=${tenantId} AND id=${id} AND is_active=true LIMIT 1`.execute(trx);
  if (!found.rows.length) throw new ApiError(400, "INVALID_REFERENCE", label + " is unavailable or belongs to another institute.");
}

async function nextSequence(trx:any, table:"enquiry_id_sequences"|"admission_id_sequences", tenantId:string, branchId:string, period:string):Promise<number>{
  const result = table==="enquiry_id_sequences"
    ? await sql<{last_value:number}>`INSERT INTO enquiry_id_sequences (tenant_id,branch_id,period_key,last_value) VALUES (${tenantId},${branchId},${period},1) ON CONFLICT (tenant_id,branch_id,period_key) DO UPDATE SET last_value=enquiry_id_sequences.last_value+1 RETURNING last_value`.execute(trx)
    : await sql<{last_value:number}>`INSERT INTO admission_id_sequences (tenant_id,branch_id,period_key,last_value) VALUES (${tenantId},${branchId},${period},1) ON CONFLICT (tenant_id,branch_id,period_key) DO UPDATE SET last_value=admission_id_sequences.last_value+1 RETURNING last_value`.execute(trx);
  return Number(result.rows[0].last_value);
}


enquiryRouter.get("/dashboard", requirePermission("enquiries.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const conditions = scopeConditions(request);
    conditions.push(sql`e.archived_at IS NULL`);
    const where = sql.join(conditions, sql` AND `);
    const result = await withTenant(auth.tenantId, async (trx) => {
      const metrics = await sql<any>`
        SELECT count(*)::integer AS total,
          count(*) FILTER (WHERE e.created_at >= date_trunc('day', now()))::integer AS new_today,
          count(*) FILTER (WHERE e.status_key='assigned')::integer AS assigned,
          count(*) FILTER (WHERE e.status_key='interested')::integer AS interested,
          count(*) FILTER (WHERE e.status_key='converted')::integer AS converted,
          count(*) FILTER (WHERE e.status_key='lost')::integer AS lost,
          count(*) FILTER (WHERE e.status_key NOT IN ('converted','lost','not_interested'))::integer AS active_pipeline
        FROM enquiries e WHERE ${where}
      `.execute(trx);
      const followups = await sql<any>`
        SELECT count(*) FILTER (WHERE f.scheduled_at < now())::integer AS overdue,
          count(*) FILTER (WHERE f.scheduled_at >= date_trunc('day',now()) AND f.scheduled_at < date_trunc('day',now()) + interval '1 day')::integer AS due_today,
          count(*) FILTER (WHERE f.scheduled_at >= date_trunc('day',now()) + interval '1 day')::integer AS upcoming
        FROM follow_ups f JOIN enquiries e ON e.tenant_id=f.tenant_id AND e.id=f.enquiry_id
        WHERE ${where} AND f.status='pending'
      `.execute(trx);
      const byStatus = await sql<any>`
        SELECT s.key, s.label, count(e.id)::integer AS count
        FROM enquiry_statuses s
        LEFT JOIN enquiries e ON e.tenant_id=s.tenant_id AND e.status_key=s.key
          AND e.archived_at IS NULL
          AND (${request.canAccessAllBranches === true} OR e.branch_id=ANY(${request.accessibleBranchIds || []}::uuid[]))
          AND (${request.permissionSet?.has("enquiries.read_all") === true} OR e.assigned_to_membership_id=${auth.membershipId} OR e.assigned_to_membership_id IS NULL)
        WHERE s.tenant_id=${auth.tenantId} AND s.is_active=true
        GROUP BY s.key,s.label,s.sort_order ORDER BY s.sort_order
      `.execute(trx);
      const trend = await sql<any>`
        SELECT to_char(date_trunc('day',e.created_at),'YYYY-MM-DD') AS day,count(*)::integer AS count
        FROM enquiries e WHERE ${where} AND e.created_at >= now()-interval '29 days'
        GROUP BY date_trunc('day',e.created_at) ORDER BY date_trunc('day',e.created_at)
      `.execute(trx);
      return { metrics: metrics.rows[0], followups: followups.rows[0], statusBreakdown: byStatus.rows, dailyTrend: trend.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

enquiryRouter.get("/enquiries", requirePermission("enquiries.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const page = parsePositiveInteger(request.query.page, 1, 1000000);
    const pageSize = parsePositiveInteger(request.query.pageSize, 20, 100);
    const search = inputText(request.query.q, "Search", 120) || "";
    const status = inputText(request.query.status, "Status", 40);
    const sourceId = inputUuid(request.query.sourceId, "Source");
    const courseId = inputUuid(request.query.courseId, "Course");
    const branchId = inputUuid(request.query.branchId, "Branch");
    const counsellorId = inputUuid(request.query.counsellorId, "Counsellor");
    const archived = request.query.archived === "true";
    if (archived && !request.permissionSet?.has("enquiries.archive")) throw new ApiError(403, "FORBIDDEN", "You cannot view archived enquiries.");
    if (branchId) assertBranch(request, branchId);
    const conditions = scopeConditions(request);
    conditions.push(archived ? sql`e.archived_at IS NOT NULL` : sql`e.archived_at IS NULL`);
    if (search) {
      const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
      conditions.push(sql`(e.student_name ILIKE ${pattern} OR e.parent_name ILIKE ${pattern} OR e.mobile ILIKE ${pattern} OR e.enquiry_number ILIKE ${pattern})`);
    }
    if (status) conditions.push(sql`e.status_key=${status}`);
    if (sourceId) conditions.push(sql`e.source_id=${sourceId}`);
    if (courseId) conditions.push(sql`e.course_id=${courseId}`);
    if (branchId) conditions.push(sql`e.branch_id=${branchId}`);
    if (counsellorId) conditions.push(sql`e.assigned_to_membership_id=${counsellorId}`);
    const order = request.query.sort === "name" ? sql`e.student_name ASC` : request.query.sort === "updated" ? sql`e.updated_at DESC` : sql`e.created_at DESC`;
    const where = sql.join(conditions, sql` AND `);
    const data = await withTenant(auth.tenantId, async (trx) => {
      const count = await sql<{total:number}>`SELECT count(*)::integer AS total FROM enquiries e WHERE ${where}`.execute(trx);
      const rows = await sql<any>`
        SELECT e.id,e.enquiry_number,e.student_name,e.parent_name,e.mobile,e.email,e.current_class,
          e.priority,e.status_key,e.created_at,e.updated_at,e.expected_joining_date,e.remarks,e.row_version,
          b.id AS branch_id,b.name AS branch_name,c.id AS course_id,c.name AS course_name,
          s.id AS source_id,s.name AS source_name,m.id AS counsellor_membership_id,u.full_name AS counsellor_name
        FROM enquiries e
        JOIN branches b ON b.tenant_id=e.tenant_id AND b.id=e.branch_id
        LEFT JOIN courses c ON c.tenant_id=e.tenant_id AND c.id=e.course_id
        LEFT JOIN enquiry_sources s ON s.tenant_id=e.tenant_id AND s.id=e.source_id
        LEFT JOIN memberships m ON m.tenant_id=e.tenant_id AND m.id=e.assigned_to_membership_id
        LEFT JOIN users u ON u.id=m.user_id
        WHERE ${where} ORDER BY ${order}
        LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}
      `.execute(trx);
      return { items: rows.rows, total: Number(count.rows[0]?.total || 0) };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ ...data, page, pageSize, pageCount: Math.ceil(data.total/pageSize) });
  } catch (error) { next(error); }
});


enquiryRouter.post("/enquiries", requirePermission("enquiries.create"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const name = inputText(request.body?.studentName, "Student name", 160, true)!;
    const parent = inputText(request.body?.parentName, "Parent/guardian name", 160);
    const mobile = inputText(request.body?.mobile, "Mobile", 32, true)!;
    const alternate = inputText(request.body?.alternateMobile, "Alternate mobile", 32);
    if (!validatePhone(mobile) || (alternate && !validatePhone(alternate))) throw new ApiError(400, "INVALID_PHONE", "Enter valid 10–15 digit mobile numbers.");
    const phone = normalizePhone(mobile);
    const alternatePhone = alternate ? normalizePhone(alternate) : null;
    const email = inputText(request.body?.email, "Email", 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "INVALID_EMAIL", "Enter a valid email address.");
    const branchId = inputUuid(request.body?.branchId, "Branch", true)!;
    assertBranch(request, branchId);
    const courseId = inputUuid(request.body?.courseId, "Course");
    const sourceId = inputUuid(request.body?.sourceId, "Source");
    const priority = inputText(request.body?.priority, "Priority", 16) || "normal";
    if (!["low","normal","high","urgent"].includes(priority)) throw new ApiError(400, "INVALID_PRIORITY", "Priority is invalid.");
    const mode = inputText(request.body?.interestedMode, "Mode", 16);
    if (mode && !["offline","online","hybrid"].includes(mode)) throw new ApiError(400, "INVALID_MODE", "Mode is invalid.");
    const customFields = request.body?.customFields && typeof request.body.customFields === "object" && !Array.isArray(request.body.customFields) ? request.body.customFields : {};
    if (Object.keys(customFields).length > 20) throw new ApiError(400, "CUSTOM_FIELDS_LIMIT", "At most 20 custom fields are allowed.");

    const result = await withTenant(auth.tenantId, async (trx) => {
      await assertReference(trx, auth.tenantId, "branches", branchId, "Branch");
      await assertReference(trx, auth.tenantId, "courses", courseId, "Course");
      await assertReference(trx, auth.tenantId, "enquiry_sources", sourceId, "Source");
      const duplicates = await sql<any>`
        SELECT id,enquiry_number,student_name,mobile,status_key,created_at
        FROM enquiries WHERE tenant_id=${auth.tenantId} AND archived_at IS NULL
          AND (mobile_normalized=${phone} OR (
            ${alternatePhone}::text IS NOT NULL AND mobile_normalized=${alternatePhone}
            AND lower(regexp_replace(student_name,'\\s+',' ','g'))=${normalizePersonName(name)}
          ))
        ORDER BY created_at DESC LIMIT 5
      `.execute(trx);
      const branch = await sql<{branch_code:string}>`SELECT branch_code FROM branches WHERE tenant_id=${auth.tenantId} AND id=${branchId}`.execute(trx);
      const period = new Date().toISOString().slice(0,7).replace("-","");
      const sequence = await nextSequence(trx,"enquiry_id_sequences",auth.tenantId,branchId,period);
      const number = `ENQ-${branch.rows[0].branch_code}-${period}-${String(sequence).padStart(5,"0")}`;
      const inserted = await sql<any>`
        INSERT INTO enquiries (
          tenant_id,branch_id,enquiry_number,student_name,parent_name,mobile,mobile_normalized,
          alternate_mobile,alternate_mobile_normalized,email,current_class,school_name,course_id,source_id,
          status_key,priority,interested_mode,preferred_contact_time,expected_joining_date,remarks,
          custom_fields,created_by_membership_id,updated_by_membership_id
        ) VALUES (
          ${auth.tenantId},${branchId},${number},${name},${parent},${mobile},${phone},
          ${alternate},${alternatePhone},${email},${inputText(request.body?.currentClass,"Current class",80)},
          ${inputText(request.body?.schoolName,"School",180)},${courseId},${sourceId},'new',${priority},${mode},
          ${inputText(request.body?.preferredContactTime,"Preferred contact time",100)},
          ${inputDate(request.body?.expectedJoiningDate,"Expected joining date")},
          ${inputText(request.body?.remarks,"Remarks",3000)},${JSON.stringify(customFields)}::jsonb,
          ${auth.membershipId},${auth.membershipId}
        ) RETURNING *
      `.execute(trx);
      let enquiry = inserted.rows[0];
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,"created","Enquiry created",enquiry.remarks,{enquiryNumber:number,duplicateMatches:duplicates.rows.length});
      await addAudit(trx,auth.tenantId,auth.membershipId,"enquiry.created","enquiry",enquiry.id,request.ip||null,{enquiryNumber:number,branchId,sourceId});
      const settings = await sql<{auto_assign_on_create:boolean}>`SELECT auto_assign_on_create FROM tenant_enquiry_settings WHERE tenant_id=${auth.tenantId}`.execute(trx);
      if (settings.rows[0]?.auto_assign_on_create) {
        try {
          const counsellorId = await chooseRoundRobinCounsellor(trx,request,enquiry);
          await assignEnquiry(trx,request,enquiry,counsellorId,"round_robin");
          enquiry = await getEnquiry(trx,auth.tenantId,enquiry.id);
        } catch(error) {
          if (!(error instanceof ApiError && error.code === "NO_ACTIVE_COUNSELLOR")) throw error;
        }
      }
      return { enquiry, duplicates: duplicates.rows };
    });
    response.status(201).json({
      enquiry: result.enquiry,
      duplicateWarnings: result.duplicates.map((row:any)=>({
        id:row.id,enquiryNumber:row.enquiry_number,studentName:row.student_name,
        mobile:row.mobile,status:row.status_key,createdAt:row.created_at
      }))
    });
  } catch(error) { next(error); }
});


enquiryRouter.get("/enquiries/:id", requirePermission("enquiries.read"), async (request,response,next)=>{
  try {
    const auth=actorOf(request);
    const data=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id,request.query.archived==="true");
      assertEnquiryScope(request,enquiry);
      const details=await sql<any>`
        SELECT e.*,b.name AS branch_name,c.name AS course_name,s.name AS source_name,u.full_name AS counsellor_name
        FROM enquiries e JOIN branches b ON b.tenant_id=e.tenant_id AND b.id=e.branch_id
        LEFT JOIN courses c ON c.tenant_id=e.tenant_id AND c.id=e.course_id
        LEFT JOIN enquiry_sources s ON s.tenant_id=e.tenant_id AND s.id=e.source_id
        LEFT JOIN memberships m ON m.tenant_id=e.tenant_id AND m.id=e.assigned_to_membership_id
        LEFT JOIN users u ON u.id=m.user_id
        WHERE e.tenant_id=${auth.tenantId} AND e.id=${enquiry.id}
      `.execute(trx);
      const activities=await sql<any>`
        SELECT a.*,u.full_name AS actor_name FROM enquiry_activities a
        JOIN memberships m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id
        JOIN users u ON u.id=m.user_id
        WHERE a.tenant_id=${auth.tenantId} AND a.enquiry_id=${enquiry.id}
        ORDER BY a.created_at DESC LIMIT 100
      `.execute(trx);
      const assignmentHistory=await sql<any>`
        SELECT a.*,from_u.full_name AS from_name,to_u.full_name AS to_name,actor_u.full_name AS assigned_by_name
        FROM enquiry_assignments a
        LEFT JOIN memberships from_m ON from_m.tenant_id=a.tenant_id AND from_m.id=a.from_membership_id
        LEFT JOIN users from_u ON from_u.id=from_m.user_id
        JOIN memberships to_m ON to_m.tenant_id=a.tenant_id AND to_m.id=a.to_membership_id
        JOIN users to_u ON to_u.id=to_m.user_id
        JOIN memberships actor_m ON actor_m.tenant_id=a.tenant_id AND actor_m.id=a.assigned_by_membership_id
        JOIN users actor_u ON actor_u.id=actor_m.user_id
        WHERE a.tenant_id=${auth.tenantId} AND a.enquiry_id=${enquiry.id} ORDER BY a.assigned_at DESC
      `.execute(trx);
      const followUps=await sql<any>`
        SELECT f.*,u.full_name AS counsellor_name FROM follow_ups f
        JOIN memberships m ON m.tenant_id=f.tenant_id AND m.id=f.assigned_to_membership_id
        JOIN users u ON u.id=m.user_id
        WHERE f.tenant_id=${auth.tenantId} AND f.enquiry_id=${enquiry.id} ORDER BY f.scheduled_at DESC
      `.execute(trx);
      return {enquiry:details.rows[0],activities:activities.rows,assignmentHistory:assignmentHistory.rows,followUps:followUps.rows};
    });
    response.setHeader("Cache-Control","no-store");
    response.json(data);
  } catch(error){next(error);}
});

enquiryRouter.patch("/enquiries/:id",requirePermission("enquiries.update"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const expectedVersion=Number(request.body?.expectedVersion);
    if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw new ApiError(400,"VERSION_REQUIRED","Send expectedVersion to prevent overwriting another user's update.");
    const body=request.body||{};
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertEnquiryScope(request,enquiry);
      if(enquiry.row_version!==expectedVersion)throw new ApiError(409,"CONCURRENT_UPDATE","This enquiry changed. Refresh and retry.");
      const fields:RawBuilder<unknown>[]=[];
      if(body.studentName!==undefined)fields.push(sql`student_name=${inputText(body.studentName,"Student name",160,true)}`);
      if(body.parentName!==undefined)fields.push(sql`parent_name=${inputText(body.parentName,"Parent name",160)}`);
      if(body.mobile!==undefined){
        const value=inputText(body.mobile,"Mobile",32,true)!;
        if(!validatePhone(value))throw new ApiError(400,"INVALID_PHONE","Enter a valid mobile number.");
        fields.push(sql`mobile=${value}`,sql`mobile_normalized=${normalizePhone(value)}`);
      }
      if(body.alternateMobile!==undefined){
        const value=inputText(body.alternateMobile,"Alternate mobile",32);
        if(value&&!validatePhone(value))throw new ApiError(400,"INVALID_PHONE","Alternate mobile is invalid.");
        fields.push(sql`alternate_mobile=${value}`,sql`alternate_mobile_normalized=${value?normalizePhone(value):null}`);
      }
      if(body.email!==undefined){
        const value=inputText(body.email,"Email",254);
        if(value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new ApiError(400,"INVALID_EMAIL","Enter a valid email.");
        fields.push(sql`email=${value}`);
      }
      if(body.currentClass!==undefined)fields.push(sql`current_class=${inputText(body.currentClass,"Current class",80)}`);
      if(body.schoolName!==undefined)fields.push(sql`school_name=${inputText(body.schoolName,"School",180)}`);
      if(body.courseId!==undefined){
        const value=inputUuid(body.courseId,"Course");await assertReference(trx,auth.tenantId,"courses",value,"Course");
        fields.push(sql`course_id=${value}`);
      }
      if(body.sourceId!==undefined){
        const value=inputUuid(body.sourceId,"Source");await assertReference(trx,auth.tenantId,"enquiry_sources",value,"Source");
        fields.push(sql`source_id=${value}`);
      }
      if(body.priority!==undefined){
        const value=inputText(body.priority,"Priority",16,true)!;
        if(!["low","normal","high","urgent"].includes(value))throw new ApiError(400,"INVALID_PRIORITY","Priority is invalid.");
        fields.push(sql`priority=${value}`);
      }
      if(body.interestedMode!==undefined){
        const value=inputText(body.interestedMode,"Interested mode",16);
        if(value&&!["offline","online","hybrid"].includes(value))throw new ApiError(400,"INVALID_MODE","Mode is invalid.");
        fields.push(sql`interested_mode=${value}`);
      }
      if(body.expectedJoiningDate!==undefined)fields.push(sql`expected_joining_date=${inputDate(body.expectedJoiningDate,"Expected joining date")}`);
      if(body.preferredContactTime!==undefined)fields.push(sql`preferred_contact_time=${inputText(body.preferredContactTime,"Preferred contact time",100)}`);
      if(body.remarks!==undefined)fields.push(sql`remarks=${inputText(body.remarks,"Remarks",3000)}`);
      if(body.customFields!==undefined){
        if(!body.customFields||typeof body.customFields!=="object"||Array.isArray(body.customFields)||Object.keys(body.customFields).length>20)throw new ApiError(400,"INVALID_CUSTOM_FIELDS","Custom fields must be an object with up to 20 keys.");
        fields.push(sql`custom_fields=${JSON.stringify(body.customFields)}::jsonb`);
      }
      if(!fields.length)throw new ApiError(400,"NO_CHANGES","No editable fields were supplied.");
      fields.push(sql`updated_by_membership_id=${auth.membershipId}`,sql`updated_at=now()`,sql`row_version=row_version+1`);
      const updated=await sql<any>`
        UPDATE enquiries SET ${sql.join(fields,sql`,`)}
        WHERE tenant_id=${auth.tenantId} AND id=${enquiry.id} AND row_version=${expectedVersion}
        RETURNING *
      `.execute(trx);
      if(!updated.rows[0])throw new ApiError(409,"CONCURRENT_UPDATE","This enquiry changed while saving.");
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,"updated","Enquiry details updated",null,{rowVersion:updated.rows[0].row_version});
      await addAudit(trx,auth.tenantId,auth.membershipId,"enquiry.updated","enquiry",enquiry.id,request.ip||null,{rowVersion:updated.rows[0].row_version});
      return updated.rows[0];
    });
    response.json({enquiry:result});
  }catch(error){next(error);}
});


enquiryRouter.patch("/enquiries/:id/status",requirePermission("enquiries.update"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const toStatus=inputText(request.body?.status,"Status",40,true)!;
    const lostReason=inputText(request.body?.lostReason,"Lost reason",500);
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertEnquiryScope(request,enquiry);
      if(toStatus==="converted")throw new ApiError(400,"USE_ADMISSION_CONVERSION","Use admission conversion to mark an enquiry as Converted.");
      if(toStatus==="lost"&&!lostReason)throw new ApiError(400,"LOST_REASON_REQUIRED","A reason is required when marking an enquiry Lost.");
      const allowed=await sql`SELECT 1 FROM enquiry_status_transitions WHERE tenant_id=${auth.tenantId} AND from_status_key=${enquiry.status_key} AND to_status_key=${toStatus}`.execute(trx);
      if(!allowed.rows.length||!canTransition(enquiry.status_key as any,toStatus as any))throw new ApiError(409,"INVALID_STATUS_TRANSITION","Status transition is not allowed.");
      const updated=await sql<any>`
        UPDATE enquiries SET status_key=${toStatus},lost_reason=${toStatus==="lost"?lostReason:null},
          updated_by_membership_id=${auth.membershipId},updated_at=now(),row_version=row_version+1
        WHERE tenant_id=${auth.tenantId} AND id=${enquiry.id} RETURNING *
      `.execute(trx);
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,"status_changed","Status changed",lostReason,{fromStatus:enquiry.status_key,toStatus});
      await addAudit(trx,auth.tenantId,auth.membershipId,"enquiry.status_changed","enquiry",enquiry.id,request.ip||null,{fromStatus:enquiry.status_key,toStatus});
      return updated.rows[0];
    });
    response.json({enquiry:result});
  }catch(error){next(error);}
});

enquiryRouter.post("/enquiries/:id/assign",requirePermission("enquiries.assign"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const membershipId=inputUuid(request.body?.membershipId,"Counsellor",true)!;
    const note=inputText(request.body?.note,"Assignment note",500);
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertBranch(request,enquiry.branch_id);
      await assignEnquiry(trx,request,enquiry,membershipId,"manual",note||undefined);
      return getEnquiry(trx,auth.tenantId,enquiry.id);
    });
    response.json({enquiry:result});
  }catch(error){next(error);}
});

enquiryRouter.post("/enquiries/:id/assign/round-robin",requirePermission("enquiries.assign"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertBranch(request,enquiry.branch_id);
      const membershipId=await chooseRoundRobinCounsellor(trx,request,enquiry);
      await assignEnquiry(trx,request,enquiry,membershipId,"round_robin");
      return getEnquiry(trx,auth.tenantId,enquiry.id);
    });
    response.json({enquiry:result});
  }catch(error){next(error);}
});

enquiryRouter.post("/enquiries/:id/archive",requirePermission("enquiries.archive"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertEnquiryScope(request,enquiry);
      await sql`UPDATE enquiries SET archived_at=now(),updated_at=now(),updated_by_membership_id=${auth.membershipId},row_version=row_version+1 WHERE tenant_id=${auth.tenantId} AND id=${enquiry.id}`.execute(trx);
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,"archived","Enquiry archived");
      await addAudit(trx,auth.tenantId,auth.membershipId,"enquiry.archived","enquiry",enquiry.id,request.ip||null);
    });
    response.json({ok:true});
  }catch(error){next(error);}
});

enquiryRouter.post("/enquiries/:id/restore",requirePermission("enquiries.archive"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id,true);
      assertBranch(request,enquiry.branch_id);
      await sql`UPDATE enquiries SET archived_at=NULL,updated_at=now(),updated_by_membership_id=${auth.membershipId},row_version=row_version+1 WHERE tenant_id=${auth.tenantId} AND id=${enquiry.id}`.execute(trx);
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,"restored","Enquiry restored");
      await addAudit(trx,auth.tenantId,auth.membershipId,"enquiry.restored","enquiry",enquiry.id,request.ip||null);
    });
    response.json({ok:true});
  }catch(error){next(error);}
});

enquiryRouter.post("/enquiries/:id/activities",requirePermission("enquiries.update"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const type=inputText(request.body?.type,"Activity type",30,true)!;
    if(!["call","whatsapp","email","visit","counselling","demo_scheduled","demo_completed","note"].includes(type))throw new ApiError(400,"INVALID_ACTIVITY_TYPE","Activity type is invalid.");
    const title=inputText(request.body?.title,"Activity title",180,true)!;
    const description=inputText(request.body?.description,"Activity remarks",3000);
    await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertEnquiryScope(request,enquiry);
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,type,title,description);
      await addAudit(trx,auth.tenantId,auth.membershipId,"enquiry.activity_added","enquiry",enquiry.id,request.ip||null,{type});
    });
    response.status(201).json({ok:true});
  }catch(error){next(error);}
});
