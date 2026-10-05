import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../auth/client";
import { useAuth } from "../auth/context";
import { attendancePercent, eligibilityLabel } from "./learning";
type Batch = { id: string; title: string };
type Summary = { credited: number; required: number; percentage: number; eligibility: string };
type Overview = {
  batches: Batch[]; students: number; staff: number; courses: number;
  lessons: number; assignments: number; submissions: number;
  summaries: Record<string, Summary>;
  upcoming: { id: string; title: string; starts_at: string }[];
};
export function DashboardData() {
  const { profile } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const load = async () => {
      if (!supabase || !profile) return;
      try {
        const b = await supabase.from("batches").select("id,title,courses!inner(active)")
          .eq("active", true).eq("courses.active", true);
        if (b.error) throw b.error;
        const batchIds = (b.data ?? []).map(row => row.id);
        const [p, c, l, a, s, t, v] = await Promise.all([
          supabase.rpc("academy_directory"),
          supabase.from("courses").select("id", {count:"exact",head:true}).eq("active",true),
          supabase.from("lessons").select("id", {count:"exact",head:true}).eq("published",true).in("batch_id",batchIds),
          supabase.from("assignments").select("id", {count:"exact",head:true}).eq("published",true).in("batch_id",batchIds),
          supabase.from("submissions").select("id,assignments!inner(batch_id)", {count:"exact",head:true}).in("assignments.batch_id",batchIds),
          supabase.from("class_schedule").select("id,title,starts_at").eq("published",true).in("batch_id",batchIds).gte("starts_at",new Date().toISOString()).order("starts_at").limit(5),
          supabase.from("live_sessions").select("id,title,starts_at").eq("published",true).in("batch_id",batchIds).gte("starts_at",new Date().toISOString()).order("starts_at").limit(5),
        ]);
        if ([p,c,l,a,s,t,v].some(result => result.error)) throw new Error("Dashboard query failed");
        const summaries: Record<string, Summary> = {};
        if (profile.role === "student") {
          for (const batch of b.data ?? []) {
            const result = await supabase.rpc("attendance_summary", {batch:batch.id,student:profile.id});
            if (result.error) throw result.error;
            summaries[batch.id] = result.data[0];
          }
        }
        if (current) {
          setData({
            batches:b.data ?? [],
            students:(p.data ?? []).filter((row:{role:string;active:boolean}) => row.role === "student" && row.active).length,
            staff:(p.data ?? []).filter((row:{role:string;active:boolean}) => row.role === "staff" && row.active).length,
            courses:c.count ?? 0, lessons:l.count ?? 0, assignments:a.count ?? 0, submissions:s.count ?? 0,
            summaries, upcoming:[...(t.data ?? []),...(v.data ?? [])].sort((a,b) => a.starts_at.localeCompare(b.starts_at)).slice(0,5),
          });
          setError("");
        }
      } catch {
        if (current) setError("Dashboard records could not be loaded. Refresh to retry.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { current = false; window.clearInterval(timer); };
  }, [profile]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading your Academy overview…</p>;
  return <section className="portal-card">
    <h2>{profile?.role === "student" ? "My learning and progress" : "Academy overview"}</h2>
    <div className="portal-summary">
      <div><span>Active courses</span><strong>{data.courses}</strong></div>
      <div><span>Authorized active batches</span><strong>{data.batches.length}</strong></div>
      <div><span>Published lessons</span><strong>{data.lessons}</strong></div>
      {profile?.role !== "student" && <>
        <div><span>Students</span><strong>{data.students}</strong></div>
        <div><span>Staff</span><strong>{data.staff}</strong></div>
      </>}
    </div>
    {data.batches.map(batch => <div key={batch.id} className="academy-report">
      <strong>{batch.title}</strong>
      {data.summaries[batch.id] && <span>
        {data.summaries[batch.id].credited} / {data.summaries[batch.id].required} sessions Present · {attendancePercent(data.summaries[batch.id].percentage)}% · {eligibilityLabel(data.summaries[batch.id].eligibility)}
      </span>}
    </div>)}
    <p>Assignment progress: {data.submissions} submissions · {data.assignments} published assignments. Assignment progress is separate from attendance.</p>
    <h3>Upcoming classes</h3>
    {data.upcoming.length ? data.upcoming.map(item => <p key={item.id}>{item.title} · {new Date(item.starts_at).toLocaleString()}</p>) : <p>No upcoming published classes.</p>}
    <Link to="academy?tab=sessions">Open class sessions</Link>
  </section>;
}
