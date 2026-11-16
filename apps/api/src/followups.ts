import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, getEnquiry, assertEnquiryScope, assertBranch, addActivity, addAudit, isDuplicatePendingFollowupError } from "./enquiry-service.js";
import { parsePositiveInteger } from "./enquiry-domain.js";

export const followupRouter = Router();
followupRouter.use(requireAuth);
followupRouter.use((request,response,next)=>{
  if (["GET","HEAD","OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request,response,next);
});

function text(value:unknown,label:string,max=250,required=false):string|null{
  if(value===undefined||value===null){if(required)throw new ApiError(400,"VALIDATION_ERROR",label+" is required.");return null;}
  if(typeof value!=="string")throw new ApiError(400,"VALIDATION_ERROR",label+" must be text.");
  const result=value.trim();
  if(required&&!result)throw new ApiError(400,"VALIDATION_ERROR",label+" is required.");
  if(result.length>max)throw new ApiError(400,"VALIDATION_ERROR",label+" is too long.");
  return result||null;
}

followupRouter.get("/",requirePermission("followups.read"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const page=parsePositiveInteger(request.query.page,1,1000000);
    const pageSize=parsePositiveInteger(request.query.pageSize,20,100);
    const filter=String(request.query.filter||"upcoming");
    if(!["all","upcoming","overdue","today","completed","cancelled"].includes(filter))throw new ApiError(400,"INVALID_FILTER","Follow-up filter is invalid.");
    const conditions=[sql`f.tenant_id=${auth.tenantId}`];
    if(!request.canAccessAllBranches){
      const branches=request.accessibleBranchIds||[];
      conditions.push(branches.length?sql`e.branch_id=ANY(${branches}::uuid[])`:sql`false`);
      if(!request.permissionSet?.has("enquiries.read_all"))conditions.push(sql`(f.assigned_to_membership_id=${auth.membershipId} OR e.assigned_to_membership_id=${auth.membershipId})`);
    }
    if(filter==="upcoming")conditions.push(sql`f.status='pending' AND f.scheduled_at>=now()`);
    if(filter==="overdue")conditions.push(sql`f.status='pending' AND f.scheduled_at<now()`);
    if(filter==="today")conditions.push(sql`f.status='pending' AND f.scheduled_at>=date_trunc('day',now()) AND f.scheduled_at<date_trunc('day',now())+interval '1 day'`);
    if(filter==="completed")conditions.push(sql`f.status='completed'`);
    if(filter==="cancelled")conditions.push(sql`f.status='cancelled'`);
    const where=sql.join(conditions,sql` AND `);
    const data=await withTenant(auth.tenantId,async(trx)=>{
      const count=await sql<any>`SELECT count(*)::integer AS total FROM follow_ups f JOIN enquiries e ON e.tenant_id=f.tenant_id AND e.id=f.enquiry_id WHERE ${where}`.execute(trx);
      const rows=await sql<any>`
        SELECT f.*,e.enquiry_number,e.student_name,e.mobile,e.status_key AS enquiry_status,
          e.branch_id,b.name AS branch_name,u.full_name AS counsellor_name
        FROM follow_ups f
        JOIN enquiries e ON e.tenant_id=f.tenant_id AND e.id=f.enquiry_id
        JOIN branches b ON b.tenant_id=e.tenant_id AND b.id=e.branch_id
        JOIN memberships m ON m.tenant_id=f.tenant_id AND m.id=f.assigned_to_membership_id
        JOIN users u ON u.id=m.user_id
        WHERE ${where}
        ORDER BY CASE WHEN f.status='pending' AND f.scheduled_at<now() THEN 0 ELSE 1 END,f.scheduled_at ASC
        LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}
      `.execute(trx);
      return {items:rows.rows,total:Number(count.rows[0]?.total||0)};
    });
    response.setHeader("Cache-Control","no-store");
    response.json({...data,page,pageSize,pageCount:Math.ceil(data.total/pageSize)});
  }catch(error){next(error);}
});

followupRouter.post("/enquiries/:id",requirePermission("followups.manage"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const scheduledAtText=text(request.body?.scheduledAt,"Follow-up date and time",50,true)!;
    const scheduledAt=new Date(scheduledAtText);
    if(Number.isNaN(scheduledAt.getTime())||scheduledAt.getTime()<Date.now()-60000)throw new ApiError(400,"INVALID_FOLLOWUP_DATE","Follow-up must be scheduled for a future date and time.");
    const channel=text(request.body?.channel,"Channel",20,true)!;
    if(!["call","whatsapp","email","visit","meeting","demo","other"].includes(channel))throw new ApiError(400,"INVALID_FOLLOWUP_CHANNEL","Follow-up channel is invalid.");
    const title=text(request.body?.title,"Title",180,true)!;
    const notes=text(request.body?.notes,"Notes",3000);
    const assignedTo=typeof request.body?.assignedToMembershipId==="string"&&request.body.assignedToMembershipId.trim()?request.body.assignedToMembershipId:auth.membershipId;
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertEnquiryScope(request,enquiry);
      if(assignedTo!==auth.membershipId&&!request.permissionSet?.has("enquiries.assign"))throw new ApiError(403,"FORBIDDEN","You cannot assign this follow-up to another counsellor.");
      const active=await sql`SELECT 1 FROM memberships WHERE tenant_id=${auth.tenantId} AND id=${assignedTo} AND status='active'`.execute(trx);
      if(!active.rows.length)throw new ApiError(400,"INVALID_COUNSELLOR","Follow-up owner is not an active member of this institute.");
      const inserted=await sql<any>`
        INSERT INTO follow_ups(tenant_id,enquiry_id,assigned_to_membership_id,created_by_membership_id,scheduled_at,channel,title,notes)
        VALUES(${auth.tenantId},${enquiry.id},${assignedTo},${auth.membershipId},${scheduledAt.toISOString()},${channel},${title},${notes})
        RETURNING *
      `.execute(trx);
      await addActivity(trx,auth.tenantId,enquiry.id,auth.membershipId,channel==="demo"?"demo_scheduled":"note","Follow-up scheduled",notes,{followupId:inserted.rows[0].id,scheduledAt:scheduledAt.toISOString(),channel});
      await addAudit(trx,auth.tenantId,auth.membershipId,"followup.created","follow_up",inserted.rows[0].id,request.ip||null,{enquiryId:enquiry.id,channel});
      return inserted.rows[0];
    });
    response.status(201).json({followUp:result});
  }catch(error){
    if(isDuplicatePendingFollowupError(error)){
      response.status(409).json({error:{code:"DUPLICATE_FOLLOWUP",message:"An identical pending follow-up is already scheduled."}});
      return;
    }
    next(error);
  }
});

