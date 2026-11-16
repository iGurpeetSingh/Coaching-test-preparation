import { Router } from "express";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { actorOf } from "./enquiry-service.js";
import { sql } from "kysely";

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
