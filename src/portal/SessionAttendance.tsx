import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { attendancePercent, eligibilityLabel, duration } from './learning';
export type Attendance = {session_id:string;title:string;official_seconds:number;verified_seconds:number;status:string;starts_at:string|null;review_required:boolean;class_type:string;source:string;updated_at:string;locked:boolean;reason:string|null};
export function SessionAttendance({batch,student,teacher=false,admin=false,session}:{batch:string;student:string;teacher?:boolean;admin?:boolean;session?:string}) {
 const [rows,setRows]=useState<Attendance[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[from,setFrom]=useState(''),[to,setTo]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let current=true;const load=async()=>{if(!batch||!student)return;const {data,error}=await supabase!.rpc('attendance_evidence',{batch,student});if(current){setRows(data??[]);setError(error?'Attendance could not be loaded.':'');setLoading(false);}};void load();const timer=setInterval(()=>void load(),15000);return()=>{current=false;clearInterval(timer);};},[batch,student,revision]);
 const visible=rows.filter(r=>(!session||r.session_id===session)&&(!from||!!r.starts_at&&new Date(r.starts_at)>=new Date(from+'T00:00:00'))&&(!to||!!r.starts_at&&new Date(r.starts_at)<=new Date(to+'T23:59:59')));
 const present=rows.filter(r=>r.status==='Present').length,pct=rows.length?present*100/rows.length:0;
 const pending=rows.some(r=>r.review_required);
 return <section className="portal-card"><h3>Session attendance</h3>{error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading attendance…</p>}
 <div className="academy-inline-form"><label>From date<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To date<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label></div>
 <p><strong>{present} / {rows.length} required sessions Present · {attendancePercent(pct)}%</strong></p>
 <p>{eligibilityLabel(pending?'review_required':!rows.length?'no_sessions':pct>=85?'academy_and_exam_eligible':pct>=75?'academy_eligible_exam_not_eligible':'academy_not_eligible')}</p>
 {(from||to||session)&&<p>Evidence filtered below. Overall eligibility uses all required sessions.</p>}
 {!loading&&!visible.length&&<p>No required sessions in this period.</p>}
 {visible.map(r=><article className="portal-card" key={r.session_id}><h4>{r.title}</h4><p>{r.starts_at?new Date(r.starts_at).toLocaleString():'Date not set'} · {r.class_type}</p><p>Required: {duration(r.official_seconds)} · Verified: {duration(r.verified_seconds)}</p><p>{r.status} · {Math.floor(Number(r.verified_seconds))} / {r.official_seconds} verified seconds</p><p>Source: {r.source} · {r.locked?'Finalized':'Open'} · Last updated: {r.updated_at?new Date(r.updated_at).toLocaleString():'Not started'}</p>{r.reason&&<p>Correction reason: {r.reason}</p>}
 <AttendanceActions row={r} student={student} teacher={teacher} admin={admin} onSaved={()=>setRevision(n=>n+1)}/>
 </article>)}
 <p className="portal-muted">Only Present sessions count toward eligibility. Excused sessions remain in the required-session denominator. Multiple videos in one session do not create multiple attendance events.</p></section>;
}
function AttendanceActions({row,student,teacher,admin,onSaved}:{row:Attendance;student:string;teacher:boolean;admin:boolean;onSaved:()=>void}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[expanded,setExpanded]=useState(false);
 const [history,setHistory]=useState<{id:number;action:string;actor_id:string;created_at:string;details:{reason?:string;status?:string}}[]>([]);
 const [requests,setRequests]=useState<{id:string;body:string;response:string|null;created_at:string}[]>([]);
 const load=useCallback(async()=>{const [h,r]=await Promise.all([supabase!.rpc('attendance_history',{session:row.session_id,student}),supabase!.from('attendance_requests').select('*').eq('session_id',row.session_id).eq('student_id',student).order('created_at',{ascending:false})]);if(h.error||r.error){setMessage('Review history could not be loaded.');return;}setHistory(h.data??[]);setRequests(r.data??[]);},[row.session_id,student]);
 async function run(name:string,args:Record<string,unknown>){if(busy)return;setBusy(true);setMessage('');const {error}=await supabase!.rpc(name,args);setBusy(false);setMessage(error?error.message:'Saved.');if(!error){onSaved();if(expanded)void load();}}
 return <div>
 {teacher&&(!row.locked||admin)&&<form className="academy-inline-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run('attendance_mark',{session:row.session_id,student,status:f.get('status'),reason:f.get('reason')});}}><label>Status<select name="status" defaultValue={['Present','Absent','Excused'].includes(row.status)?row.status:'Present'}><option>Present</option><option>Absent</option><option>Excused</option></select></label><label>Correction reason<input name="reason" required minLength={5} maxLength={2000}/></label><button disabled={busy}>{row.locked?'Save exceptional correction':'Save manual attendance'}</button></form>}
 {teacher&&row.locked&&!admin&&<p>Finalized attendance: ask an Admin for an audited correction.</p>}
 {admin&&<form className="academy-inline-form" onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get('reason');if(window.confirm(`${row.locked?'Unlock':'Finalize'} attendance for every enrolled student in this session?`))void run('attendance_lock',{session:row.session_id,finalize:!row.locked,reason});}}><label>Finalization reason<input name="reason" required minLength={5} maxLength={2000}/></label><button disabled={busy}>{row.locked?'Unlock session attendance':'Finalize session attendance'}</button></form>}
 <button onClick={()=>{setExpanded(!expanded);if(!expanded)void load();}}>{expanded?'Hide review history':'Review / attendance issue'}</button>
 {expanded&&<div>{history.map(h=><p key={h.id}>{new Date(h.created_at).toLocaleString()} · {h.action} · Staff ID: {h.actor_id} · {h.details.status} · {h.details.reason}</p>)}{!history.length&&<p>No manual changes recorded.</p>}{requests.map(r=><div key={r.id}><p>{new Date(r.created_at).toLocaleString()} · Request: {r.body}</p><p>{r.response?`Review: ${r.response}`:'Awaiting review'}</p>{teacher&&!r.response&&<form onSubmit={e=>{e.preventDefault();void run('attendance_resolve',{request:r.id,response:new FormData(e.currentTarget).get('response')});}}><label>Review response<textarea name="response" required minLength={5} maxLength={2000}/></label><button disabled={busy}>Resolve request</button></form>}</div>)}{!teacher&&<form onSubmit={e=>{e.preventDefault();void run('attendance_request',{session:row.session_id,body:new FormData(e.currentTarget).get('body')});}}><label>Describe attendance issue<textarea name="body" required minLength={5} maxLength={2000}/></label><button disabled={busy||requests.some(r=>!r.response)}>Request attendance review</button></form>}</div>}
 {message&&<p role="status">{message}</p>}
 </div>;
}
export function PlaybackEvidence({batch,student,session}:{batch:string;student:string;session:string}){
 const [row,setRow]=useState<Attendance>();
 useEffect(()=>{let active=true;const load=async()=>{const {data,error}=await supabase!.rpc('attendance_evidence',{batch,student});if(active&&!error)setRow(data?.find((r:Attendance)=>r.session_id===session));};void load();const timer=setInterval(()=>void load(),10000);return()=>{active=false;clearInterval(timer);};},[batch,student,session]);
 return row?<p role="status">Watched: {duration(row.verified_seconds)} / {duration(row.official_seconds)} · Session: {row.status} · Source: {row.source}</p>:null;
}
