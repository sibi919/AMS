// Exact acceptance checks against existing Docker services. Only labelled,
// freshly-created fixture IDs are changed; the fixture ledger supports cleanup.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createServer,request} from 'node:http';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from '@playwright/test';
const env=parseEnv(await readFile('.env','utf8')),upstream='http://gateway:8000';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const root=createClient(upstream,env.SERVICE_ROLE_KEY,options);
const people=await root.from('profiles').select('*');assert.ifError(people.error);
const owner=people.data.find(p=>p.role==='admin'&&p.active);
const ownerUser=await root.auth.admin.getUserById(owner.id);assert.ifError(ownerUser.error);
const link=await root.auth.admin.generateLink({type:'magiclink',email:ownerUser.data.user.email});assert.ifError(link.error);
const ownerClient=createClient(upstream,env.ANON_KEY,options);
assert.ifError((await ownerClient.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'})).error);
const prefix='SESSIONQA'+Date.now(),password=randomBytes(24).toString('base64url');
const ledger={prefix,accounts:[],course:null,batches:[],sessions:[]};let browser,server;
await mkdir('backups',{recursive:true});
const save=()=>writeFile('backups/'+prefix+'-fixtures.json',JSON.stringify(ledger,null,2));
async function rpc(c,name,args){const r=await c.rpc(name,args);assert.ifError(r.error);return r.data;}
async function rows(c,table){const r=await c.from(table).select('*');assert.ifError(r.error);return r.data;}
async function provision(role,label,batchId=null,staffId=null){
 const email=prefix.toLowerCase()+'.'+label+'@example.test';
 const auth=await ownerClient.auth.getSession();
 const r=await fetch(upstream+'/functions/v1/create-account',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.data.session.access_token,apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({email,password,role,accountCode:prefix+'_'+label,fullName:'Session QA '+label,courseLabel:'Session lifecycle QA',assignedStaffId:staffId,batchId})});
 assert.equal(r.status,201,await r.text());
 const client=createClient(upstream,env.ANON_KEY,options),login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
 const account={id:login.data.user.id,role,label,email,client};ledger.accounts.push({id:account.id,role,label});await save();return account;
}
try{
 const admin=await provision('admin','ADMIN'),staff=await provision('staff','STAFF');
 const manage=(kind,title,extra={})=>rpc(admin.client,'academy_manage',{kind,target:null,batch:null,title,body:'Session lifecycle QA',video_id:null,seconds:null,publish:false,starts:null,...extra});
 ledger.course=await manage('course',prefix);await save();
 for(const label of ['A','B']){ledger.batches.push(await manage('batch',prefix+' Batch '+label,{batch:ledger.course,video_id:label==='A'?staff.id:null}));await save();}
 const [batchA,batchB]=ledger.batches;
 const studentA=await provision('student','STUDENTA',batchA,staff.id),studentB=await provision('student','STUDENTB',batchB);
 for(const label of ['Delete target','Keep session']){ledger.sessions.push(await rpc(staff.client,'academy_session_save_typed',{target:null,batch:batchA,title:prefix+' '+label,seconds:1800,starts:null,publish:true,is_required:true,kind:'Recorded'}));await save();}
 const [session,otherSession]=ledger.sessions;
 const otherLesson=await rpc(staff.client,'academy_manage_session',{kind:'lesson',target:null,batch:batchA,title:prefix+' KEEP video',body:'',video_id:'abcdefghijk',seconds:1800,publish:true,starts:null,class_session:otherSession});
 server=createServer((req,res)=>{const proxy=request(upstream+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',()=>res.end());req.pipe(proxy);});await new Promise(resolve=>server.listen(8000,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chromium',executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 async function login(account){const context=await browser.newContext();const page=await context.newPage();await page.goto('http://localhost:8000/login');await page.getByLabel('Email address').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in as Student',exact:true}).click();await page.waitForURL('**/portal/'+account.role);await page.getByRole('link',{name:'Academy',exact:true}).click();return page;}
 const a=await login(studentA),b=await login(studentB),teacher=await login(staff),administrator=await login(admin);
 const title=prefix+' Published video';
 await expect(a.getByRole('button',{name:'Play '+title,exact:true})).toHaveCount(0);
 const form=teacher.getByRole('heading',{name:'Add recorded lesson',exact:true}).locator('..').locator('form');
 await form.getByLabel('Class session',{exact:true}).selectOption(session);await form.getByLabel('Lesson title',{exact:true}).fill(title);await form.getByLabel('YouTube video ID or URL').fill('abcdefghijk');await form.getByLabel('Video duration in seconds',{exact:false}).fill('1800');await form.getByLabel('Publish to students').check();await form.getByRole('button',{name:'Save lesson',exact:true}).click();await teacher.getByText('lesson saved.',{exact:true}).waitFor();
 await a.getByRole('button',{name:'Refresh records',exact:true}).click();await expect(a.getByRole('button',{name:'Play '+title,exact:true})).toBeVisible();
 await a.reload();await expect(a.getByRole('button',{name:'Play '+title,exact:true})).toBeVisible();await b.reload();await expect(b.getByRole('button',{name:'Play '+title,exact:true})).toHaveCount(0);
 const lesson=(await rows(admin.client,'lessons')).find(l=>l.title===title).id;
 assert.ok(!(await rows(studentB.client,'lessons')).some(l=>l.id===lesson));
 console.log('PASS TEST 1: Staff publishes to Batch A; already logged-in Student A sees video after reload, Student B cannot see it in UI or RLS; no per-video assignment');
 const live=await rpc(staff.client,'academy_manage_session',{kind:'live',target:null,batch:batchA,title:prefix+' Owned live',body:'',video_id:'abcdefghijk',seconds:null,publish:true,starts:'2099-01-01T10:00:00Z',class_session:session});
 await rpc(staff.client,'academy_schedule_session',{target:null,batch:batchA,title:prefix+' Owned timetable',meeting_url:null,starts:'2099-01-01T10:00:00Z',ends:'2099-01-01T10:30:00Z',publish:true,class_session:session});
 await rpc(studentA.client,'academy_post',{kind:'comment',target:lesson,student:null,body:'Session-owned QA discussion'});
 const watch=await rpc(studentA.client,'watch_start',{lesson,playhead:0});await new Promise(r=>setTimeout(r,1100));await rpc(studentA.client,'watch_ping',{watch,playhead:1.1,playing:true});
 await rpc(studentA.client,'attendance_request',{session,body:'Session-owned QA attendance issue'});
 await rpc(staff.client,'attendance_mark',{session,student:studentA.id,status:'Present',reason:'Session deletion QA evidence'});
 await rpc(admin.client,'attendance_lock',{session,finalize:true,reason:'Session deletion QA finalized report'});
 await rpc(staff.client,'attendance_mark',{session:otherSession,student:studentA.id,status:'Present',reason:'Unrelated attendance must survive'});
 const assignment=await manage('assignment',prefix+' KEEP assignment',{batch:batchA,publish:true});const note=await manage('note',prefix+' KEEP note',{batch:batchA,publish:true});
 await rpc(studentA.client,'academy_post',{kind:'doubt',target:null,student:studentA.id,body:prefix+' KEEP private message'});
 const stableTables=['courses','batches','profiles','enrollments','assignments','notes'];const before={};for(const t of stableTables)before[t]=(await rows(admin.client,t)).map(r=>r.id).sort();
 for(const c of [staff.client,studentA.client])assert.ok((await c.rpc('academy_delete_class_session',{session})).error);
 await teacher.getByRole('tab',{name:'Class sessions',exact:true}).click();await expect(teacher.getByRole('button',{name:'Delete Class Session',exact:true})).toHaveCount(0);
 await administrator.getByRole('tab',{name:'Class sessions',exact:true}).click();await administrator.getByLabel('Batch',{exact:true}).selectOption(batchA);
 const target=administrator.locator('article').filter({has:administrator.getByText(prefix+' Delete target',{exact:true})});
 administrator.once('dialog',d=>d.dismiss());await target.getByRole('button',{name:'Delete Class Session',exact:true}).click();assert.ok((await rows(admin.client,'class_sessions')).some(s=>s.id===session));
 administrator.once('dialog',async d=>{assert.match(d.message(),/permanently/);await d.accept();});await target.getByRole('button',{name:'Delete Class Session',exact:true}).click();await administrator.getByText('Class session and its linked content permanently deleted.',{exact:true}).waitFor();await expect(target).toHaveCount(0);
 for(const page of [administrator,teacher]){await page.reload();await expect(page.getByText(prefix+' Delete target',{exact:true})).toHaveCount(0);}
 await a.reload();await expect(a.getByRole('button',{name:'Play '+title,exact:true})).toHaveCount(0);await expect(a.getByRole('button',{name:'Play '+prefix+' KEEP video',exact:true})).toBeVisible();
 assert.ok(!(await rows(admin.client,'lessons')).some(l=>l.id===lesson));assert.ok(!(await rows(admin.client,'live_sessions')).some(l=>l.id===live));
 for(const t of ['class_schedule','notifications'])assert.ok(!(await rows(studentA.client,t)).some(r=>r.class_session_id===session));
 assert.ok(!(await rows(admin.client,'class_comments')).some(r=>r.lesson_id===lesson));assert.ok(!(await rows(admin.client,'watch_credit')).some(r=>r.lesson_id===lesson));
 const attendance=await rpc(studentA.client,'attendance_evidence',{batch:batchA,student:studentA.id});assert.ok(!attendance.some(r=>r.session_id===session));assert.equal(attendance.find(r=>r.session_id===otherSession).status,'Present');
 for(const t of stableTables)assert.deepEqual((await rows(admin.client,t)).map(r=>r.id).sort(),before[t],t);
 assert.ok((await rows(studentA.client,'doubt_messages')).some(r=>r.body===prefix+' KEEP private message'));
 assert.ok((await rows(admin.client,'lessons')).some(l=>l.id===otherLesson));assert.ok((await rows(admin.client,'assignments')).some(r=>r.id===assignment));assert.ok((await rows(admin.client,'notes')).some(r=>r.id===note));
 console.log('PASS TEST 2: Admin confirmation cancellation preserves data; confirmed full delete survives reload across all roles, removes session content/evidence, preserves other session, attendance, courses, batches, accounts, assignments, notes and private chat');
}finally{
 await browser?.close();server?.close();
 if(ledger.course)await rpc(ownerClient,'academy_set_active',{kind:'course',target:ledger.course,enabled:false});
 for(const account of [...ledger.accounts].reverse())await rpc(ownerClient,'admin_update_account',{target_id:account.id,is_active:false,allow_student_creation:false,staff_id:null,course:'Session lifecycle QA inactive'});
 await save();
}
