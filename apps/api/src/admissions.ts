import { randomUUID } from "node:crypto";
import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, getEnquiry, assertEnquiryScope, assertBranch, addActivity, addAudit } from "./enquiry-service.js";
import { normalizePersonName, parsePositiveInteger, validateFee } from "./enquiry-domain.js";

export const admissionRouter = Router();
admissionRouter.use(requireAuth);
admissionRouter.use((request,response,next)=>{
  if(["GET","HEAD","OPTIONS"].includes(request.method))return next();
  return requireCsrf(request,response,next);
});

function uuid(value:unknown,label:string,required=false):string|null{
  if(value===undefined||value===null||value===""){if(required)throw new ApiError(400,"VALIDATION_ERROR",label+" is required.");return null;}
  if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,"VALIDATION_ERROR",label+" is invalid.");
  return value;
}
function text(value:unknown,label:string,max=250):string|null{
  if(value===undefined||value===null||value==="")return null;
  if(typeof value!=="string")throw new ApiError(400,"VALIDATION_ERROR",label+" must be text.");
  const result=value.trim();
  if(result.length>max)throw new ApiError(400,"VALIDATION_ERROR",label+" is too long.");
  return result||null;
}
async function nextAdmissionNumber(trx:any,tenantId:string,branchId:string,period:string):Promise<string>{
  const branch=await sql<{branch_code:string}>`SELECT branch_code FROM branches WHERE tenant_id=${tenantId} AND id=${branchId}`.execute(trx);
  const seq=await sql<{last_value:number}>`
    INSERT INTO admission_id_sequences(tenant_id,branch_id,period_key,last_value)
    VALUES(${tenantId},${branchId},${period},1)
    ON CONFLICT(tenant_id,branch_id,period_key)
    DO UPDATE SET last_value=admission_id_sequences.last_value+1
    RETURNING last_value
  `.execute(trx);
  return "ADM-"+branch.rows[0].branch_code+"-"+period+"-"+String(seq.rows[0].last_value).padStart(5,"0");
}

