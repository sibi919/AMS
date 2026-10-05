import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../auth/client";
import { useAuth } from "../auth/context";

export function ResetPasswordPage() {
  const { signOut } = useAuth();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let current = true;
    const client = supabase;
    if (!client) return;
    void client.auth.getSession().then(({ data, error }) => {
      if (current) { setReady(Boolean(data.session) && !error); setLoading(false); }
    }).catch(() => { if (current) { setReady(false); setLoading(false); } });
    return () => { current = false; };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !ready || busy) return;
    if (password !== confirm) { setError("The two passwords must match."); return; }
    setBusy(true); setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(""); setConfirm("");
      await signOut();
      setComplete(true);
    } catch { setError("The password could not be changed. Try a new recovery link or a different password of at least 12 characters."); }
    finally { setBusy(false); }
  }
  return <main className="recovery-page"><section className="portal-card recovery-card">
    <Link to="/" className="portal-brand"><span className="brand-mark"><img src="/brand/joab-ja-mark.png" alt="" /></span> JOAB Academy</Link>
    <h1>Reset your password</h1>
    {loading ? <p role="status">Checking your recovery link…</p> : complete ? <p role="status">Your password has been changed. Sign in with your new password.</p>
      : !ready ? <p role="alert">This recovery link is missing, expired, or has already been used. Request a new link from the sign-in page.</p>
      : <form className="portal-form" onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>
        {error && <p role="alert" className="portal-error">{error}</p>}
        <button className="portal-button" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>}
    <Link className="login-reset" to="/login">Return to sign in</Link>
  </section></main>;
}
