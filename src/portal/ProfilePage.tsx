import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../auth/client";
import { useAuth } from "../auth/context";
import { roleLabels } from "../auth/types";
export function ProfilePage() {
  const { profile, refresh } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [batches,setBatches]=useState<string[]>([]);
  useEffect(()=>{let current=true;if(supabase)void Promise.all([supabase.from('batches').select('title,course_id'),supabase.from('courses').select('id,title')]).then(([b,c])=>{if(current)setBatches((b.data??[]).map(batch=>`${c.data?.find(course=>course.id===batch.course_id)?.title??'Course'} / ${batch.title}`));});return()=>{current=false;};},[profile?.id]);
  useEffect(() => {
    let current = true;
    if (profile?.avatar_path && supabase)
      void supabase.storage
        .from("profile-photos")
        .createSignedUrl(profile.avatar_path, 300)
        .then(({ data }) => {
          if (current) setPhotoUrl(data?.signedUrl ?? "");
        });
    return () => {
      current = false;
    };
  }, [profile?.avatar_path]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !profile) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      let avatarPath = profile.avatar_path;
      if (photo) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(photo.type) ||
          photo.size > 2097152
        )
          throw new Error("Use a JPG, PNG, or WebP photo up to 2 MB.");
        avatarPath = `${profile.id}/avatar`;
        const { error: uploadError } = await supabase.storage
          .from("profile-photos")
          .upload(avatarPath, photo, { upsert: true, contentType: photo.type });
        if (uploadError)
          throw new Error("Photo upload failed. Please try again.");
      }
      const { data, error: saveError } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          avatar_path: avatarPath,
        })
        .eq("id", profile.id)
        .select("id")
        .single();
      if (saveError || !data)
        throw new Error("Profile could not be saved. Please retry.");
      if (avatarPath) {
        const { data: signedPhoto } = await supabase.storage
          .from("profile-photos")
          .createSignedUrl(avatarPath, 300);
        setPhotoUrl(signedPhoto?.signedUrl ?? "");
      }
      setPhoto(null);
      setMessage("Profile saved.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save profile.");
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setPassword("");
      setMessage("Password updated.");
    } catch {
      setError(
        "Password could not be changed. Use at least 12 characters, or sign in again and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!profile) return null;
  const completion=Math.round([profile.full_name,profile.phone,profile.address,profile.avatar_path,profile.account_code,profile.role==='student'?batches.length:true].filter(Boolean).length/6*100);
  return (
    <>
      <div className="page-heading">
        <span className="portal-eyebrow">YOUR ACCOUNT</span>
        <h1>My profile</h1>
        <p className="portal-muted">Keep your personal details up to date.</p>
      </div>
      <div className="profile-grid">
        <section className="portal-card">
          <h2>Personal details</h2>
          <p>Profile completion: {completion}%</p><progress aria-label="Profile completion" value={completion} max={100}/>
          <form className="portal-form" onSubmit={save}>
            {photoUrl && (
              <img
                className="profile-photo"
                src={photoUrl}
                alt="Your profile"
              />
            )}
            <label>
              Profile photo
              <input
                aria-label="Profile photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              <small>
                JPG, PNG, or WebP · up to 2 MB · private to your account
              </small>
            </label>
            <label>
              Full name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </label>
            <label>
              Address
              <textarea
                maxLength={1000}
                rows={4}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
              />
            </label>
            <button className="portal-button" disabled={busy}>
              Save profile
            </button>
          </form>
        </section>
        <div>
          <section className="portal-card">
            <h2>JOAB Academy · {profile.role==='student'?'Student ID':'Academy details'}</h2>
            <p className="portal-muted">Managed by the academy.</p>
            <dl className="account-details">
              <dt>Account ID</dt>
              <dd>{profile.account_code}</dd>
              <dt>Role</dt>
              <dd>{roleLabels[profile.role]}</dd>
              <dt>Course / batch</dt>
              <dd>{profile.course_label || "Awaiting assignment"}</dd>
              <dt>Enrolled / assigned batches</dt><dd>{batches.join(', ')||'Awaiting enrollment'}</dd>
            </dl>
          </section>
          <section className="portal-card password-card">
            <h2>Change password</h2>
            <form className="portal-form" onSubmit={changePassword}>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <small>Use at least 12 characters.</small>
              </label>
              <button className="portal-button secondary" disabled={busy}>
                Update password
              </button>
            </form>
          </section>
        </div>
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
    </>
  );
}