admissionRouter.post("/enquiries/:id/convert",requirePermission("admissions.convert"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const courseId=uuid(request.body?.courseId,"Course",true)!;
    const branchId=uuid(request.body?.branchId,"Branch",true)!;
    const batchId=uuid(request.body?.batchId,"Batch");
    const feeStructureId=uuid(request.body?.feeStructureId,"Fee structure");
    assertBranch(request,branchId);
    const discountAmount=Number(request.body?.discountAmount??0);
    const discountReason=text(request.body?.discountReason,"Discount reason",500);
    if(discountAmount>0&&!discountReason)throw new ApiError(400,"DISCOUNT_REASON_REQUIRED","Provide a reason for the discount.");
    const result=await withTenant(auth.tenantId,async(trx)=>{
      const enquiry=await getEnquiry(trx,auth.tenantId,request.params.id);
      assertEnquiryScope(request,enquiry);
      const locked=await sql<any>`SELECT * FROM enquiries WHERE tenant_id=${auth.tenantId} AND id=${enquiry.id} FOR UPDATE`.execute(trx);
      const current=locked.rows[0];
      const existing=await sql<any>`
        SELECT a.*,s.full_name AS student_name,s.student_number
        FROM admissions a JOIN students s ON s.tenant_id=a.tenant_id AND s.id=a.student_id
        WHERE a.tenant_id=${auth.tenantId} AND a.enquiry_id=${current.id} LIMIT 1
      `.execute(trx);
      if(existing.rows[0])return {admission:existing.rows[0],alreadyConverted:true};
      if(["lost","not_interested","converted"].includes(current.status_key))throw new ApiError(409,"ENQUIRY_NOT_CONVERTIBLE","This enquiry cannot be converted from its current status.");

      const refs=await sql<any>`
        SELECT c.default_fee,c.name AS course_name,b.branch_code
        FROM courses c CROSS JOIN branches b
        WHERE c.tenant_id=${auth.tenantId} AND c.id=${courseId} AND c.is_active=true
          AND b.tenant_id=${auth.tenantId} AND b.id=${branchId} AND b.is_active=true
      `.execute(trx);
      if(!refs.rows[0])throw new ApiError(400,"INVALID_COURSE_OR_BRANCH","Selected course or branch is not active.");
      let baseFee=Number(refs.rows[0].default_fee);
      if(batchId){
        const batch=await sql<any>`
          SELECT b.id,b.seat_limit,
            (SELECT count(*)::integer FROM admissions a WHERE a.tenant_id=b.tenant_id AND a.batch_id=b.id) AS seats_used
          FROM batches b
          WHERE b.tenant_id=${auth.tenantId} AND b.id=${batchId}
            AND b.branch_id=${branchId} AND b.course_id=${courseId} AND b.is_active=true
          FOR UPDATE
        `.execute(trx);
        if(!batch.rows[0])throw new ApiError(400,"BATCH_UNAVAILABLE","The selected batch does not match this course and branch.");
        if(batch.rows[0].seat_limit!==null&&Number(batch.rows[0].seats_used)>=Number(batch.rows[0].seat_limit))throw new ApiError(409,"BATCH_FULL","The selected batch has no seats available.");
      }
      if(feeStructureId){
        const fee=await sql<any>`SELECT total_fee FROM fee_structures WHERE tenant_id=${auth.tenantId} AND id=${feeStructureId} AND course_id=${courseId} AND is_active=true`.execute(trx);
        if(!fee.rows[0])throw new ApiError(400,"FEE_STRUCTURE_UNAVAILABLE","Fee structure is not active for the selected course.");
        baseFee=Number(fee.rows[0].total_fee);
      }
      const fees=validateFee(baseFee,discountAmount);
      const normalizedName=normalizePersonName(current.student_name);
      await sql`SELECT pg_advisory_xact_lock(hashtext(${auth.tenantId}),hashtext(${normalizedName+"|"+current.mobile_normalized}))`.execute(trx);
      const existingStudent=await sql<any>`
        SELECT id,student_number FROM students
        WHERE tenant_id=${auth.tenantId} AND mobile_normalized=${current.mobile_normalized}
          AND lower(regexp_replace(full_name,'\\s+',' ','g'))=${normalizedName}
        ORDER BY created_at LIMIT 1
      `.execute(trx);
      let studentId:string;
      let studentNumber:string;
      if(existingStudent.rows[0]){
        studentId=existingStudent.rows[0].id;
        studentNumber=existingStudent.rows[0].student_number;
      }else{
        studentId=randomUUID();
        studentNumber="STU-"+Date.now().toString(36).toUpperCase()+"-"+randomUUID().slice(0,5).toUpperCase();
        await sql`
          INSERT INTO students(id,tenant_id,student_number,full_name,mobile,mobile_normalized,email,guardian_name,guardian_mobile,guardian_mobile_normalized,created_from_enquiry_id)
          VALUES(${studentId},${auth.tenantId},${studentNumber},${current.student_name},${current.mobile},${current.mobile_normalized},${current.email},${current.parent_name},${current.alternate_mobile},${current.alternate_mobile_normalized},${current.id})
        `.execute(trx);
      }
      const period=new Date().toISOString().slice(0,7).replace("-","");
      const admissionNumber=await nextAdmissionNumber(trx,auth.tenantId,branchId,period);
      const inserted=await sql<any>`
        INSERT INTO admissions(
          tenant_id,admission_number,enquiry_id,student_id,branch_id,course_id,batch_id,fee_structure_id,
          base_fee,discount_amount,final_fee,discount_reason,admitted_by_membership_id
        ) VALUES(
          ${auth.tenantId},${admissionNumber},${current.id},${studentId},${branchId},${courseId},${batchId},
          ${feeStructureId},${fees.baseFee},${fees.discountAmount},${fees.finalFee},${discountReason},${auth.membershipId}
        ) RETURNING *
      `.execute(trx);
      await sql`UPDATE enquiries SET status_key='converted',course_id=${courseId},updated_by_membership_id=${auth.membershipId},updated_at=now(),row_version=row_version+1 WHERE tenant_id=${auth.tenantId} AND id=${current.id}`.execute(trx);
      await addActivity(trx,auth.tenantId,current.id,auth.membershipId,"converted","Enquiry converted to admission",discountReason,{
        admissionId:inserted.rows[0].id,admissionNumber,studentId,studentNumber,courseId,batchId,fees
      });
      await addAudit(trx,auth.tenantId,auth.membershipId,"admission.converted","admission",inserted.rows[0].id,request.ip||null,{
        enquiryId:current.id,admissionNumber,studentId,courseId,batchId,fees
      });
      return {admission:{...inserted.rows[0],student_name:current.student_name,student_number:studentNumber},alreadyConverted:false};
    });
    response.status(result.alreadyConverted?200:201).json(result);
  }catch(error){next(error);}
});

admissionRouter.get("/",requirePermission("admissions.read"),async(request,response,next)=>{
  try{
    const auth=actorOf(request);
    const page=parsePositiveInteger(request.query.page,1,1000000);
    const pageSize=parsePositiveInteger(request.query.pageSize,20,100);
    const branchId=uuid(request.query.branchId,"Branch");
    if(branchId)assertBranch(request,branchId);
    const conditions=[sql`a.tenant_id=${auth.tenantId}`];
    if(!request.canAccessAllBranches){
      const branches=request.accessibleBranchIds||[];
      conditions.push(branches.length?sql`a.branch_id=ANY(${branches}::uuid[])`:sql`false`);
    }
    if(branchId)conditions.push(sql`a.branch_id=${branchId}`);
    const where=sql.join(conditions,sql` AND `);
    const data=await withTenant(auth.tenantId,async(trx)=>{
      const count=await sql<any>`SELECT count(*)::integer AS total FROM admissions a WHERE ${where}`.execute(trx);
      const rows=await sql<any>`
        SELECT a.*,s.full_name AS student_name,s.student_number,c.name AS course_name,b.name AS branch_name,ba.name AS batch_name
        FROM admissions a
        JOIN students s ON s.tenant_id=a.tenant_id AND s.id=a.student_id
        JOIN courses c ON c.tenant_id=a.tenant_id AND c.id=a.course_id
        JOIN branches b ON b.tenant_id=a.tenant_id AND b.id=a.branch_id
        LEFT JOIN batches ba ON ba.tenant_id=a.tenant_id AND ba.id=a.batch_id
        WHERE ${where} ORDER BY a.admitted_at DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}
      `.execute(trx);
      return {items:rows.rows,total:Number(count.rows[0]?.total||0)};
    });
    response.json({...data,page,pageSize,pageCount:Math.ceil(data.total/pageSize)});
  }catch(error){next(error);}
});
