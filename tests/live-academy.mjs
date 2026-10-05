// Opt-in integration check against the running Docker stack. Creates clearly
// labelled test content; deletes only its own lesson and archives its test course.
// Existing passwords, lessons and attendance are never modified.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createServer, request } from 'node:http';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
const env=parseEnv(await readFile('.env','utf8'));
const origin='http://localhost:8000', upstream='http://gateway:8000';
const root=createClient(upstream,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const profiles=await root.from('profiles').select('*');
assert.ifError(profiles.error);
const adminProfile=profiles.data.find(p=>p.role==='admin'&&p.active);
const pupils=profiles.data.filter(p=>p.role==='student'&&p.active);
const pupil=pupils.find(p=>p.assigned_staff_id);
assert.ok(pupil,'An enrolled student with an assigned teacher is required');
const staffProfile=profiles.data.find(p=>p.id===pupil.assigned_staff_id);
const sessions={};
async function identity(p){
 const u=await root.auth.admin.getUserById(p.id);assert.ifError(u.error);
 const link=await root.auth.admin.generateLink({type:'magiclink',email:u.data.user.email});assert.ifError(link.error);
 const c=createClient(upstream,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const verified=await c.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});assert.ifError(verified.error);
 sessions[p.id]=verified.data.session;return c;
}
const admin=await identity(adminProfile),student=await identity(pupil),staff=await identity(staffProfile);
async function rpc(c,name,args){const r=await c.rpc(name,args);assert.ifError(r.error);return r.data;}
async function rows(c,name){const r=await c.from(name).select('*');assert.ifError(r.error);return r.data;}
const existing=(await rows(student,'lessons')).find(l=>l.published);
assert.ok(existing,'Existing published lesson must be visible to enrolled student');
for(const p of pupils){const c=p.id===pupil.id?student:await identity(p);assert.ok((await rows(c,'lessons')).some(l=>l.id===existing.id));}
console.log('PASS existing published lesson visible through real student RLS for both students');
const tag=`Integration check ${Date.now()}`;
const manage=(c,kind,target,batch,title,extra={})=>rpc(c,'academy_manage',{kind,target,batch,title,body:'Integration verification',video_id:null,seconds:null,publish:false,starts:null,...extra});
let course,lesson,batch,browser,server;
try {
 course=await manage(admin,'course',null,null,tag);
 batch=await manage(admin,'batch',null,course,tag,{video_id:staffProfile.id});
 assert.equal((await rows(student,'batches')).some(b=>b.id===batch),false);
 await rpc(admin,'academy_enroll',{batch,student:pupil.id});
 const official=await rpc(staff,'academy_session_save',{target:null,batch,title:tag+' official',seconds:1800,starts:null,publish:true,is_required:true});
 lesson=await manage(staff,'lesson',null,batch,tag,{video_id:existing.youtube_id,seconds:60});
 assert.equal((await rows(student,'lessons')).some(l=>l.id===lesson),false);
 await manage(staff,'lesson',lesson,batch,tag,{video_id:existing.youtube_id,seconds:60,publish:true});
 await rpc(staff,'academy_link_session',{kind:'lesson',target:lesson,session:official});
 assert.ok((await rows(student,'lessons')).some(l=>l.id===lesson));
 const other=pupils.find(p=>p.id!==pupil.id);
 const otherClient=await identity(other);
 assert.equal((await rows(otherClient,'lessons')).some(l=>l.id===lesson),false);
 assert.ok((await otherClient.rpc('academy_post',{kind:'comment',target:lesson,student:null,body:'Forbidden'})).error);
 const unrelatedBatch=await manage(admin,'batch',null,course,tag+' unassigned');
 assert.equal((await rows(staff,'batches')).some(b=>b.id===unrelatedBatch),false);
 assert.ok((await staff.rpc('academy_manage',{kind:'note',target:null,batch:unrelatedBatch,title:'Forbidden',body:'Forbidden',video_id:null,seconds:null,publish:true,starts:null})).error);
 assert.ok((await staff.rpc('academy_delete_lesson',{lesson})).error);
 assert.ok((await student.rpc('academy_delete_lesson',{lesson})).error);
 console.log('PASS publication, draft hiding, cross-batch isolation and staff/admin boundaries');
 const schedule=await rpc(staff,'academy_schedule',{target:null,batch,title:tag,meeting_url:null,starts:'2099-01-01T10:00:00Z',ends:'2099-01-01T11:00:00Z',publish:true});
 await rpc(staff,'academy_schedule',{target:schedule,batch,title:tag+' updated',meeting_url:null,starts:'2099-01-01T10:00:00Z',ends:'2099-01-01T11:00:00Z',publish:true});
 const live=await manage(staff,'live',null,batch,tag,{video_id:existing.youtube_id,publish:true,starts:'2099-01-01T10:00:00Z'});
 await rpc(staff,'academy_link_session',{kind:'live',target:live,session:official});
 await rpc(staff,'academy_link_session',{kind:'schedule',target:schedule,session:official});
 const assignment=await manage(staff,'assignment',null,batch,tag,{publish:true});
 await manage(staff,'note',null,batch,tag,{publish:true});
 await rpc(student,'academy_submit',{assignment,body:'Integration answer'});
 assert.ok((await rows(student,'class_schedule')).some(s=>s.id===schedule));
 assert.ok((await rows(student,'live_sessions')).some(s=>s.id===live));
 console.log('PASS live/timetable create, update, visibility and assignment submission');
 server=createServer((req,res)=>{const proxy=request(upstream+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',()=>res.end());req.pipe(proxy);});
 await new Promise(resolve=>server.listen(8000,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 async function portal(p){const context=await browser.newContext();await context.addInitScript(({session})=>localStorage.setItem('sb-localhost-auth-token',JSON.stringify(session)),{session:sessions[p.id]});const page=await context.newPage();page.setDefaultNavigationTimeout(60000);await page.goto(origin+`/portal/${p.role}/academy`,{waitUntil:'domcontentloaded'});return page;}
 const page=await portal(pupil);
 await page.getByLabel('Batch',{exact:true}).selectOption(existing.batch_id);
 await page.getByTitle(existing.title+' YouTube player').waitFor();
 assert.match(await page.getByTitle(existing.title+' YouTube player').getAttribute('src'),/youtube-nocookie.com\/embed\//);
 console.log('PASS existing published video iframe visible in actual student browser');
 // Real YouTube is attempted; an external-provider restriction is reported separately.
 try {await page.frameLocator('iframe.academy-video').locator('.ytp-large-play-button').click({timeout:20000});await page.waitForTimeout(12000);console.log('YouTube playback attempt:',await page.locator('[role="status"]').allTextContents());}catch{console.log('LIMITATION real YouTube playback blocked/unavailable in test browser; embed URL verified');}
 await page.getByLabel('Batch',{exact:true}).selectOption(batch);
 await page.getByLabel('Comment on '+tag).fill(tag+' discussion');await page.getByRole('button',{name:'Post',exact:true}).click();await page.getByText(tag+' discussion',{exact:false}).waitFor();await page.reload();await page.getByLabel('Batch',{exact:true}).selectOption(batch);await page.getByText(tag+' discussion',{exact:false}).waitFor();
 await page.getByRole('tab',{name:'Questions',exact:true}).click();await page.getByLabel('Private message').fill(tag+' private');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText(tag+' private',{exact:false}).waitFor();await page.reload();await page.getByText(tag+' private',{exact:false}).waitFor();
 const staffPage=await portal(staffProfile);await staffPage.getByRole('tab',{name:'Questions',exact:true}).click();await staffPage.getByLabel('Student',{exact:true}).selectOption(pupil.id);await staffPage.getByText(tag+' private',{exact:false}).waitFor();await staffPage.getByLabel('Private message').fill(tag+' reply');await staffPage.getByRole('button',{name:'Send',exact:true}).click();await staffPage.getByText(tag+' reply',{exact:false}).waitFor();
 await page.reload();await page.getByText(tag+' reply',{exact:false}).waitFor();
 assert.equal((await rows(otherClient,'doubt_messages')).some(m=>m.body===tag+' private'),false);
 assert.equal((await rows(admin,'doubt_messages')).some(m=>m.body===tag+' private'),false);
 console.log('PASS browser discussion, private student/staff messages and persistence; unrelated users/admin excluded');
 for(const [tab,text] of [['Timetable',tag+' updated'],['Live classes',tag],['Assignments & notes',tag]]){await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByLabel('Batch',{exact:true}).selectOption(batch);await page.locator('strong,h3').filter({hasText:text}).first().waitFor();}
 const watch=await rpc(student,'watch_start',{lesson,playhead:0});await new Promise(r=>setTimeout(r,10000));const credit=await rpc(student,'watch_ping',{watch,playhead:10,playing:true});assert.ok(Number(credit)>0);
 assert.ok((await otherClient.rpc('watch_ping',{watch,playhead:20,playing:true})).error);
 for(const c of [student,staff,admin]){const summary=await rpc(c,'attendance_summary',{batch,student:pupil.id});assert.equal(Number(summary[0].credited),0);assert.equal(Number(summary[0].required),1);const activity=await rpc(c,'session_attendance',{batch,student:pupil.id});assert.equal(activity[0].status,'In Progress');assert.equal(Number(activity[0].verified_seconds),10);}
 await page.getByRole('tab',{name:'Attendance',exact:true}).click();await page.getByLabel('Batch',{exact:true}).selectOption(batch);await page.getByText('In Progress · 10 / 1800 verified seconds',{exact:true}).waitFor();await page.reload();await page.getByLabel('Batch',{exact:true}).selectOption(batch);assert.ok((await rows(student,'watch_credit')).some(c=>c.lesson_id===lesson&&Number(c.credited_seconds)>0));
 console.log('PASS real timed watch RPC credit, persistence, student binding and teacher/admin summary (not proof of YouTube playback)');
 await manage(admin,'lesson',lesson,batch,tag,{video_id:existing.youtube_id,seconds:60,publish:false});assert.equal((await rows(student,'lessons')).some(l=>l.id===lesson),false);
 const adminPage=await portal(adminProfile);await adminPage.getByLabel('Batch',{exact:true}).selectOption(batch);adminPage.once('dialog',d=>d.dismiss());await adminPage.getByRole('button',{name:'Delete',exact:true}).click();assert.ok((await rows(admin,'lessons')).some(l=>l.id===lesson));adminPage.once('dialog',d=>d.accept());await adminPage.getByRole('button',{name:'Delete',exact:true}).click();await adminPage.getByText('Lesson deleted.',{exact:true}).waitFor();
 for(const table of ['lessons','watch_sessions','watch_credit','class_comments'])assert.equal((await rows(admin,table)).some(r=>r.id===lesson||r.lesson_id===lesson),false);
 assert.equal(Number((await rpc(student,'session_attendance',{batch,student:pupil.id}))[0].verified_seconds),10);
 lesson=null;console.log('PASS unpublish, browser delete cancellation/confirmation and dependent-record cleanup');
 console.log('PASS live Academy integration checks');
} finally {
 if(lesson)await rpc(admin,'academy_delete_lesson',{lesson});
 if(batch)await rpc(admin,'academy_unenroll',{batch,student:pupil.id});
 if(course)await rpc(admin,'academy_set_active',{kind:'course',target:course,enabled:false});
 await browser?.close();server?.close();
}
