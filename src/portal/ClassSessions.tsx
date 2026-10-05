import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { localDateTime } from './learning';
export type ClassSession = {id:string; batch_id:string; title:string; official_seconds:number; starts_at:string|null; published:boolean; required:boolean; review_required:boolean;class_type:string;archived:boolean};
export function ClassSessions({batch,teacher,admin=false,onSaved}:{batch:string;teacher:boolean;admin?:boolean;onSaved:()=>void}) {
 const [sessions,setSessions]=useState<ClassSession[]>([]);
 const [editing,setEditing]=useState<ClassSession|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{let current=true;if(!batch)return;const load=()=>supabase?.from('class_sessions').select('*').eq('batch_id',batch).order('starts_at').then(({data,error})=>{if(current){setSessions(data??[]);setError(error?'Class sessions could not be loaded.':'');}});void load();const timer=setInterval(()=>void load(),15000);return()=>{current=false;clearInterval(timer);};},[batch,revision]);
 if(!batch)return null;
 return <section className="portal-card"><h2>Class sessions</h2><p>One official class is one attendance unit, even when it contains several videos. Present requires the full official duration. Academy eligibility is 75% of required sessions; exam eligibility is 85%.</p>
 {error&&<p role="alert" className="portal-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!sessions.length&&<p>No class sessions yet.</p>}
 {sessions.map(s=><article className="academy-report" key={s.id}><div><strong>{s.title}</strong><p>{s.review_required?'Official duration needs confirmation':`${s.official_seconds/60} minutes`} · {s.published?'Published':'Draft'} · {s.required?'Required':'Optional'} · {s.class_type} {s.archived?'· Archived':''}</p>{s.starts_at&&<small>{new Date(s.starts_at).toLocaleString()}</small>}</div>{teacher&&<><button onClick={()=>setEditing(s)}>Edit session</button><button onClick={async()=>{if(!window.confirm('Archive this session and hide its media? Attendance history remains in reports.'))return;const {error}=await supabase!.rpc('academy_archive_session',{session:s.id});if(error)setError(error.message);else{setRevision(n=>n+1);onSaved();}}}>Archive session</button>{admin&&<button disabled={busy} onClick={async()=>{
 if(busy||!window.confirm(`Delete this entire Class Session: “${s.title}”? This permanently removes the session, all its recorded/live content, timetable entries, discussions, watch progress and attendance. This cannot be undone. Courses, batches, accounts and other sessions are preserved.`))return;
 setBusy(true);setError('');setNotice('');
 try{const {error}=await supabase!.rpc('academy_delete_class_session',{session:s.id});if(error){setError(error.message);return;}if(editing?.id===s.id)setEditing(null);setNotice('Class session and its linked content permanently deleted.');setRevision(n=>n+1);onSaved();}
 catch{setError('Session deletion could not be confirmed. Refresh before retrying.');}finally{setBusy(false);}
 }}>Delete Class Session</button>}</>}</article>)}
 {teacher&&<form className="portal-form" key={editing?.id??'new'} onSubmit={async e=>{e.preventDefault();if(!supabase||busy)return;const form=e.currentTarget,f=new FormData(form);setBusy(true);setError('');const {error}=await supabase.rpc('academy_session_save_typed',{target:editing?.id??null,batch,title:String(f.get('title')).trim(),seconds:Math.round(Number(f.get('minutes'))*60),starts:f.get('starts')?new Date(String(f.get('starts'))).toISOString():null,publish:f.get('published')==='on',is_required:f.get('required')==='on',kind:String(f.get('class_type'))});setBusy(false);if(error){setError('Session could not be saved. Check the duration and your batch permissions.');return;}setNotice('Official class session saved.');setEditing(null);form.reset();setRevision(n=>n+1);onSaved();}}>
 <h3>{editing?'Edit official session':'Create official session'}</h3>
 {editing?.review_required&&<p role="status">This legacy class used a video duration. Enter the official class duration before attendance can establish eligibility. Existing watch history is preserved.</p>}
 <label>Session title<input name="title" required minLength={2} maxLength={180} defaultValue={editing?.title}/></label>
 <label>Class type<select name="class_type" defaultValue={editing?.class_type??'Recorded'}><option>Recorded</option><option>Live</option><option>Offline</option><option>Mixed</option></select></label>
 <label>Official duration (minutes)<input name="minutes" type="number" required min={1} max={720} step="0.01" defaultValue={editing&&!editing.review_required?editing.official_seconds/60:undefined}/></label>
 <label>Class date and start<input name="starts" type="datetime-local" defaultValue={localDateTime(editing?.starts_at)}/></label>
 <label className="checkbox-label"><input name="required" type="checkbox" defaultChecked={editing?.required??true}/>Required attendance session</label>
 <label className="checkbox-label"><input name="published" type="checkbox" defaultChecked={editing?.published??false}/>Publish session</label>
 <button disabled={busy}>Save session</button>{editing&&<button type="button" onClick={()=>setEditing(null)}>Cancel</button>}
 </form>}</section>;
}
export function SessionSelect({sessions,value}:{sessions:ClassSession[];value?:string}) {
 return <label>Class session<select aria-label="Class session" name="class_session" required defaultValue={value??''}><option value="" disabled>Choose an official session</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.title}{s.review_required?' · duration needs review':''}</option>)}</select><small>Create or confirm official duration in Class sessions. Several videos may share one session.</small></label>;
}
