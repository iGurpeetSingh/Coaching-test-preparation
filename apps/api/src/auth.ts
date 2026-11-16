import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { Router, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { sql } from "kysely";
import { db, withTenant } from "./db.js";

export type AuthContext = {
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  email: string;
  fullName: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      permissionSet?: Set<string>;
      accessibleBranchIds?: string[];
      canAccessAllBranches?: boolean;
    }
  }
}

const SESSION_COOKIE = "coaching_session";
const CSRF_COOKIE = "coaching_csrf";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const cookieSameSite = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase() as "lax" | "strict" | "none";
const secureCookies = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(value.join("=")); } catch { return undefined; }
    }
  }
  return undefined;
}

function setCsrfCookie(response: Response, token: string): void {
  response.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: secureCookies,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}

function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}

function clearSessionCookies(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, secure: secureCookies, sameSite: cookieSameSite });
  response.clearCookie(CSRF_COOKIE, { path: "/", httpOnly: false, secure: secureCookies, sameSite: cookieSameSite });
}

function requireMatchingPreAuthCsrf(request: Request, response: Response): boolean {
  const cookieToken = readCookie(request, CSRF_COOKIE);
  const headerToken = request.header("x-csrf-token");
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    response.status(403).json({ error: { code: "CSRF_FAILED", message: "Refresh the page and retry the request." } });
    return false;
  }
  return true;
}

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "LOGIN_RATE_LIMIT", message: "Too many login attempts. Try again later." } }
});

authRouter.get("/csrf", (request, response) => {
  const existing = readCookie(request, CSRF_COOKIE);
  const token = existing && existing.length >= 32 ? existing : randomBytes(32).toString("base64url");
  setCsrfCookie(response, token);
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ csrfToken: token });
});

