export type ApiErrorBody = {
  error?: { code?: string; message?: string };
  workspaces?: Array<{ name: string; slug: string }>;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly workspaces: Array<{ name: string; slug: string }>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message || "The request could not be completed.");
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.error?.code || "REQUEST_FAILED";
    this.workspaces = body.workspaces || [];
  }
}

export type CurrentUserResponse = {
  user: {
    userId: string;
    membershipId: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    email: string;
    fullName: string;
  };
  roles: Array<{ role_key: string; role_name: string }>;
  permissions: string[];
  branches: Array<{ id: string; name: string; branch_code: string }>;
};

let csrfToken = "";

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { code: "INVALID_RESPONSE", message: "The server returned an invalid response." } };
  }
}

export async function bootstrapCsrf(): Promise<void> {
  const response = await fetch("/api/v1/auth/csrf", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  const payload = await readJson(response) as { csrfToken?: string; error?: { message?: string; code?: string } };
  if (!response.ok || !payload.csrfToken) {
    throw new ApiClientError(response.status, { error: payload.error || { code: "CSRF_BOOTSTRAP_FAILED", message: "Could not initialise a secure session." } });
  }
  csrfToken = payload.csrfToken;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (mutating && !csrfToken) await bootstrapCsrf();

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (mutating) headers.set("x-csrf-token", csrfToken);

  const response = await fetch(path.startsWith("/api/") ? path : "/api/v1" + path, {
    ...init,
    method,
    headers,
    credentials: "include"
  });
  const payload = await readJson(response) as ApiErrorBody & { csrfToken?: string };
  if (!response.ok) throw new ApiClientError(response.status, payload);
  if (typeof payload.csrfToken === "string") csrfToken = payload.csrfToken;
  return payload as T;
}

export function getCurrentUser(): Promise<CurrentUserResponse> {
  return apiRequest<CurrentUserResponse>("/auth/me");
}

export async function signIn(email: string, password: string, tenantSlug?: string): Promise<void> {
  const result = await apiRequest<{ csrfToken: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(tenantSlug ? { tenantSlug } : {}) })
  });
  csrfToken = result.csrfToken;
}

export function signOut(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" });
}
