import { useState, type FormEvent } from "react";
import { ApiClientError, signIn } from "../../lib/api";
import "./auth-screen.css";

type Workspace = { name: string; slug: string };

type Props = {
  onSignedIn: () => Promise<void>;
  onOpenPaperDemo: () => void;
};

export default function AuthScreen({ onSignedIn, onOpenPaperDemo }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password, tenantSlug || undefined);
      await onSignedIn();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "TENANT_SELECTION_REQUIRED") {
        setWorkspaces(cause.workspaces);
        setTenantSlug(cause.workspaces[0]?.slug || "");
        setError("This account belongs to more than one institute. Select a workspace and sign in again.");
      } else {
        setError(cause instanceof Error ? cause.message : "Sign in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="auth-brand-mark">C</span>
          <div><strong>Coaching Pro</strong><span>INSTITUTE WORKSPACE</span></div>
        </div>
        <div className="auth-intro">
          <span className="auth-eyebrow">SECURE INSTITUTE ACCESS</span>
          <h1 id="auth-title">Welcome back</h1>
          <p>Sign in to manage your institute, students and academic operations.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@institute.com" required maxLength={254} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required maxLength={1024} />
          </label>
          {workspaces.length > 0 && (
            <label>
              Institute workspace
              <select value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} required>
                {workspaces.map((workspace) => <option value={workspace.slug} key={workspace.slug}>{workspace.name}</option>)}
              </select>
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to workspace"}
          </button>
        </form>
        <div className="auth-demo-divider"><span>OR</span></div>
        <button type="button" className="auth-demo-action" onClick={onOpenPaperDemo}>
          Open Paper Builder with dummy data
        </button>
        <p className="auth-demo-note">Local Paper demo only. No Paper API or institute login is required; data stays in this browser.</p>
        <p className="auth-footnote">Access is protected by institute membership and role permissions.</p>
      </section>
    </main>
  );
}