followupRouter.patch("/:id/complete",requirePermission("followups.manage"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const outcome=text(request.body?.outcome,"Outcome",1000,true)!;
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const found=await sql<any>`
        SELECT f.*,e.branch_id FROM follow_ups f
        JOIN enquiries e ON e.tenant_id=f.tenant_id AND e.id=f.enquiry_id
        WHERE f.tenant_id=${auth.tenantId} AND f.id=${request.params.id}
        FOR UPDATE OF f
      `.execute(trx);
      const followup=found.rows[0];
      if(!followup)throw new ApiError(404,"FOLLOWUP_NOT_FOUND","Follow-up was not found.");
      assertBranch(request,followup.branch_id);
      if(!request.canAccessAllBranches&&!request.permissionSet?.has("enquiries.read_all")&&followup.assigned_to_membership_id!==auth.membershipId)throw new ApiError(404,"FOLLOWUP_NOT_FOUND","Follow-up was not found.");
      if(followup.status!=="pending")throw new ApiError(409,"FOLLOWUP_ALREADY_CLOSED","This follow-up is already completed or cancelled.");
      const updated=await sql<any>`
        UPDATE follow_ups SET status='completed',outcome=${outcome},completed_at=now(),completed_by_membership_id=${auth.membershipId},updated_at=now()
        WHERE tenant_id=${auth.tenantId} AND id=${followup.id} AND status='pending' RETURNING *
      `.execute(trx);
      await addActivity(trx,auth.tenantId,followup.enquiry_id,auth.membershipId,"followup_completed","Follow-up completed",outcome,{followupId:followup.id,channel:followup.channel});
      await addAudit(trx,auth.tenantId,auth.membershipId,"followup.completed","follow_up",followup.id,request.ip||null,{enquiryId:followup.enquiry_id});
      return updated.rows[0];
    });
    response.json({followUp:result});
  }catch(error){next(error);}
});

followupRouter.patch("/:id/cancel",requirePermission("followups.manage"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const reason=text(request.body?.reason,"Cancellation reason",500);
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const found=await sql<any>`
        SELECT f.*,e.branch_id FROM follow_ups f
        JOIN enquiries e ON e.tenant_id=f.tenant_id AND e.id=f.enquiry_id
        WHERE f.tenant_id=${auth.tenantId} AND f.id=${request.params.id} FOR UPDATE OF f
      `.execute(trx);
      const followup=found.rows[0];
      if(!followup)throw new ApiError(404,"FOLLOWUP_NOT_FOUND","Follow-up was not found.");
      assertBranch(request,followup.branch_id);
      if(followup.status!=="pending")throw new ApiError(409,"FOLLOWUP_ALREADY_CLOSED","Only pending follow-ups can be cancelled.");
      const updated=await sql<any>`UPDATE follow_ups SET status='cancelled',outcome=${reason},updated_at=now() WHERE tenant_id=${auth.tenantId} AND id=${followup.id} AND status='pending' RETURNING *`.execute(trx);
      await addActivity(trx,auth.tenantId,followup.enquiry_id,auth.membershipId,"note","Follow-up cancelled",reason,{followupId:followup.id});
      await addAudit(trx,auth.tenantId,auth.membershipId,"followup.cancelled","follow_up",followup.id,request.ip||null,{enquiryId:followup.enquiry_id});
      return updated.rows[0];
    });
    response.json({followUp:result});
  }catch(error){next(error);}
});
