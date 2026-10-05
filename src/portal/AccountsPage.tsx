import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../auth/client";
import { useAuth } from "../auth/context";
import { canCreateAccounts, roleLabels } from "../auth/types";
import type { Profile, Role } from "../auth/types";
export function AccountsPage() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [batches, setBatches] = useState<{id:string;title:string}[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>("student");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [active, setActive] = useState(true);
  const [permission, setPermission] = useState(false);
  const [staff, setStaff] = useState("");
  const [course, setCourse] = useState("");
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const all: Profile[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: readError } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + 499);
        if (readError) throw readError;
        const page = (data ?? []) as Profile[];
        all.push(...page);
        if (page.length < 500) break;
      }
      setAccounts(all);
      const {data:batchRows}=await supabase.from('batches').select('id,title,courses!inner(active)').eq('active',true).eq('courses.active',true);
      setBatches(batchRows??[]);
    } catch {
      setError("Accounts could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  // Initial directory data comes from the remote database.
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data, error: createError } = await supabase.functions.invoke(
        "create-account",
        {
          body: {
            email: fields.get("email"),
            password: fields.get("password"),
            fullName: fields.get("name"),
            accountCode: fields.get("code"),
            role,
            courseLabel: fields.get("course") ?? "",
            assignedStaffId: fields.get("assigned") || null,
            batchId: role === 'student' ? fields.get('batch') || null : null,
          },
        },
      );
      if (createError) {
        let reason =
          "Unable to create the account. Check details and permissions, then retry.";
        if (createError.context instanceof Response) {
          try {
            const body = await createError.context.json();
            if (typeof body.message === "string") reason = body.message;
          } catch {
            /* generic message */
          }
        }
        throw new Error(reason);
      }
      form.reset();
      setRole("student");
      setMessage(data.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account service unavailable.");
    } finally {
      setBusy(false);
    }
  }
  function edit(account: Profile) {
    setSelected(account);
    setActive(account.active);
    setPermission(account.can_create_students);
    setStaff(account.assigned_staff_id ?? "");
    setCourse(account.course_label);
    setError("");
    setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: saveError } = await supabase.rpc("admin_update_account", {
        target_id: selected.id,
        is_active: active,
        allow_student_creation: permission,
        staff_id: staff || null,
        course,
      });
      if (saveError) throw saveError;
      setSelected(null);
      setMessage("Account permissions updated.");
      await load();
    } catch {
      setError(
        "Account update failed. Check the staff assignment and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!profile) return null;
  const staffOptions = accounts.filter(
    (account) => account.role === "staff" && account.active,
  );
  return (
    <>
      <div className="page-heading">
        <span className="portal-eyebrow">ACADEMY ACCESS</span>
        <h1>Accounts</h1>
        <p className="portal-muted">
          {profile.role === "admin"
            ? "Manage accounts, assignments, and staff permissions."
            : "Your account and the students assigned to you or created by you."}
        </p>
      </div>
      {error && (
        <p role="alert" className="portal-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="portal-success">
          {message}
        </p>
      )}
      {canCreateAccounts(profile) && (
        <section className="portal-card">
          <h2>Create an account</h2>
          <p className="portal-muted">
            Use an email belonging to the account holder. Share the initial
            password privately; they can change it after sign-in.
          </p>
          <form className="portal-form account-form" onSubmit={create}>
            <label>
              Full name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Account ID
              <input
                aria-label="Account ID"
                aria-describedby="account-code-help"
                name="code"
                required
                pattern="[A-Z0-9][A-Z0-9_-]{2,31}"
                maxLength={32}
                placeholder="e.g. JOAB_001"
              />
              <small id="account-code-help">
                3–32 uppercase letters, numbers, underscores, or hyphens.
              </small>
            </label>
            <label>
              Email
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Initial password
              <input
                aria-label="Initial password"
                aria-describedby="account-password-help"
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
              <small id="account-password-help">At least 12 characters.</small>
            </label>
            <label>
              Role
              <select
                aria-label="Role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {(profile.role === "admin"
                  ? (["student", "staff", "admin"] as Role[])
                  : (["student"] as Role[])
                ).map((value) => (
                  <option key={value} value={value}>
                    {roleLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Course / batch
              <input
                name="course"
                maxLength={160}
                placeholder="Optional academy assignment"
              />
            </label>
            {role === 'student' && <label>Enroll in batch<select name="batch" required><option value="">Choose batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select><small>This grants learning access. The optional course label alone does not enroll a student.</small></label>}
            {profile.role === "admin" && role === "student" && (
              <label>
                Assigned staff
                <select name="assigned">
                  <option value="">Assign later</option>
                  {staffOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} · {person.account_code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-action">
              <button className="portal-button" disabled={busy || loading}>
                {busy ? "Please wait…" : "Create account"}
              </button>
            </div>
          </form>
        </section>
      )}
      {selected && (
        <section className="portal-card edit-account">
          <h2>Manage {selected.account_code}</h2>
          <form className="portal-form" onSubmit={save}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={active}
                disabled={selected.id === profile.id}
                onChange={(e) => setActive(e.target.checked)}
              />
              Account active
            </label>
            {selected.role === "staff" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={permission}
                  onChange={(e) => setPermission(e.target.checked)}
                />
                Allow creating Student accounts
              </label>
            )}
            <label>
              Course / batch
              <input
                value={course}
                maxLength={160}
                onChange={(e) => setCourse(e.target.value)}
              />
            </label>
            {selected.role === "student" && (
              <label>
                Assigned staff
                <select
                  value={staff}
                  onChange={(e) => setStaff(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staffOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} · {person.account_code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="portal-actions">
              <button className="portal-button" disabled={busy}>
                Save account
              </button>
              <button type="button" onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      <div className="section-title">
        <h2>Account directory</h2>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>
      {loading ? (
        <p role="status">Loading accounts…</p>
      ) : (
        <div className="account-list">
          {accounts.map((account) => (
            <article className="account-row" key={account.id}>
              <div>
                <strong>{account.full_name}</strong>
                <small>
                  {account.account_code} · {roleLabels[account.role]} ·{" "}
                  {account.active ? "Active" : "Disabled"}
                </small>
              </div>
              {profile.role === "admin" && (
                <button
                  className="portal-button secondary"
                  onClick={() => edit(account)}
                >
                  Manage<span className="sr-only"> {account.account_code}</span>
                </button>
              )}
            </article>
          ))}
          {!accounts.length && <p>No accounts available.</p>}
        </div>
      )}
      <p className="portal-muted phase-note">
        All accounts you are permitted to view are loaded in pages.
        Account changes are recorded in the Admin audit history.
      </p>
    </>
  );
}
