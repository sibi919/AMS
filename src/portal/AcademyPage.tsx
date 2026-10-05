import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import { supabase } from "../auth/client";
import { useAuth } from "../auth/context";
import type { Profile } from "../auth/types";
import { VideoPlayer } from "./VideoPlayer";
import { ClassSessions, SessionSelect, type ClassSession } from "./ClassSessions";
import { SessionAttendance, PlaybackEvidence, type Attendance } from "./SessionAttendance";
import { localDateTime, duration, attendancePercent, eligibilityLabel, httpsLink, youtubeId } from "./learning";

type Tab =
  | "sessions"
  | "classes"
  | "timetable"
  | "attendance"
  | "live"
  | "work"
  | "doubts"
  | "updates"
  | "manage"
  | "reports";
type Row = { id: string; [key: string]: unknown };
type Lesson = Row & {
  batch_id: string;
  title: string;
  youtube_id: string;
  duration_seconds: number;
  published: boolean;
};
type Batch = Row & {
  title: string;
  course_id: string;
  staff_id: string | null;
};
type Assignment = Row & {
  batch_id: string;
  title: string;
  instructions: string;
  due_at: string | null;
  published: boolean;
};
type Message = Row & {
  body: string;
  sender_id?: string;
  author_id?: string;
  student_id?: string;
  staff_id?: string;
  created_at: string;
};
type Summary = {
  credited: number;
  required: number;
  percentage: number;
  eligibility: string;
};
const tabs: { id: Tab; title: string }[] = [
  { id: "sessions", title: "Class sessions" },
  { id: "classes", title: "Recorded classes" },
  { id: "timetable", title: "Timetable" },
  { id: "attendance", title: "Attendance" },
  { id: "live", title: "Live classes" },
  { id: "work", title: "Assignments & notes" },
  { id: "doubts", title: "Questions" },
  { id: "updates", title: "Updates" },
  { id: "manage", title: "Courses & batches" },
  { id: "reports", title: "Reports" },
];
function field(row: Row, key: string) {
  return String(row[key] ?? "");
}
function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "No deadline";
}
function errorText(e: unknown) {
  const message = e instanceof Error ? e.message : "";
  if (/syntax|constraint|column|relation|uuid|permission denied|schema/i.test(message)) return "This change could not be saved. Check your selections and access, then retry.";
  return message || "Please try again.";
}
export function AcademyPage() {
  const { profile } = useAuth();
  const [search, setSearch] = useSearchParams();
  const requestedTab = search.get("tab");
  const tab: Tab = tabs.some((item) => item.id === requestedTab && (profile?.role !== "student" || !["manage", "reports"].includes(item.id)))
    ? (requestedTab as Tab)
    : "classes";
  const setTab = (next: Tab) => { setEditing(null); setScheduleEdit(null); setSearch({ tab: next }); };
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedLesson, setSelectedLesson] = useState("");
  const [showArchived,setShowArchived]=useState(false);
  const [attendanceSession,setAttendanceSession]=useState("");
  const [cardEvidence,setCardEvidence]=useState<Attendance[]>([]);
  const [doubtStudent, setDoubtStudent] = useState("");
  const [scheduleEdit, setScheduleEdit] = useState<Row | null>(null);
  const [editing, setEditing] = useState<{
    kind: "lesson" | "live" | "assignment" | "note";
    row: Row;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const loadRevision = useRef(0);
  const mutationPending = useRef(false);
  const load = useCallback(async () => {
    if (!supabase || !profile) return;
    const revision = ++loadRevision.current;
    setLoading(true);
    try {
      const readRows = async (name: string, filter?: {column: string; value: string | string[]}) => {
        const records: Row[] = [];
        if (filter && Array.isArray(filter.value) && !filter.value.length) return records;
        for (let offset=0; ; offset+=500) {
          let query=supabase!.from(name).select("*");
          if (filter) query=Array.isArray(filter.value) ? query.in(filter.column,filter.value) : query.eq(filter.column,filter.value);
          if(["class_comments","doubt_messages","notifications","watch_sessions"].includes(name)) query=query.order(name==="watch_sessions" ? "started_at" : "created_at",{ascending:!["notifications","watch_sessions"].includes(name)});
          if(["class_schedule","live_sessions"].includes(name)) query=query.order("starts_at",{ascending:true});
          query=query.order(name === "watch_credit" ? "lesson_id" : "id",{ascending:true});
          if (name === "watch_credit") query=query.order("student_id",{ascending:true});
          const {data,error}=await query.range(offset,offset+499);
          if (error) throw new Error(`Could not load ${name.replaceAll("_"," ")}. Refresh to retry.`);
          const page=(data??[]) as Row[]; records.push(...page);
          if (page.length<500) return records;
        }
      };
      const [allCourses,allBatches]=await Promise.all([readRows("courses"),readRows("batches")]);
      const courses=allCourses.filter(c=>showArchived||c.active!==false);
      const batches=allBatches.filter(b=>(showArchived||b.active!==false&&courses.some(c=>c.id===b.course_id))&&(!selectedCourse||b.course_id===selectedCourse));
      const batch=batches.some((b)=>b.id===selectedBatch) ? selectedBatch : batches[0]?.id ?? "";
      const next: Record<string,Row[]>={courses,batches};
      next.class_sessions=batch ? await readRows("class_sessions",{column:"batch_id",value:batch}) : [];
      next.enrollments=batch ? await readRows("enrollments",{column:"batch_id",value:batch}) : [];
      const names: Record<Tab,string[]>={
        sessions:["lessons","live_sessions","class_schedule"], classes:["lessons"], timetable:["class_schedule"],
        attendance:["lessons","assignments"], live:["lessons","live_sessions"],
        work:["assignments","notes"], doubts:["doubt_messages"], updates:["notifications"],
        manage:[], reports:["lessons","assignments"],
      };
      await Promise.all(names[tab].map(async(name)=>{
        next[name]=["doubt_messages","notifications"].includes(name) ? await readRows(name)
          : batch ? await readRows(name,{column:"batch_id",value:batch}) : [];
      }));
      const lessonIds=(next.lessons??[]).map((l)=>l.id);
      const assignmentIds=(next.assignments??[]).map((a)=>a.id);
      await Promise.all([
        ...(["classes","attendance","reports"].includes(tab) ? [readRows("watch_credit",{column:"lesson_id",value:lessonIds}).then(data=>{next.watch_credit=data;})] : []),
        ...(tab==="classes" ? [readRows("class_comments",{column:"lesson_id",value:lessonIds}).then(data=>{next.class_comments=data;})] : []),
        ...(tab==="attendance" ? [readRows("watch_sessions",{column:"lesson_id",value:lessonIds}).then(data=>{next.watch_sessions=data;})] : []),
        ...(["work","attendance","reports"].includes(tab) ? [readRows("submissions",{column:"assignment_id",value:assignmentIds}).then(data=>{next.submissions=data;})] : []),
      ]);
      const people: Profile[]=[];
      for (let offset=0; ; offset+=500) {
        const {data,error}=await supabase.rpc("academy_directory").range(offset,offset+499);
        if (error) throw new Error("Participant names could not be loaded. Refresh to retry.");
        const page=(data??[]) as Profile[]; people.push(...page); if(page.length<500) break;
      }
      if(revision===loadRevision.current) {setRows(next);setAccounts(people);}
    } catch(e) {
      if(revision===loadRevision.current) {setRows({});setAccounts([]);setError(errorText(e));}
    } finally {if(revision===loadRevision.current) setLoading(false);}
  },[profile,selectedBatch,selectedCourse,tab,showArchived]);
  useEffect(()=>{
    const generation=loadRevision;
    const start=window.setTimeout(()=>void load(),0);
    const timer=window.setInterval(()=>{
      if(document.visibilityState==="visible" && !mutationPending.current && !editing && !scheduleEdit && ["classes","timetable","live","attendance","doubts","updates"].includes(tab)) void load();
    },15000);
    return ()=>{++generation.current;window.clearTimeout(start);window.clearInterval(timer);};
  },[load,tab,editing,scheduleEdit]);
  const list = (name: string) => rows[name] ?? [];
  const batches = list("batches") as Batch[];
  const lessons = (list("lessons") as Lesson[]).filter(l=>profile?.role!=="student" || l.published && batches.some(b=>b.id===l.batch_id&&b.active!==false) && list("class_sessions").some(s=>s.id===l.class_session_id&&s.batch_id===l.batch_id&&s.published&&!s.archived));
  const assignments = list("assignments") as Assignment[];
  const chosenBatch = batches.some((b)=>b.id===selectedBatch) ? selectedBatch : batches[0]?.id || "";
  const chosenLesson =
    (lessons.some((l)=>l.id===selectedLesson&&l.batch_id===chosenBatch) ? selectedLesson : "") || "";
  const chosenStudent =
    profile?.role === "student"
      ? profile.id
      : (accounts.some(a=>a.id===doubtStudent&&a.role==="student"&&a.active&&a.assigned_staff_id===profile?.id) ? doubtStudent : "") ||
        accounts.find(
          (a) => a.role === "student" && a.active && a.assigned_staff_id === profile?.id,
        )?.id ||
        "";
  useEffect(() => {
    if (!supabase || !profile || !chosenBatch || !["classes","attendance","reports"].includes(tab)) return;
    let current=true;
    // Clear the previous batch while synchronizing a new server attendance result.
    // eslint-disable-next-line react/set-state-in-effect
    setSummaries({});
    const pupils=profile.role==="student" ? [profile.id] : (rows.enrollments??[]).map((e)=>String(e.student_id));
    void Promise.all(pupils.map(async(student)=>{
      const {data,error}=await supabase!.rpc("attendance_summary",{batch:chosenBatch,student});
      if(error) throw new Error("Attendance could not be loaded. Refresh to retry.");
      return [student,data?.[0]] as const;
    })).then(entries=>{if(current) setSummaries(Object.fromEntries(entries.filter(e=>e[1])) as Record<string,Summary>);})
      .catch(e=>{if(current) setError(errorText(e));});
    return ()=>{current=false;};
  },[chosenBatch,profile,rows.enrollments,rows.watch_credit,tab]);
  useEffect(()=>{
    let current=true;
    if(tab!=="classes"||profile?.role!=="student"||!chosenBatch)return;
    const refresh=async()=>{const {data,error}=await supabase!.rpc('attendance_evidence',{batch:chosenBatch,student:profile.id});if(current&&!error)setCardEvidence(data??[]);};
    void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>{current=false;clearInterval(timer);};
  },[chosenBatch,profile,tab]);
  async function run(
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) {
    if(mutationPending.current) return false;
    mutationPending.current=true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      setNotice(success);
      await load();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      mutationPending.current=false;
      setBusy(false);
    }
  }
  function manage(event: FormEvent<HTMLFormElement>, kind: string) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const f = new FormData(form);
    const title = String(f.get("title") ?? "").trim();
    const body = String(f.get("body") ?? "").trim();
    const video =
      kind === "lesson" || kind === "live"
        ? youtubeId(String(f.get("video") ?? ""))
        : kind === "batch"
          ? String(f.get("staff") ?? "")
          : "";
    if ((kind === "lesson" || kind === "live") && !video) {
      setError("Enter a valid YouTube video ID or URL.");
      return;
    }
    const batch = kind === "batch" ? String(f.get("course") ?? "") : editing?.kind === kind ? String(editing.row.batch_id) : chosenBatch;
    void run(
      () =>
        supabase!.rpc(kind === "lesson" || kind === "live" ? "academy_manage_session" : "academy_manage", {
          ...(kind === "lesson" || kind === "live" ? {class_session: String(f.get("class_session") ?? editing?.row.class_session_id ?? "") || null} : {}),
          kind,
          target: String(f.get("target") ?? "") || null,
          batch: batch || null,
          title,
          body,
          video_id: video || null,
          seconds: kind === "lesson" ? Number(f.get("seconds")) : null,
          publish: f.get("published") === "on",
          starts: f.get("starts")
            ? new Date(String(f.get("starts"))).toISOString()
            : null,
        }),
      `${kind} saved.`,
    ).then((saved) => {
      if(saved) { form.reset(); setEditing(null); }
    });
  }
  function simplePost(
    event: FormEvent<HTMLFormElement>,
    kind: "comment" | "doubt",
    lessonId?: string,
  ) {
    event.preventDefault();
    if (!supabase || !profile) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    void run(
      () =>
        supabase!.rpc("academy_post", {
          kind,
          target: kind === "comment" ? (lessonId ?? chosenLesson) : null,
          student: kind === "doubt" ? chosenStudent : null,
          body,
        }),
      "Message posted.",
    ).then((saved) => { if(saved) form.reset(); });
  }
  if (!profile) return null;
  const teacher = profile.role !== "student";
  const sessions = list("class_sessions") as unknown as ClassSession[];
  const students = accounts.filter(
    (a) =>
      a.role === "student" &&
      a.active &&
      (profile.role === "admin" || a.assigned_staff_id === profile.id),
  );
  const batchLabel = (id: string) =>
    batches.find((b) => b.id === id)?.title ?? "Batch";
  return (
    <>
      <div className="page-heading">
        <span className="portal-eyebrow">ACADEMY LEARNING SPACE</span>
        <h1>Academy</h1>
        <p className="portal-muted">
          Classes, support and progress in one place.
        </p>
      </div>
      {error && (
        <p role="alert" className="portal-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="portal-success">
          {notice}
        </p>
      )}
      <div
        className="academy-tabs"
        role="tablist"
        aria-label="Academy sections"
      >
        {tabs
          .filter((t) => teacher || !["manage", "reports"].includes(t.id))
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`academy-tab-${t.id}`}
              aria-controls="academy-panel"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => {
                const visible = tabs.filter((item) => teacher || !["manage", "reports"].includes(item.id));
                const index = visible.findIndex((item) => item.id === t.id);
                const next = event.key === "ArrowRight" ? (index + 1) % visible.length : event.key === "ArrowLeft" ? (index + visible.length - 1) % visible.length : event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : -1;
                if (next >= 0) { event.preventDefault(); setTab(visible[next].id); document.getElementById(`academy-tab-${visible[next].id}`)?.focus(); }
              }}
            >
              {t.title}
            </button>
          ))}
      </div>
      <section id="academy-panel" role="tabpanel" aria-labelledby={`academy-tab-${tab}`}>
      <div className="academy-toolbar"><button type="button" onClick={()=>{setError("");void load();}} disabled={loading || busy}>Refresh records</button>{loading && <span role="status">Loading academy records…</span>}</div>
      {!loading && !batches.length && <p role="status" className="portal-muted">No active batch is assigned to you. Ask an administrator to check your batch enrollment and whether its course is active. A course label on your account does not enroll you in a batch.</p>}
      {teacher && chosenBatch && <p className="portal-muted">{list("enrollments").length} enrolled students in this batch. Only enrolled students can see published content.</p>}
      {teacher && chosenBatch && (batches.find(b => b.id === chosenBatch)?.active === false || list("courses").find(c => c.id === batches.find(b => b.id === chosenBatch)?.course_id)?.active === false) && <p role="alert" className="portal-error">This batch or its course is archived. Published lessons are hidden from students. Restore it in Courses &amp; batches before teaching resumes.</p>}
      <label className="academy-filter">Course<select aria-label="Course filter" value={selectedCourse} onChange={e=>{setSelectedCourse(e.target.value);setSelectedBatch("");setEditing(null);setScheduleEdit(null);}}><option value="">All authorized courses</option>{list("courses").map(c=><option key={c.id} value={c.id}>{field(c,"title")}</option>)}</select></label>
      {batches.length > 0 && (
        <label className="academy-filter">
          Batch{" "}
          <select
            value={chosenBatch}
            onChange={(e) => {
              setSelectedBatch(e.target.value);
              setSelectedLesson(""); setEditing(null); setScheduleEdit(null);
            }}
            aria-label="Batch"
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {tab === "sessions" && <ClassSessions key={chosenBatch} batch={chosenBatch} teacher={teacher} admin={profile.role==="admin"} onSaved={()=>void load()}/>}
      {tab === "timetable" && (
        <section className="portal-card">
          <h2>Class timetable</h2>
          {list("class_schedule")
            .filter((item) => item.batch_id === chosenBatch)
            .map((item) => (
              <article className="academy-report" key={item.id}>
                <div>
                  <strong>{field(item, "title")}</strong>
                  <p>
                    {date(item.starts_at)} – {date(item.ends_at)}
                  </p>
                  <small>{item.published ? "Published" : "Draft"}</small>
                </div>
                {Boolean(httpsLink(item.meeting_url)) && (
                  <a
                    href={httpsLink(item.meeting_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Join class ↗
                  </a>
                )}
                {teacher && <button disabled={busy} onClick={()=>{if(window.confirm("Delete this timetable entry? Attendance history is preserved."))void run(()=>supabase!.rpc("academy_schedule_delete",{target:item.id}),"Timetable entry deleted.");}}>Delete timetable entry</button>}
                {teacher && (
                  <button
                    onClick={() =>
                      setScheduleEdit(
                        scheduleEdit?.id === item.id ? null : item,
                      )
                    }
                  >
                    Edit
                  </button>
                )}
              </article>
            ))}
          {teacher && scheduleEdit && (
            <form
              className="portal-form"
              key={scheduleEdit?.id ?? "new-schedule"}
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void run(
                  () =>
                    supabase!.rpc("academy_schedule_session", {
                      target: scheduleEdit.id,
                      class_session: String(f.get("class_session")??"") || null,
                      batch: chosenBatch,
                      title: String(f.get("title")),
                      meeting_url: String(f.get("url")),
                      starts: new Date(String(f.get("starts"))).toISOString(),
                      ends: new Date(String(f.get("ends"))).toISOString(),
                      publish: f.get("published") === "on",
                    }),
                  "Class updated.",
                ).then((saved) => { if(saved) setScheduleEdit(null); });
              }}
            >
              <h3>Edit class</h3>
              <SessionSelect sessions={sessions} value={String(scheduleEdit.class_session_id??"")}/>
              <label>
                Title
                <input
                  name="title"
                  required
                  defaultValue={field(scheduleEdit, "title")}
                />
              </label>
              <label>
                Class link
                <input
                  name="url"
                  type="url"
                  defaultValue={field(scheduleEdit, "meeting_url")}
                />
              </label>
              <label>
                Starts
                <input
                  name="starts"
                  type="datetime-local"
                  required
                  defaultValue={localDateTime(scheduleEdit.starts_at)}
                />
              </label>
              <label>
                Ends
                <input
                  name="ends"
                  type="datetime-local"
                  required
                  defaultValue={localDateTime(scheduleEdit.ends_at)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  name="published"
                  type="checkbox"
                  defaultChecked={Boolean(scheduleEdit.published)}
                />{" "}
                Published
              </label>
              <button disabled={busy}>Save changes</button>
            </form>
          )}
          {!list("class_schedule").some(
            (item) => item.batch_id === chosenBatch,
          ) && <p className="portal-muted">No classes scheduled yet.</p>}
          {teacher && chosenBatch && (
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const f = new FormData(form);
                void run(
                  () =>
                    supabase!.rpc("academy_schedule_session", {
                      target: null,
                      class_session: String(f.get("class_session")??"") || null,
                      batch: chosenBatch,
                      title: String(f.get("title")),
                      meeting_url: String(f.get("url")),
                      starts: new Date(String(f.get("starts"))).toISOString(),
                      ends: new Date(String(f.get("ends"))).toISOString(),
                      publish: f.get("published") === "on",
                    }),
                  "Class scheduled.",
                ).then((saved) => { if(saved) form.reset(); });
              }}
            >
              <h3>Schedule class</h3>
              <SessionSelect sessions={sessions}/>
              <label>
                Title
                <input name="title" required minLength={2} />
              </label>
              <label>
                Optional HTTPS class link
                <input name="url" type="url" />
              </label>
              <label>
                Starts
                <input name="starts" type="datetime-local" required />
              </label>
              <label>
                Ends
                <input name="ends" type="datetime-local" required />
              </label>
              <label className="checkbox-label">
                <input name="published" type="checkbox" /> Publish to students
              </label>
              <button className="portal-button" disabled={busy}>
                Save class
              </button>
            </form>
          )}
        </section>
      )}
      {tab === "attendance" && chosenBatch && <section><h2>Student attendance and eligibility</h2>{teacher&&<label>Class Session<select value={attendanceSession} onChange={e=>setAttendanceSession(e.target.value)}><option value="">All sessions</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
        {(teacher ? list("enrollments").map(e=>String(e.student_id)) : [profile.id]).map(id=><div key={id}>
          <h3>{accounts.find(a=>a.id===id)?.full_name ?? profile.full_name} · {accounts.find(a=>a.id===id)?.account_code ?? profile.account_code}</h3>
          <SessionAttendance key={chosenBatch+id} batch={chosenBatch} student={id} teacher={teacher} admin={profile.role==="admin"} session={attendanceSession}/>
        </div>)}
      </section>}
      {teacher && editing && (
        <section className="portal-card academy-editor">
          <h2>Edit {editing.kind}</h2>
          <form
            className="portal-form"
            key={editing.row.id}
            onSubmit={(event) => manage(event, editing.kind)}
          >
            <input type="hidden" name="target" value={String(editing.row.id)} />
            {(editing.kind === "lesson" || editing.kind === "live") && <SessionSelect sessions={sessions} value={String(editing.row.class_session_id??"")}/> }
            <label>
              Title
              <input
                name="title"
                required
                minLength={2}
                defaultValue={field(editing.row, "title")}
              />
            </label>
            {(editing.kind === "lesson" || editing.kind === "live") && (
              <label>
                YouTube URL or ID
                <input
                  name="video"
                  required
                  defaultValue={field(editing.row, "youtube_id")}
                />
              </label>
            )}
            {editing.kind === "lesson" && (
              <label>
                Duration in seconds
                <input
                  name="seconds"
                  type="number"
                  min={60}
                  max={21600}
                  required
                  defaultValue={field(editing.row, "duration_seconds")}
                />
              </label>
            )}
            {(editing.kind === "assignment" || editing.kind === "note") && (
              <label>
                {editing.kind === "note" ? "Content" : "Instructions"}
                <textarea
                  name="body"
                  required={editing.kind === "note"}
                  defaultValue={field(
                    editing.row,
                    editing.kind === "note" ? "body" : "instructions",
                  )}
                />
              </label>
            )}
            {(editing.kind === "assignment" || editing.kind === "live") && (
              <label>
                {editing.kind === "live" ? "Starts at" : "Due at"}
                <input
                  name="starts"
                  type="datetime-local"
                  required={editing.kind === "live"}
                  defaultValue={localDateTime(editing.row[editing.kind === "live" ? "starts_at" : "due_at"])}
                />
              </label>
            )}
            <label className="checkbox-label">
              <input
                name="published"
                type="checkbox"
                defaultChecked={Boolean(editing.row.published)}
              />{" "}
              Published
            </label>
            <div className="academy-inline-form">
              <button disabled={busy} className="portal-button">
                Save changes
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {tab === "classes" && (
        <>
          <div className="section-title">
            <h2>Recorded lessons</h2>
          </div>
          {!lessons.filter((l) => l.batch_id === chosenBatch).length && (
            <p className="portal-muted">
              No published lessons in this batch yet.
            </p>
          )}
          <div className="recorded-list">{lessons.filter(l=>l.batch_id===chosenBatch).map(l=><button className="recorded-card" key={l.id} onClick={()=>setSelectedLesson(l.id)} aria-label={`Play ${l.title}`}><img src={`https://i.ytimg.com/vi/${l.youtube_id}/hqdefault.jpg`} alt="" loading="lazy"/><span><strong>{l.title}</strong><small>JOAB Academy · {l.published?'Published':'Draft'}</small><small>Video progress: {duration(Number(list('watch_credit').find(c=>c.lesson_id===l.id&&c.student_id===profile.id)?.credited_seconds??0))} / {duration(l.duration_seconds)}</small><small>{sessions.find(s=>s.id===l.class_session_id)?.title} · {cardEvidence.find(s=>s.session_id===l.class_session_id)?.status??"Play class"}</small></span></button>)}</div>
          {lessons
            .filter((l) => l.batch_id === chosenBatch && l.id === chosenLesson)
            .map((l) => (
              <section className="portal-card academy-item" key={l.id}>
                <div className="academy-card-heading">
                  <h3>{l.title}</h3>
                  <span>
                    {Math.round(l.duration_seconds / 60)} min ·{" "}
                    {l.published ? "Published" : "Draft"}
                  </span>
                </div>
                {teacher && !l.duration_verified && <p>Open the player to verify video duration. Official class duration is set in Class sessions.</p>}
                {l.published || teacher ? (
                  <><VideoPlayer lesson={l} student={!teacher} />{!teacher&&<PlaybackEvidence batch={chosenBatch} student={profile.id} session={String(l.class_session_id)}/>}</>
                ) : null}
                {teacher && (
                  <button
                    onClick={() => setEditing({ kind: "lesson", row: l })}
                  >
                    Edit
                  </button>
                )}
                {teacher && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          supabase!.rpc("academy_manage_session", {
                            class_session: l.class_session_id,
                            kind: "lesson",
                            target: l.id,
                            batch: l.batch_id,
                            title: l.title,
                            body: "",
                            video_id: l.youtube_id,
                            seconds: l.duration_seconds,
                            publish: !l.published,
                            starts: null,
                          }),
                        l.published
                          ? "Lesson unpublished."
                          : "Lesson published.",
                      )
                    }
                  >
                    {l.published ? "Unpublish" : "Publish"}
                  </button>
                )}
                {teacher && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Remove “${l.title}”? Lessons with history will be unpublished; attendance and discussions are preserved.`)) return;
                      void run(
                        () => supabase!.rpc("academy_delete_lesson", { lesson: l.id }),
                        "Lesson removed from students. Historical records preserved.",
                      ).then((deleted) => {
                        if (deleted) setSelectedLesson("");
                      });
                    }}
                  >
                    Delete
                  </button>
                )}
                <div className="academy-discussion">
                  <h4>Class discussion</h4>
                  {(list("class_comments") as Message[])
                    .filter((c) => c.lesson_id === l.id)
                    .map((c) => (
                      <p key={c.id}>
                        <b>
                          {accounts.find((a) => a.id === c.author_id)
                            ?.full_name ??
                            (c.author_id === profile.id
                              ? "You"
                              : "Class member")}
                          :
                        </b>{" "}
                        {c.body}
                      </p>
                    ))}
                  {l.published && (
                    <form
                      onSubmit={(e) => {
                        simplePost(e, "comment", l.id);
                      }}
                      className="academy-inline-form"
                    >
                      <input
                        name="body"
                        required
                        maxLength={2000}
                        aria-label={`Comment on ${l.title}`}
                        placeholder="Ask or share with the class"
                      />
                      <button disabled={busy}>Post</button>
                    </form>
                  )}
                </div>
              </section>
            ))}
          {teacher && chosenBatch && (
            <section className="portal-card">
              <h3>Add recorded lesson</h3>
              <form
                className="portal-form"
                onSubmit={(e) => manage(e, "lesson")}
              >
                <SessionSelect sessions={sessions}/>
                <label>
                  Lesson title
                  <input name="title" required minLength={2} maxLength={180} />
                </label>
                <label>
                  YouTube video ID or URL
                  <input name="video" required />
                </label>
                <label>
                  Video duration in seconds (verify with the teacher player)
                  <input
                    name="seconds"
                    required
                    type="number"
                    min={60}
                    max={21600}
                  />
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" name="published" /> Publish to students
                </label>
                <button className="portal-button" disabled={busy}>
                  Save lesson
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {tab === "live" && (
        <>
          <div className="section-title">
            <h2>Live classes</h2>
          </div>
          {list("live_sessions")
            .filter((s) => s.batch_id === chosenBatch)
            .map((s) => (
              <section className="portal-card academy-item" key={s.id}>
                <h3>{field(s, "title")}</h3>
                <p>
                  {date(s.starts_at)} · {s.published ? "Published" : "Draft"}
                </p>
                {(s.published || teacher) && (
                  <VideoPlayer lesson={{id:s.id,title:field(s,"title"),youtube_id:field(s,"youtube_id")}} student={!teacher} live />
                )}
                {teacher&&<button disabled={busy} onClick={()=>{if(window.confirm('Archive this live class? Attendance history is preserved.'))void run(()=>supabase!.rpc('academy_remove_live',{target:s.id}),'Live class archived.');}}>Archive live class</button>}
                {teacher && (
                  <button onClick={() => setEditing({ kind: "live", row: s })}>
                    Edit
                  </button>
                )}
                {teacher && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          supabase!.rpc("academy_manage", {
                            kind: "live",
                            target: s.id,
                            batch: s.batch_id,
                            title: s.title,
                            body: "",
                            video_id: s.youtube_id,
                            seconds: null,
                            publish: !s.published,
                            starts: s.starts_at,
                          }),
                        "Session updated.",
                      )
                    }
                  >
                    {s.published ? "Unpublish" : "Publish"}
                  </button>
                )}
                {Boolean(s.recorded_lesson_id) && (
                  <p className="portal-muted">
                    Recording attached:{" "}
                    {lessons.find((l) => l.id === s.recorded_lesson_id)
                      ?.title ?? "Recorded lesson"}{" "}
                    <button
                      onClick={() => {
                        setSelectedLesson(String(s.recorded_lesson_id));
                        setTab("classes");
                      }}
                    >
                      View recorded classes
                    </button>
                  </p>
                )}
                {teacher && (
                  <form
                    className="academy-inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const lesson = String(
                        new FormData(event.currentTarget).get("lesson") ?? "",
                      );
                      void run(
                        () =>
                          supabase!.rpc("academy_attach_recording", {
                            live: s.id,
                            lesson,
                          }),
                        "Recording attached.",
                      );
                    }}
                  >
                    <select name="lesson" aria-label="Published recording">
                      {lessons
                        .filter((l) => l.batch_id === s.batch_id && l.published)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={
                        busy ||
                        !lessons.some(
                          (l) => l.batch_id === s.batch_id && l.published,
                        )
                      }
                    >
                      Attach published recording
                    </button>
                  </form>
                )}
              </section>
            ))}
          {!list("live_sessions").some((s) => s.batch_id === chosenBatch) && (
            <p className="portal-muted">No live classes scheduled.</p>
          )}
          {teacher && chosenBatch && (
            <section className="portal-card">
              <h3>Schedule YouTube Live</h3>
              <form className="portal-form" onSubmit={(e) => manage(e, "live")}>
                <SessionSelect sessions={sessions}/>
                <label>
                  Session title
                  <input name="title" required minLength={2} />
                </label>
                <label>
                  YouTube Live video ID or URL
                  <input name="video" required />
                </label>
                <label>
                  Starts at
                  <input name="starts" type="datetime-local" required />
                </label>
                <label className="checkbox-label">
                  <input name="published" type="checkbox" /> Publish
                </label>
                <button className="portal-button" disabled={busy}>
                  Save live session
                </button>
              </form>
              <p className="portal-muted">
                Publish the replay separately as a recorded lesson when ready.
              </p>
            </section>
          )}
        </>
      )}
      {tab === "work" && (
        <>
          <div className="section-title">
            <h2>Assignments</h2>
          </div>
          {assignments
            .filter((a) => a.batch_id === chosenBatch)
            .map((a) => {
              const closed = Boolean(a.due_at && new Date(String(a.due_at)).getTime() < now);
              const submission = list("submissions").find(
                (s) => s.assignment_id === a.id && s.student_id === profile.id,
              );
              return (
                <section className="portal-card academy-item" key={a.id}>
                  <h3>{a.title}</h3>
                  <p className="portal-muted">
                    Due: {date(a.due_at)} ·{" "}
                    {a.published ? "Published" : "Draft"}
                  </p>
                  <p>{a.instructions}</p>
                  {!teacher && (
                    <>
                      <p>
                        {submission
                          ? `Submitted · Mark: ${submission.mark ?? "Pending"}`
                          : "Not submitted"}
                      </p>
                      {submission?.feedback && (
                        <p>Feedback: {field(submission, "feedback")}</p>
                      )}
                      <form
                        className="portal-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const body = String(
                            new FormData(form).get("body") ?? "",
                          );
                          void run(
                            () =>
                              supabase!.rpc("academy_submit", {
                                assignment: a.id,
                                body,
                              }),
                            "Work submitted.",
                          );
                        }}
                      >
                        <label>
                          Your answer
                          <textarea
                            name="body"
                            disabled={closed || Boolean(submission?.graded_at)}
                            required
                            maxLength={10000}
                            defaultValue={
                              submission ? field(submission, "body") : ""
                            }
                          />
                        </label>
                        <p className="portal-muted">{submission?.graded_at ? "Graded work is locked. Ask your teacher to return it for revision." : closed ? "The submission deadline has passed." : "You may update your answer until it is graded or the deadline passes."}</p>
                        <button className="portal-button" disabled={busy || closed || Boolean(submission?.graded_at)}>
                          Submit answer
                        </button>
                      </form>
                    </>
                  )}
                  {teacher && (
                    <>
                      <button
                        onClick={() =>
                          setEditing({ kind: "assignment", row: a })
                        }
                      >
                        Edit
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              supabase!.rpc("academy_manage", {
                                kind: "assignment",
                                target: a.id,
                                batch: a.batch_id,
                                title: a.title,
                                body: a.instructions,
                                video_id: null,
                                seconds: null,
                                publish: !a.published,
                                starts: a.due_at,
                              }),
                            "Assignment updated.",
                          )
                        }
                      >
                        {a.published ? "Unpublish" : "Publish"}
                      </button>
                      {list("submissions")
                        .filter((s) => s.assignment_id === a.id)
                        .map((s) => (
                          <div className="academy-submission" key={s.id}>
                            <b>
                              {accounts.find((p) => p.id === s.student_id)
                                ?.full_name ?? "Student"}
                            </b>
                            <p>{field(s, "body")}</p>
                            <form
                              className="academy-inline-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void run(
                                  () =>
                                    supabase!.rpc("academy_grade", {
                                      submission: s.id,
                                      score: Number(f.get("score")),
                                      grade_feedback: String(
                                        f.get("feedback") ?? "",
                                      ),
                                    }),
                                  "Mark saved.",
                                );
                              }}
                            >
                              <input
                                name="score"
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                required
                                placeholder="Mark / 100"
                                aria-label="Mark out of 100"
                                defaultValue={
                                  s.mark === null ? "" : String(s.mark)
                                }
                              />
                              <input
                                name="feedback"
                                placeholder="Feedback"
                                aria-label="Feedback"
                                defaultValue={field(s, "feedback")}
                              />
                              <button disabled={busy}>Grade</button>
                              {Boolean(s.graded_at) && <button type="button" disabled={busy} onClick={() => void run(() => supabase!.rpc("academy_return_submission", { submission: s.id }), "Work returned for revision. Extend the deadline if needed.")}>Return for revision</button>}
                            </form>
                          </div>
                        ))}
                    </>
                  )}
                </section>
              );
            })}
          {teacher && chosenBatch && (
            <section className="portal-card">
              <h3>New assignment</h3>
              <form
                className="portal-form"
                onSubmit={(e) => manage(e, "assignment")}
              >
                <label>
                  Title
                  <input name="title" minLength={2} required />
                </label>
                <label>
                  Instructions
                  <textarea name="body" />
                </label>
                <label>
                  Due date
                  <input name="starts" type="datetime-local" />
                </label>
                <label className="checkbox-label">
                  <input name="published" type="checkbox" /> Publish
                </label>
                <button className="portal-button" disabled={busy}>
                  Save assignment
                </button>
              </form>
            </section>
          )}
          <div className="section-title">
            <h2>Notes</h2>
          </div>
          {list("notes")
            .filter((n) => n.batch_id === chosenBatch)
            .map((n) => (
              <section className="portal-card academy-item" key={n.id}>
                <h3>{field(n, "title")}</h3>
                <p className="academy-note">{field(n, "body")}</p>
                {teacher && (
                  <button onClick={() => setEditing({ kind: "note", row: n })}>
                    Edit
                  </button>
                )}
                {teacher && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          supabase!.rpc("academy_manage", {
                            kind: "note",
                            target: n.id,
                            batch: n.batch_id,
                            title: n.title,
                            body: n.body,
                            video_id: null,
                            seconds: null,
                            publish: !n.published,
                            starts: null,
                          }),
                        "Note updated.",
                      )
                    }
                  >
                    {n.published ? "Unpublish" : "Publish"}
                  </button>
                )}
              </section>
            ))}
          {teacher && chosenBatch && (
            <section className="portal-card">
              <h3>New note</h3>
              <form className="portal-form" onSubmit={(e) => manage(e, "note")}>
                <label>
                  Title
                  <input name="title" minLength={2} required />
                </label>
                <label>
                  Content
                  <textarea name="body" required />
                </label>
                <label className="checkbox-label">
                  <input name="published" type="checkbox" /> Publish
                </label>
                <button className="portal-button" disabled={busy}>
                  Save note
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {tab === "doubts" && profile.role === "admin" && (
        <section className="portal-card">
          <h2>Private doubts</h2>
          <p className="portal-muted">
            Private conversations are limited to each student and their
            currently assigned staff.
          </p>
        </section>
      )}
      {tab === "doubts" && profile.role !== "admin" && (
        <section className="portal-card">
          <h2>Private doubts</h2>
          <p className="portal-muted">
            Only the student and their currently assigned staff can read this
            conversation.
          </p>
          {profile.role === "student" && !accounts.some(a => a.id === profile.assigned_staff_id && a.role === "staff" && a.active) && <p role="status" className="portal-muted">Private chat is unavailable because no active teacher is assigned to your account. Ask an administrator to assign your teacher.</p>}
          {teacher && (
            <label className="academy-filter">
              Student{" "}
              <select
                value={chosenStudent}
                onChange={(e) => setDoubtStudent(e.target.value)}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!chosenStudent && (
            <p className="portal-muted">
              An assigned student is needed to start a conversation.
            </p>
          )}
          {(list("doubt_messages") as Message[])
            .filter((m) => m.student_id === chosenStudent)
            .map((m) => (
              <p className="academy-message" key={m.id}>
                <b>
                  {m.sender_id === profile.id
                    ? "You"
                    : accounts.find(a => a.id === m.sender_id)?.full_name ?? (teacher
                      ? "Student"
                      : "Staff")}
                </b>{" "}
                · {date(m.created_at)}
                <br />
                {m.body}
              </p>
            ))}
          {chosenStudent &&
            (profile.role === "student"
              ? accounts.some(a => a.id === profile.assigned_staff_id && a.role === "staff" && a.active)
              : true) && (
              <form
                className="academy-inline-form"
                onSubmit={(e) => simplePost(e, "doubt")}
              >
                <input
                  name="body"
                  required
                  maxLength={4000}
                  aria-label="Private message"
                  placeholder="Write a private doubt"
                />
                <button disabled={busy}>Send</button>
              </form>
            )}
        </section>
      )}
      {tab === "updates" && (
        <>
          <h2>Notifications</h2>
          {list("notifications").map((n) => (
            <section className="portal-card academy-item" key={n.id}>
              <h3>{field(n, "title")}</h3>
              <p>{field(n, "body")}</p>
              <small>{date(n.created_at)}</small>
              {!n.read_at && (
                <button
                  onClick={() =>
                    void run(
                      () =>
                        supabase!
                          .from("notifications")
                          .update({ read_at: new Date().toISOString() })
                          .eq("id", n.id),
                      "Marked as read.",
                    )
                  }
                >
                  Mark read
                </button>
              )}
            </section>
          ))}
          {!list("notifications").length && (
            <p className="portal-muted">No notifications yet.</p>
          )}
          {teacher && chosenBatch && (
            <section className="portal-card">
              <h3>Notify this batch</h3>
              <form
                className="portal-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  void run(
                    () =>
                      supabase!.rpc("academy_notify", {
                        batch: chosenBatch,
                        title: String(f.get("title") ?? ""),
                        body: String(f.get("body") ?? ""),
                      }),
                    "Batch notified.",
                  ).then((saved) => { if(saved) form.reset(); });
                }}
              >
                <label>
                  Title
                  <input name="title" required minLength={2} maxLength={160} />
                </label>
                <label>
                  Message
                  <textarea name="body" required maxLength={2000} />
                </label>
                <button className="portal-button" disabled={busy}>
                  Send update
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {tab === "manage" && teacher && (
        <>
          <div className="section-title">
            <h2>Courses and batches</h2>
          </div>
          <label className="checkbox-label"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Show archived</label>
          {list("courses").map((c) => (
            <article className="portal-card academy-item" key={c.id}>
              <h3>{field(c, "title")}</h3>{profile.role==="admin"&&<button disabled={busy} onClick={()=>{if(window.confirm("Permanently delete this empty course? Items with history are protected."))void run(()=>supabase!.rpc("academy_delete_empty",{kind:"course",target:c.id}),"Empty course deleted.");}}>Delete empty course</button>}
              <p>{field(c, "description")}</p>
              <small>
                {batches
                  .filter((b) => b.course_id === c.id)
                  .map((b) => b.title)
                  .join(" · ") || "No batch yet"}{" "}
                · {c.active ? "Active" : "Archived"}
              </small>
              {profile.role === "admin" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        supabase!.rpc("academy_set_active", {
                          kind: "course",
                          target: c.id,
                          enabled: !c.active,
                        }),
                      "Course status updated.",
                    )
                  }
                >
                  {c.active ? "Archive course" : "Restore course"}
                </button>
              )}
              {profile.role === "admin" && (
                <form
                  className="academy-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(
                      () =>
                        supabase!.rpc("academy_manage", {
                          kind: "course",
                          target: c.id,
                          batch: null,
                          title: String(f.get("title") ?? ""),
                          body: String(f.get("body") ?? ""),
                          video_id: null,
                          seconds: null,
                          publish: false,
                          starts: null,
                        }),
                      "Course updated.",
                    );
                  }}
                >
                  <input
                    name="title"
                    aria-label="Edit course title"
                    required
                    minLength={2}
                    defaultValue={field(c, "title")}
                  />
                  <input
                    name="body"
                    aria-label="Edit course description"
                    defaultValue={field(c, "description")}
                  />
                  <button disabled={busy}>Update course</button>
                </form>
              )}
            </article>
          ))}
          {profile.role === "admin" &&
            batches.map((b) => (
              <section className="portal-card academy-item" key={b.id}>
                <h3>
                  {b.title} · {b.active ? "Active" : "Archived"}
                </h3><button disabled={busy} onClick={()=>{if(window.confirm("Permanently delete this empty batch? Enrollments and history are protected."))void run(()=>supabase!.rpc("academy_delete_empty",{kind:"batch",target:b.id}),"Empty batch deleted.");}}>Delete empty batch</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        supabase!.rpc("academy_set_active", {
                          kind: "batch",
                          target: b.id,
                          enabled: !b.active,
                        }),
                      "Batch status updated.",
                    )
                  }
                >
                  {b.active ? "Archive batch" : "Restore batch"}
                </button>
                <p>
                  {field(
                    list("courses").find((c) => c.id === b.course_id) ?? {
                      id: "",
                    },
                    "title",
                  )}
                </p>
                <form
                  className="academy-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(
                      () =>
                        supabase!.rpc("academy_manage", {
                          kind: "batch",
                          target: b.id,
                          batch: b.course_id,
                          title: String(f.get("title") ?? ""),
                          body: "",
                          video_id: String(f.get("staff") ?? "") || null,
                          seconds: null,
                          publish: false,
                          starts: null,
                        }),
                      "Batch updated.",
                    );
                  }}
                >
                  <input
                    name="title"
                    aria-label="Edit batch title"
                    required
                    minLength={2}
                    defaultValue={b.title}
                  />
                  <select
                    name="staff"
                    aria-label="Assigned staff"
                    defaultValue={b.staff_id ?? ""}
                  >
                    <option value="">Unassigned</option>
                    {accounts
                      .filter((a) => a.role === "staff" && a.active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name}
                        </option>
                      ))}
                  </select>
                  <button disabled={busy}>Update batch</button>
                </form>
              </section>
            ))}
          {profile.role === "admin" && (
            <div className="academy-two-col">
              <section className="portal-card">
                <h3>New course</h3>
                <form
                  className="portal-form"
                  onSubmit={(e) => manage(e, "course")}
                >
                  <label>
                    Course title
                    <input name="title" required minLength={2} />
                  </label>
                  <label>
                    Description
                    <textarea name="body" />
                  </label>
                  <button className="portal-button" disabled={busy}>
                    Create course
                  </button>
                </form>
              </section>
              <section className="portal-card">
                <h3>New batch</h3>
                <form
                  className="portal-form"
                  onSubmit={(e) => manage(e, "batch")}
                >
                  <label>
                    Batch title
                    <input name="title" required minLength={2} />
                  </label>
                  <label>
                    Course
                    <select name="course" required>
                      {list("courses").map((c) => (
                        <option key={c.id} value={c.id}>
                          {field(c, "title")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Assigned staff
                    <select name="staff">
                      <option value="">Assign later</option>
                      {accounts
                        .filter((a) => a.role === "staff" && a.active)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.full_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="portal-button" disabled={busy}>
                    Create batch
                  </button>
                </form>
              </section>
            </div>
          )}
          {chosenBatch && (
            <section className="portal-card">
              <h3>Current roster</h3>
              {list("enrollments")
                .filter((e) => e.batch_id === chosenBatch)
                .map((e) => (
                  <div className="academy-report" key={e.id}>
                    <span>
                      {accounts.find((a) => a.id === e.student_id)?.full_name ??
                        "Student"}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm("Remove this student from the batch?")
                        )
                          void run(
                            () =>
                              supabase!.rpc("academy_unenroll", {
                                batch: chosenBatch,
                                student: e.student_id,
                              }),
                            "Student removed from batch.",
                          );
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              <h3>Enroll a student in {batchLabel(chosenBatch)}</h3>
              <form
                className="academy-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const student = String(
                    new FormData(form).get("student") ?? "",
                  ).trim();
                  // An empty select is possible when every active student is
                  // already enrolled. Never send "" to a UUID RPC argument.
                  if (!student) {
                    setError("There are no available students to enroll in this batch.");
                    return;
                  }
                  void run(
                    () =>
                      supabase!.rpc("academy_enroll", {
                        batch: chosenBatch,
                        student,
                      }),
                    "Student enrolled.",
                  );
                }}
              >
                <select name="student" aria-label="Student to enroll">
                  {students
                    .filter(
                      (s) =>
                        !list("enrollments").some(
                          (e) =>
                            e.batch_id === chosenBatch && e.student_id === s.id,
                        ),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} · {s.account_code}
                      </option>
                    ))}
                </select>
                <button
                  disabled={busy || !students.some(
                    (s) => !list("enrollments").some(
                      (e) => e.batch_id === chosenBatch && e.student_id === s.id,
                    ),
                  )}
                >
                  Enroll
                </button>
              </form>
            </section>
          )}
        </>
      )}
      {tab === "reports" && teacher && (
        <>
          <h2>Attendance and eligibility</h2>
          <p className="portal-muted">
            Attendance is completed official class sessions divided by required sessions. Video and live participation support the same class.
          </p>
          {list("enrollments")
            .filter((e) => e.batch_id === chosenBatch)
            .map((e) => {
              const s = summaries[String(e.student_id)];
              return (
                <article className="portal-card academy-report" key={e.id}>
                  <strong>
                    {accounts.find((a) => a.id === e.student_id)?.full_name ??
                      "Student"}
                  </strong>
                  <span>
                    {s
                      ? `${attendancePercent(s.percentage)}% · ${Number(s.credited).toFixed(0)} / ${Number(s.required).toFixed(0)} sessions Present · ${eligibilityLabel(s.eligibility)}`
                      : "Loading…"}
                  </span>
                </article>
              );
            })}
          <h2>Assignment results</h2>
          {assignments
            .filter((a) => a.batch_id === chosenBatch)
            .map((a) => {
              const marks = list("submissions")
                .filter(
                  (item) => item.assignment_id === a.id && item.mark !== null,
                )
                .map((item) => Number(item.mark));
              return (
                <article className="academy-report" key={a.id}>
                  <strong>{a.title}</strong>
                  <span>
                    {marks.length} graded ·{" "}
                    {marks.length
                      ? `${(marks.reduce((sum, n) => sum + n, 0) / marks.length).toFixed(1)} / 100 average`
                      : "No marks yet"}
                  </span>
                </article>
              );
            })}
          <h2>Audit</h2>
          <p className="portal-muted">
            Admin only. Account and academic actions are recorded in the
            database.
          </p>
          {profile.role === "admin" && <Audit />}
        </>
      )}
      {tab === "classes" && profile.role === "student" && chosenBatch && (
        <section className="portal-card academy-progress">
          <h3>Overall session attendance</h3>
          <strong>
            {summaries[profile.id]
              ? `${attendancePercent(summaries[profile.id].percentage)}%`
              : "—"}
          </strong>
          <p>
            {(summaries[profile.id] ? eligibilityLabel(summaries[profile.id].eligibility) : null) ??
              "No lessons yet"}
          </p>
          <p className="portal-muted">
            75% academy eligibility · 85% exam eligibility. Refresh after
            watching to see updated credit.
          </p>
          <button onClick={() => void load()}>Refresh progress</button>
        </section>
      )}
      </section>
    </>
  );
}
function Audit() {
  const [logs, setLogs] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => {
    let current = true;
    void supabase?.from("audit_logs").select("*").order("created_at", { ascending: false }).order("id").range(page * 50, page * 50 + 50)
      .then(({ data, error }) => {
        if (!current) return;
        if (error) { setError("Audit records could not be loaded. Try again."); setLogs([]); }
        else { setError(""); setLogs((data ?? []).slice(0,50) as Row[]); setMore((data?.length ?? 0) > 50); }
        setLoading(false);
      });
    return () => { current = false; };
  }, [page]);
  return <div aria-busy={loading}>
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !logs.length && <p>No audit records yet.</p>}
    {logs.map(l => <article className="academy-audit" key={l.id}>
      <b>{field(l,"action")}</b><span>{date(l.created_at)}</span>
      <details><summary>Record details</summary><p>Actor: {field(l,"actor_id") || "System"}<br />Subject: {field(l,"subject_id") || "—"}</p><pre>{JSON.stringify(l.details ?? {},null,2)}</pre></details>
    </article>)}
    <div className="academy-inline-form"><button disabled={!page || loading} onClick={() => {setLoading(true);setPage(p=>p-1);}}>Previous records</button><span>Page {page+1}</span><button disabled={!more || loading} onClick={() => {setLoading(true);setPage(p=>p+1);}}>Next records</button></div>
  </div>;
}
