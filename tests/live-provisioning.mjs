// Opt-in real Docker workflow: creates labelled QA accounts, then deactivates
// them and archives their course. Never changes existing passwords or photos.
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createServer,request} from 'node:http';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
const env=parseEnv(await readFile('.env','utf8')),url='http://gateway:8000';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const root=createClient(url,env.SERVICE_ROLE_KEY,options);
const {data:people,error}=await root.from('profiles').select('*');assert.ifError(error);
const owner=people.find(p=>p.role==='admin'&&p.active);
const ownerUser=await root.auth.admin.getUserById(owner.id);assert.ifError(ownerUser.error);
const link=await root.auth.admin.generateLink({type:'magiclink',email:ownerUser.data.user.email});assert.ifError(link.error);
const ownerClient=createClient(url,env.ANON_KEY,options);
const verified=await ownerClient.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});assert.ifError(verified.error);
const prefix='QA'+Date.now(),password=randomBytes(24).toString('base64url'),created=[];
async function rpc(c,name,args){const r=await c.rpc(name,args);assert.ifError(r.error);return r.data;}
async function provision(role,actor=ownerClient,batchId=null){
 const email=prefix.toLowerCase()+'.'+role+'@example.test';
 const session=await actor.auth.getSession();
 const response=await fetch(url+'/functions/v1/create-account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.data.session.access_token,apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({email,password,role,accountCode:prefix+'_'+role.toUpperCase(),fullName:'QA '+role,courseLabel:'Integration verification',assignedStaffId:null,batchId})});
 const body=await response.json();assert.equal(response.status,201,body.message);
 const client=createClient(url,env.ANON_KEY,options),login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
 const record={role,email,id:login.data.user.id,client};created.push(record);return record;
}
let course,batch,browser,server,qaLesson;
try{
 const admin=await provision('admin'),staff=await provision('staff',admin.client);
 await rpc(admin.client,'admin_update_account',{target_id:staff.id,is_active:true,allow_student_creation:true,staff_id:null,course:'QA teaching'});
 const manage=(kind,title,extra={})=>rpc(admin.client,'academy_manage',{kind,title,target:null,batch:null,body:'QA verification',video_id:null,seconds:null,publish:false,starts:null,...extra});
 course=await manage('course',prefix);batch=await manage('batch',prefix,{batch:course,video_id:staff.id});
 const student=await provision('student',staff.client,batch);
 const roster=await student.client.from('enrollments').select('*');assert.ifError(roster.error);assert.ok(roster.data.some(e=>e.batch_id===batch));
 console.log('PASS real Edge provisioning, password authentication and atomic batch enrollment');
 server=createServer((req,res)=>{const proxy=request(url+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',()=>res.end());req.pipe(proxy);});await new Promise(r=>server.listen(8000,'127.0.0.1',r));
 browser=await chromium.launch({channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 const pages={};
 for(const account of created){const context=await browser.newContext();const page=await context.newPage();await page.goto('http://localhost:8000/login',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in as Student',exact:true}).click();await page.waitForURL('**/portal/'+account.role);pages[account.role]=page;}
 console.log('PASS real browser password login for Admin, Staff and Student');
 const teacher=pages.staff;
 await teacher.getByRole('link',{name:'Academy',exact:true}).click();await teacher.getByRole('tab',{name:'Class sessions',exact:true}).click();await teacher.getByLabel('Batch',{exact:true}).selectOption(batch);
 await teacher.getByLabel('Session title',{exact:true}).fill(prefix+' official');await teacher.getByLabel('Official duration (minutes)').fill('30');await teacher.getByLabel('Publish session',{exact:true}).check();await teacher.getByRole('button',{name:'Save session',exact:true}).click();await teacher.getByText('Official class session saved.',{exact:true}).waitFor();
 const classRows=await staff.client.from('class_sessions').select('*').eq('batch_id',batch);assert.ifError(classRows.error);const official=classRows.data.find(s=>s.title===prefix+' official');assert.equal(official.official_seconds,1800);
 await teacher.getByRole('tab',{name:'Recorded classes',exact:true}).click();
 const form=teacher.getByRole('heading',{name:'Add recorded lesson',exact:true}).locator('..').locator('form');
 await form.getByLabel('Class session',{exact:true}).selectOption(official.id);await form.getByLabel('Lesson title',{exact:true}).fill(prefix+' video');await form.getByLabel('YouTube video ID or URL').fill('https://www.youtube.com/watch?v=Y_bgocgevnI');await form.getByLabel('Video duration in seconds',{exact:false}).fill('1800');await form.getByLabel('Publish to students').check();await form.getByRole('button',{name:'Save lesson',exact:true}).click();await teacher.getByText('lesson saved.',{exact:true}).waitFor();
 const lessonRow=await ownerClient.from('lessons').select('id').eq('title',prefix+' video').maybeSingle();assert.ifError(lessonRow.error);qaLesson=lessonRow.data?.id;
 const learner=pages.student;await learner.getByRole('link',{name:'Academy',exact:true}).click();await learner.getByRole('button',{name:'Play '+prefix+' video',exact:true}).click();await learner.getByTitle(prefix+' video YouTube player').waitFor();
 await learner.getByRole('tab',{name:'Attendance',exact:true}).click();await learner.getByText(/0 \/ 1 required sessions Present/).waitFor();
 console.log('PASS teacher session creation and publication to enrolled student; no partial-time presence');
 // Real wall-clock heartbeat checks, without changing PostgreSQL timestamps.
 const watch=await rpc(student.client,'watch_start',{lesson:qaLesson,playhead:0});
 for(let position=10;position<=120;position+=10){await new Promise(r=>setTimeout(r,10000));await rpc(student.client,'watch_ping',{watch,playhead:position,playing:true});if(position===30||position===120){const evidence=await rpc(student.client,'attendance_evidence',{batch,student:student.id});assert.equal(evidence[0].status,'In Progress');assert.ok(Number(evidence[0].verified_seconds)>=position-1&&Number(evidence[0].verified_seconds)<=position);assert.equal(Number((await rpc(student.client,'attendance_summary',{batch,student:student.id}))[0].credited),0);console.log('PASS actual timed '+position+' second participation remains In Progress with zero Present sessions');}}
 await learner.reload();await learner.getByText(/In Progress · 120 \/ 1800/).waitFor();
 await learner.getByRole('button',{name:'Review / attendance issue',exact:true}).click();await learner.getByLabel('Describe attendance issue').fill('QA network problem please review');await learner.getByRole('button',{name:'Request attendance review',exact:true}).click();await learner.getByText('Awaiting review',{exact:true}).waitFor();
 await teacher.getByRole('tab',{name:'Attendance',exact:true}).click();await teacher.getByLabel('Correction reason').fill('Network issue attendance verified by teacher');await teacher.getByRole('button',{name:'Save manual attendance',exact:true}).click();await teacher.getByText('Source: Manual',{exact:false}).waitFor();
 await teacher.getByRole('button',{name:'Review / attendance issue',exact:true}).click();await teacher.getByLabel('Review response').fill('Teacher reviewed the evidence and corrected attendance');await teacher.getByRole('button',{name:'Resolve request',exact:true}).click();
 await learner.reload();await learner.getByText('Source: Manual',{exact:false}).waitFor();
 const administrator=pages.admin;await administrator.getByRole('link',{name:'Academy',exact:true}).click();await administrator.getByRole('tab',{name:'Attendance',exact:true}).click();await administrator.getByLabel('Batch',{exact:true}).selectOption(batch);await administrator.getByLabel('Finalization reason').fill('QA exam report finalization');administrator.once('dialog',d=>d.accept());await administrator.getByRole('button',{name:'Finalize session attendance',exact:true}).click();await administrator.getByRole('button',{name:'Unlock session attendance',exact:true}).waitFor();
 assert.ok((await staff.client.rpc('attendance_mark',{session:official.id,student:student.id,status:'Absent',reason:'Staff must not change final report'})).error);
 await rpc(admin.client,'attendance_mark',{session:official.id,student:student.id,status:'Excused',reason:'QA exceptional administrator correction'});
 const history=await rpc(student.client,'attendance_history',{session:official.id,student:student.id});assert.ok(history.some(h=>h.action==='attendance.exceptional_correction'&&h.actor_id===admin.id));
 console.log('PASS real browser manual override, student dispute, staff review, administrator lock and audited exception');
 await learner.getByRole('tab',{name:'Recorded classes',exact:true}).click();await learner.getByRole('button',{name:'Play '+prefix+' video',exact:true}).click();await learner.getByLabel('Comment on '+prefix+' video').fill('QA saved discussion');await learner.getByRole('button',{name:'Post',exact:true}).click();await learner.getByText('QA saved discussion',{exact:false}).waitFor();await learner.reload();await learner.getByRole('button',{name:'Play '+prefix+' video',exact:true}).click();await learner.getByText('QA saved discussion',{exact:false}).waitFor();
 await learner.getByRole('tab',{name:'Questions',exact:true}).click();await learner.getByLabel('Private message').fill('QA private student message');await learner.getByRole('button',{name:'Send',exact:true}).click();await learner.getByText('QA private student message',{exact:false}).waitFor();await learner.reload();await learner.getByText('QA private student message',{exact:false}).waitFor();
 await teacher.getByRole('tab',{name:'Questions',exact:true}).click();await teacher.getByLabel('Private message').fill('QA private teacher reply');await teacher.getByRole('button',{name:'Send',exact:true}).click();await teacher.getByText('QA private teacher reply',{exact:false}).waitFor();await learner.reload();await learner.getByText('QA private teacher reply',{exact:false}).waitFor();
 console.log('PASS real private chat and lesson discussion with refresh persistence');
 const assignment=await manage('assignment',prefix+' assignment',{batch,publish:true});await manage('note',prefix+' note',{batch,body:'QA published note',publish:true});const submission=await rpc(student.client,'academy_submit',{assignment,body:'QA student answer'});await rpc(staff.client,'academy_grade',{submission,score:85,grade_feedback:'QA reviewed'});
 const schedule=await rpc(staff.client,'academy_schedule_session',{target:null,batch,title:prefix+' timetable',meeting_url:null,starts:'2099-01-01T10:00:00Z',ends:'2099-01-01T10:30:00Z',publish:true,class_session:official.id});
 await rpc(staff.client,'academy_schedule_session',{target:schedule,batch,title:prefix+' updated timetable',meeting_url:null,starts:'2099-01-01T11:00:00Z',ends:'2099-01-01T11:30:00Z',publish:true,class_session:official.id});
 await rpc(staff.client,'academy_manage_session',{kind:'live',target:null,batch,title:prefix+' live',body:'',video_id:'Y_bgocgevnI',seconds:null,publish:true,starts:'2099-01-01T10:00:00Z',class_session:official.id});
 for(const [tab,text] of [['Assignments & notes','QA published note'],['Timetable',prefix+' updated timetable'],['Live classes',prefix+' live']]){await learner.getByRole('tab',{name:tab,exact:true}).click();await learner.getByText(text,{exact:true}).first().waitFor();await learner.reload();await learner.getByText(text,{exact:true}).first().waitFor();}
 console.log('PASS actual assignment submission/grading, notes, timetable update and live publication persistence');
 await learner.getByRole('link',{name:'My profile',exact:true}).click();await learner.getByLabel('Phone number').fill('0000000000');await learner.getByLabel('Address',{exact:true}).fill('QA integration profile');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6S8AAAAASUVORK5CYII=','base64');
 await learner.getByLabel('Profile photo',{exact:true}).setInputFiles({name:'qa-avatar.png',mimeType:'image/png',buffer:png});await learner.getByRole('button',{name:'Save profile',exact:true}).click();await learner.getByText('Profile saved.',{exact:true}).waitFor();await learner.reload({waitUntil:'domcontentloaded'});await learner.getByAltText('Your profile').waitFor();
 const photo=await student.client.storage.from('profile-photos').download(student.id+'/avatar');assert.ifError(photo.error);assert.equal(photo.data.size,png.length);
 const unrelated=await staff.client.storage.from('profile-photos').download(student.id+'/avatar');assert.ok(unrelated.error);
 console.log('PASS actual private photo upload, reload, storage persistence and unrelated-user denial');
 await learner.goto('http://localhost:8000/portal/admin',{waitUntil:'domcontentloaded'});await learner.waitForURL('**/portal/student');
 assert.ok((await student.client.rpc('academy_session_save',{target:null,batch,title:'Forbidden',seconds:60,starts:null,publish:true,is_required:true})).error);
 console.log('PASS real UI/API role boundaries');
 console.log('PASS provisioning/profile/session workflow');
}finally{
 await browser?.close();server?.close();
 if(qaLesson)await rpc(ownerClient,'academy_delete_lesson',{lesson:qaLesson});
 if(course)await rpc(ownerClient,'academy_set_active',{kind:'course',target:course,enabled:false});
 for(const account of created.reverse())await rpc(ownerClient,'admin_update_account',{target_id:account.id,is_active:false,allow_student_creation:false,staff_id:null,course:'QA verification (inactive)'});
}
