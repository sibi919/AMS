import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { supabase, configError } from "../auth/client";
import { useAuth } from "../auth/context";
import { roleLabels } from "../auth/types";
import type { Role } from "../auth/types";
const icons = { student: GraduationCap, staff: UserRound, admin: ShieldCheck };

// Reports what actually failed. A network, certificate or service-startup
// problem must never be shown as "wrong password".
function describeSignInFailure(cause: unknown, action = "Sign-in"): string {
  const detail = cause as { status?: number; code?: string; message?: string; name?: string };
  const status = typeof detail?.status === "number" ? detail.status : 0;
  const code = detail?.code ?? "";
  const message = detail?.message ?? "";
  const unreachable =
    detail?.name === "AuthRetryableFetchError" ||
    detail?.name === "TypeError" ||
    /failed to fetch|networkerror|load failed|fetch failed|certificate/i.test(message);
  if (unreachable)
    return "Could not reach the academy service. It may still be starting, or the portal address is wrong. Nothing is wrong with your password — check that the application is running and try again.";
  if (code === "invalid_credentials" || (status === 400 && /invalid login/i.test(message)))
    return "Incorrect email or password. Check both, then try again.";
  if (code === "email_not_confirmed")
    return "This account's email is not confirmed yet. Ask the academy to confirm it.";
  if (status === 429 || code === "over_request_rate_limit")
    return "Too many sign-in attempts. Wait a minute and try again.";
  if (status >= 500)
    return `The sign-in service reported an error (${status}). It may still be starting — wait a moment and try again.`;
  return message
    ? `${action} failed: ${message}`
    : `${action} failed for an unknown reason. Try again in a moment.`;
}
export function LoginPage() {
  const { profile, loading, error: accountError, refresh, signOut } = useAuth();
  const [role, setRole] = useState<Role>("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  async function resetPassword() {
    if (!supabase || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter your academy email address first.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    setResetMessage("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (resetError) throw resetError;
      setResetMessage("If this academy email has an account, a recovery link has been sent.");
    } catch (cause) { setError(describeSignInFailure(cause, "Password recovery")); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
      setPassword("");
      if (loginError) {
        setError(describeSignInFailure(loginError));
        return;
      }
      if (!data.user) {
        setError("Sign-in did not return an account. Please try again.");
        return;
      }
      // The role selector is a navigation preference only. DB role is authoritative.
      await refresh();
    } catch (cause) {
      setError(describeSignInFailure(cause));
    } finally {
      setBusy(false);
    }
  }
  if (profile && !loading)
    return <Navigate to={`/portal/${profile.role}`} replace />;
  return (
    <main className="login-page">
      <section className="login-story">
        <Link to="/" className="portal-brand">
          <span className="brand-mark"><img src="/brand/joab-ja-mark.png" alt="" /></span> JOAB Academy
        </Link>
        <div className="login-story-copy">
          <span className="portal-eyebrow">YOUR NEXT CHAPTER</span>
          <h1>
            A place to learn.
            <br />
            <em>A path to grow.</em>
          </h1>
          <p>
            Your academy, classes, and learning journey — together in one place.
          </p>
          <div className="login-seal">
            <ShieldCheck size={24} />
            <span>
              Academy-managed access
              <br />
              <small>For our students, teachers, and administrators.</small>
            </span>
          </div>
        </div>
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to the academy
        </Link>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <span className="portal-eyebrow">ACADEMY PORTAL</span>
          <h2>Welcome back.</h2>
          <p className="portal-muted">
            Choose your portal and sign in to continue.
          </p>
          <div className="role-options" aria-label="Choose your portal">
            {(["student", "staff", "admin"] as Role[]).map((value) => {
              const Icon = icons[value];
              return (
                <button
                  type="button"
                  key={value}
                  aria-pressed={role === value}
                  onClick={() => setRole(value)}
                >
                  <Icon size={21} />
                  <span>{roleLabels[value]}</span>
                </button>
              );
            })}
          </div>
          {!supabase && (
            <div className="portal-notice" role="status">
              <strong>Sign-in is being prepared.</strong>
              <p>
                {configError ||
                  "The academy portal needs its secure connection configured before accounts can sign in."}
              </p>
            </div>
          )}
          <form onSubmit={submit} className="portal-form">
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your academy account email"
                disabled={!supabase || busy}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={!supabase || busy}
              />
            </label>
            {(error || accountError) && (
              <p className="portal-error" role="alert">
                {error || accountError}
              </p>
            )}
            <button
              className="portal-button"
              disabled={!supabase || busy || loading}
            >
              {busy || loading
                ? "Please wait…"
                : `Sign in as ${roleLabels[role]}`}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            type="button"
            className="login-reset"
            onClick={() => void resetPassword()}
            disabled={!supabase || busy}
          >
            Forgot password?
          </button>
          {resetMessage && (
            <p role="status" className="portal-muted">
              {resetMessage}
            </p>
          )}
          {accountError && (
            <div className="portal-actions">
              <button onClick={() => void refresh()}>Retry account</button>
              <button onClick={() => void signOut()}>Clear session</button>
            </div>
          )}
          <p className="login-help">
            Need access or password help? Contact the academy.
            <br />
            Accounts are created by Admin or authorized Staff.
          </p>
          <p className="login-footnote">
            Your account determines which portal you can access.
          </p>
        </div>
      </section>
    </main>
  );
}