authRouter.post("/login", loginLimiter, async (request, response, next) => {
  try {
    if (!requireMatchingPreAuthCsrf(request, response)) return;
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const tenantSlug = typeof request.body?.tenantSlug === "string" ? request.body.tenantSlug.trim().toLowerCase() : "";

    if (!email || !password || email.length > 254 || password.length > 1024) {
      response.status(400).json({ error: { code: "INVALID_LOGIN", message: "Enter a valid email and password." } });
      return;
    }

    const result = tenantSlug
      ? await sql<any>`
          SELECT u.id AS user_id, u.email, u.full_name, u.password_hash,
                 m.membership_id AS membership_id, t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
          FROM users u
          JOIN login_membership_directory m ON m.user_id = u.id AND m.membership_status = 'active'
          JOIN tenants t ON t.id = m.tenant_id AND t.status = 'active'
          WHERE u.email_normalized = ${email} AND u.is_active = true AND t.slug = ${tenantSlug}
          LIMIT 2
        `.execute(db)
      : await sql<any>`
          SELECT u.id AS user_id, u.email, u.full_name, u.password_hash,
                 m.membership_id AS membership_id, t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
          FROM users u
          JOIN login_membership_directory m ON m.user_id = u.id AND m.membership_status = 'active'
          JOIN tenants t ON t.id = m.tenant_id AND t.status = 'active'
          WHERE u.email_normalized = ${email} AND u.is_active = true
          ORDER BY t.name
          LIMIT 2
        `.execute(db);

    const memberships = result.rows;
    if (memberships.length === 0) {
      response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      return;
    }

    const user = memberships[0];
    const validPassword = await argon2.verify(user.password_hash, password).catch(() => false);
    if (!validPassword) {
      response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
      return;
    }

    if (!tenantSlug && memberships.length > 1) {
      response.status(409).json({
        error: { code: "TENANT_SELECTION_REQUIRED", message: "Choose the institute workspace to continue." },
        workspaces: memberships.map((item: any) => ({ name: item.tenant_name, slug: item.tenant_slug }))
      });
      return;
    }

    const sessionToken = randomBytes(48).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await withTenant(user.tenant_id, async (trx) => {
      await sql`
      INSERT INTO user_sessions (tenant_id, membership_id, token_hash, csrf_hash, expires_at, ip_address, user_agent)
      VALUES (
        ${user.tenant_id}, ${user.membership_id}, ${hash(sessionToken)}, ${hash(csrfToken)},
        ${expiresAt.toISOString()}, ${request.ip || null}, ${request.header("user-agent")?.slice(0, 500) || null}
      )
    `.execute(trx);
    });

    setSessionCookie(response, sessionToken);
    setCsrfCookie(response, csrfToken);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      user: {
        id: user.user_id,
        email: user.email,
        fullName: user.full_name
      },
      workspace: { id: user.tenant_id, name: user.tenant_name, slug: user.tenant_slug },
      expiresAt: expiresAt.toISOString(),
      csrfToken
    });
  } catch (error) {
    next(error);
  }
});

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token || token.length < 32) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
      return;
    }

    // Session table is the only unscoped lookup here. All tenant-owned identity rows
    // are fetched only after the tenant id has been established from this opaque token.
    const sessionResult = await db.transaction().execute(async (trx) => {
      await sql`select set_config('app.session_token_hash', ${hash(token)}, true)`.execute(trx);
      return sql<any>`
        SELECT id AS session_id, tenant_id, membership_id, csrf_hash
        FROM user_sessions
        WHERE token_hash = ${hash(token)} AND revoked_at IS NULL AND expires_at > now()
        LIMIT 1
      `.execute(trx);
    });
    const session = sessionResult.rows[0];
    if (!session) {
      clearSessionCookies(response);
      response.status(401).json({ error: { code: "SESSION_EXPIRED", message: "Your session expired. Sign in again." } });
      return;
    }

    const identityResult = await withTenant(session.tenant_id, async (trx) => sql<any>`
      SELECT u.id AS user_id, u.email, u.full_name, u.is_active AS user_active,
             m.status AS membership_status, t.name AS tenant_name, t.slug AS tenant_slug,
             t.status AS tenant_status
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.id = ${session.membership_id} AND m.tenant_id = ${session.tenant_id}
      LIMIT 1
    `.execute(trx));
    const identity = identityResult.rows[0];
    if (!identity || !identity.user_active || identity.membership_status !== "active" || identity.tenant_status !== "active") {
      clearSessionCookies(response);
      response.status(401).json({ error: { code: "SESSION_REVOKED", message: "Your workspace access is no longer active." } });
      return;
    }

    request.auth = {
      userId: identity.user_id,
      membershipId: session.membership_id,
      tenantId: session.tenant_id,
      tenantName: identity.tenant_name,
      tenantSlug: identity.tenant_slug,
      email: identity.email,
      fullName: identity.full_name
    };
    response.locals.sessionId = session.session_id;
    response.locals.sessionCsrfHash = session.csrf_hash;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(request: Request, response: Response, next: NextFunction): void {
  const cookieToken = readCookie(request, CSRF_COOKIE);
  const headerToken = request.header("x-csrf-token");
  const expectedHash = response.locals.sessionCsrfHash as string | undefined;
  if (!cookieToken || !headerToken || !expectedHash ||
      !safeEqual(cookieToken, headerToken) || !safeEqual(hash(cookieToken), expectedHash)) {
    response.status(403).json({ error: { code: "CSRF_FAILED", message: "Refresh the page and retry the request." } });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.auth) {
        response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
        return;
      }
      if (!request.permissionSet) {
        const auth = request.auth;
        const access = await withTenant(auth.tenantId, async (trx) => {
          const roles = await sql<{ permission_key: string }>`
            SELECT DISTINCT rp.permission_key
            FROM membership_roles mr
            JOIN role_permissions rp ON rp.tenant_id = mr.tenant_id AND rp.role_id = mr.role_id
            WHERE mr.tenant_id = ${auth.tenantId} AND mr.membership_id = ${auth.membershipId}
          `.execute(trx);
          const branchRows = await sql<{ branch_id: string }>`
            SELECT branch_id FROM membership_branch_access
            WHERE tenant_id = ${auth.tenantId} AND membership_id = ${auth.membershipId}
          `.execute(trx);
          return {
            permissions: new Set(roles.rows.map((row) => row.permission_key)),
            branches: branchRows.rows.map((row) => row.branch_id)
          };
        });
        request.permissionSet = access.permissions;
        request.accessibleBranchIds = access.branches;
        request.canAccessAllBranches = access.permissions.has("enquiries.read_all") || access.permissions.has("branches.manage");
      }
      if (!request.permissionSet.has(permission)) {
        response.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function assertBranchAccess(request: Request, branchId: string): boolean {
  return Boolean(
    request.canAccessAllBranches ||
    request.accessibleBranchIds?.includes(branchId)
  );
}

authRouter.post("/logout", requireAuth, requireCsrf, async (request, response, next) => {
  try {
    const sessionId = response.locals.sessionId as string;
    const auth = request.auth!;
    await withTenant(auth.tenantId, async (trx) => {
      await sql`UPDATE user_sessions SET revoked_at = now() WHERE tenant_id = ${auth.tenantId} AND id = ${sessionId} AND revoked_at IS NULL`.execute(trx);
    });
    clearSessionCookies(response);
    response.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    if (!request.auth) {
      response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
      return;
    }
    const auth = request.auth;
    const data = await withTenant(auth.tenantId, async (trx) => {
      const roleRows = await sql<{ role_key: string; role_name: string }>`
        SELECT r.key AS role_key, r.name AS role_name
        FROM membership_roles mr
        JOIN roles r ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
        WHERE mr.tenant_id = ${auth.tenantId} AND mr.membership_id = ${auth.membershipId}
      `.execute(trx);
      const permissionRows = await sql<{ permission_key: string }>`
        SELECT DISTINCT rp.permission_key
        FROM membership_roles mr
        JOIN role_permissions rp ON rp.tenant_id = mr.tenant_id AND rp.role_id = mr.role_id
        WHERE mr.tenant_id = ${auth.tenantId} AND mr.membership_id = ${auth.membershipId}
      `.execute(trx);
      const branches = await sql<{ id: string; name: string; branch_code: string }>`
        SELECT b.id, b.name, b.branch_code
        FROM branches b
        LEFT JOIN membership_branch_access mba
          ON mba.tenant_id = b.tenant_id AND mba.branch_id = b.id AND mba.membership_id = ${auth.membershipId}
        WHERE b.tenant_id = ${auth.tenantId} AND b.is_active = true
          AND (mba.membership_id IS NOT NULL OR EXISTS (
            SELECT 1 FROM membership_roles mr
            JOIN role_permissions rp ON rp.tenant_id = mr.tenant_id AND rp.role_id = mr.role_id
            WHERE mr.tenant_id = ${auth.tenantId} AND mr.membership_id = ${auth.membershipId}
              AND rp.permission_key IN ('enquiries.read_all','branches.manage')
          ))
        ORDER BY b.name
      `.execute(trx);
      return {
        roles: roleRows.rows,
        permissions: permissionRows.rows.map((row) => row.permission_key),
        branches: branches.rows
      };
    });
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({ user: auth, ...data });
  } catch (error) {
    next(error);
  }
});
