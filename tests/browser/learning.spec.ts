import { test, expect, type Page } from '@playwright/test';
test.beforeEach(async ({page}) => {
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({contentType:"text/css",body:""}));
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
});
// Contract fixtures validate UI wiring; tests/database*.test.mjs exercise real SQL policies.
async function setup(page: Page, role: string) {
 const profile={id:role+'-1',role,full_name:'Test Learner',account_code:'TEST001',active:true,assigned_staff_id:'staff-1',can_create_students:true};
 const user={id:profile.id,email:'test@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
 const token=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:profile.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
 const records:Record<string,Record<string,unknown>[]>={
  courses:[{id:'course-1',title:'Career skills',active:true}],
  batches:[{id:'batch-1',title:'September batch',course_id:'course-1',staff_id:'staff-1',active:true}],
  enrollments:[{id:'enroll-1',batch_id:'batch-1',student_id:'student-1'}],
  lessons:[{id:'lesson-1',batch_id:'batch-1',class_session_id:'session-1',title:'Interview practice',youtube_id:'abcdefghijk',duration_seconds:100,published:true}],
  class_sessions:[{id:'session-1',batch_id:'batch-1',title:'Official class',official_seconds:1800,published:true,required:true,review_required:false}],
  assignments:[{id:'assignment-1',batch_id:'batch-1',title:'Practice task',instructions:'Write an introduction.',due_at:'2099-09-16T10:00:00Z',published:true}],
  notes:[{id:'note-1',batch_id:'batch-1',title:'Lesson notes',body:'Prepare your introduction.',published:true}],
  class_schedule:[{id:'schedule-1',batch_id:'batch-1',class_session_id:'session-1',title:'Weekly class',starts_at:'2099-09-16T10:00:00Z',ends_at:'2099-09-16T11:00:00Z',meeting_url:'https://example.com/class',published:true}],
  submissions:role==='student'?[]:[{id:'submission-1',assignment_id:'assignment-1',student_id:'student-1',body:'My introduction',mark:90,graded_at:'2026-09-16T10:00:00Z',feedback:'Well done'}],
 };
 const calls:{name:string;body:Record<string,unknown>}[]=[];let fail='';
 await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<html><body>Video fixture</body></html>'}));
 await page.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class {constructor(frame,options){this.frame=frame;this.options=options;this.position=0;this.state=2;window.fixturePlayer=this;}getCurrentTime(){return this.position}getPlayerState(){return this.state}getPlaybackRate(){return 1}pauseVideo(){this.state=2;this.options.events.onStateChange({data:2})}destroy(){this.frame.remove()}}};window.onYouTubeIframeAPIReady?.();`}));
 await page.route('https://portal-test.supabase.co/**',async r=>{
  const req=r.request(),url=new URL(req.url()),path=url.pathname;
  const json=(v:unknown,status=200)=>r.fulfill({json:v,status});
  if(path==='/auth/v1/token')return json({access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user});
  if(path==='/auth/v1/logout')return r.fulfill({status:204});
  if(path==='/auth/v1/user'){if(req.method()==='PUT')calls.push({name:'password',body:req.postDataJSON()});return json(user);}
  if(path==='/auth/v1/recover'){calls.push({name:'recover',body:req.postDataJSON()});return json({});}
  if(path==='/rest/v1/profiles')return json(url.searchParams.has('id')?profile:[profile]);
  if(path.includes('/rpc/')){
   const name=path.split('/').at(-1)!,body=req.postDataJSON();calls.push({name,body});
   if(name===fail){fail='';return json({message:'Temporary failure'},400);}
   if(name==='academy_directory')return json([profile,{...profile,id:'student-1',role:'student',full_name:'Test Student'}]);
   if(name==='attendance_summary')return json([{credited:0,required:1,percentage:0,eligibility:'academy_not_eligible'}]);
   if(name==='session_attendance'||name==='attendance_evidence')return json([{session_id:'session-1',title:'Official class',official_seconds:1800,verified_seconds:120,status:'In Progress',starts_at:null,review_required:false,class_type:'Recorded',source:'Auto',updated_at:'2026-10-04T00:00:00Z',locked:false}]);
   if(name==='academy_submit')records.submissions=[{id:'submission-1',assignment_id:body.assignment,student_id:profile.id,body:body.body,mark:null,graded_at:null}];
   if(name==='academy_return_submission')Object.assign(records.submissions[0],{mark:null,graded_at:null});
   if(name==='academy_grade')Object.assign(records.submissions[0],{mark:body.score,graded_at:new Date().toISOString()});
   if(name==='academy_schedule_session'&&body.target)Object.assign(records.class_schedule[0],{title:body.title,starts_at:body.starts,ends_at:body.ends});
   return json(name==='watch_start'?'watch-1':null);
  }
  return json(records[path.split('/').at(-1)!]??[]);
 });
 await page.goto('/login');await page.getByLabel('Email address').fill('test@example.com');await page.getByLabel('Password',{exact:true}).fill('Fixture-password-123');await page.getByRole('button',{name:'Sign in as Student'}).click();await expect(page).toHaveURL(new RegExp(`/portal/${role}$`));
 return {calls,failNext:(name:string)=>{fail=name;}};
}
test('student player lifecycle, preserved failed answer, submission and exact display threshold',async({page},testInfo)=>{
 const f=await setup(page,'student');await page.getByRole('link',{name:'Academy',exact:true}).click();await expect(page.locator('iframe.academy-video')).toHaveCount(0);await page.getByRole('button',{name:'Play Interview practice',exact:true}).click();
 await expect(page.getByTitle('Interview practice YouTube player')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('recorded-player.png'),fullPage:true});
 expect(f.calls.filter(c=>c.name==='watch_start')).toHaveLength(0);
 await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {fixturePlayer:unknown}).fixturePlayer))).toBe(true);
 await page.evaluate(()=>{const p=(window as any).fixturePlayer;p.state=1;p.options.events.onStateChange({data:1});});
 await expect.poll(()=>f.calls.filter(c=>c.name==='watch_start').length).toBe(1);
 await page.evaluate(()=>{const p=(window as any).fixturePlayer;p.position=5;p.pauseVideo();});
 await expect.poll(()=>f.calls.filter(c=>c.name==='watch_ping').length).toBe(1);
 expect(f.calls.find(c=>c.name==='watch_ping')?.body).toMatchObject({playhead:5,playing:true});
 await page.getByRole('tab',{name:'Assignments & notes'}).click();await expect(page.getByText('Prepare your introduction.')).toBeVisible();
 await page.getByLabel('Your answer').fill('My saved answer');f.failNext('academy_submit');await page.getByRole('button',{name:'Submit answer'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('Your answer')).toHaveValue('My saved answer');
 await page.getByRole('button',{name:'Submit answer'}).click();await expect(page.getByText('Submitted · Mark: Pending')).toBeVisible();
 await page.getByRole('tab',{name:'Attendance',exact:true}).click();await expect(page.getByText(/0 \/ 1 required sessions Present/)).toBeVisible();await expect(page.getByText(/In Progress · 120 \/ 1800/)).toBeVisible();
});
test('teacher local-time editing, failed edit preservation and return/grade',async({page})=>{
 const f=await setup(page,'staff');await page.getByRole('link',{name:'Academy',exact:true}).click();await page.getByRole('tab',{name:'Timetable',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Edit class'})});await expect(form.getByLabel('Starts')).toHaveValue('2099-09-16T15:30');await form.getByLabel('Title',{exact:true}).fill('Updated weekly class');
 await form.getByLabel('Class session',{exact:true}).selectOption('session-1');f.failNext('academy_schedule_session');await form.getByRole('button',{name:'Save changes'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(form.getByLabel('Title',{exact:true})).toHaveValue('Updated weekly class');
 await form.getByRole('button',{name:'Save changes'}).click();await expect(page.getByText('Updated weekly class')).toBeVisible();expect(f.calls.filter(c=>c.name==='academy_schedule_session').at(-1)?.body.starts).toBe('2099-09-16T10:00:00.000Z');
 await page.getByRole('tab',{name:'Assignments & notes'}).click();await page.getByRole('button',{name:'Return for revision'}).click();await expect(page.getByRole('button',{name:'Return for revision'})).toHaveCount(0);await page.getByLabel('Mark out of 100').fill('85');await page.getByRole('button',{name:'Grade',exact:true}).click();await expect(page.getByRole('button',{name:'Return for revision'})).toBeVisible();
});
test('recovery password mismatch, successful change and expired link',async({page})=>{
 const f=await setup(page,'student');await page.goto('/reset-password');await page.getByLabel('New password',{exact:true}).fill('New-password-12345');await page.getByLabel('Confirm new password').fill('Different-password-12345');await page.getByRole('button',{name:'Update password'}).click();await expect(page.getByRole('alert')).toContainText('must match');await page.getByLabel('Confirm new password').fill('New-password-12345');await page.getByRole('button',{name:'Update password'}).click();await expect(page.getByRole('status')).toContainText('has been changed');expect(f.calls.find(c=>c.name==='password')?.body.password).toBe('New-password-12345');await page.reload();await expect(page.getByRole('alert')).toContainText('expired');
});
test('attendance failure never pauses educational playback and retries without crediting the gap',async({page})=>{
 await page.clock.install();const f=await setup(page,'student');await page.getByRole('link',{name:'Academy',exact:true}).click();await expect(page.locator('iframe.academy-video')).toHaveCount(0);await page.getByRole('button',{name:'Play Interview practice',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Boolean((window as any).fixturePlayer))).toBe(true);
 await page.evaluate(()=>{const p=(window as any).fixturePlayer;p.state=1;p.options.events.onStateChange({data:1});});
 await expect.poll(()=>f.calls.filter(c=>c.name==='watch_start').length).toBe(1);
 f.failNext('watch_ping');await page.evaluate(()=>{(window as any).fixturePlayer.position=10;});await page.clock.runFor(10000);
 await expect(page.getByText(/Playback continues; tracking will retry/)).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fixturePlayer.state)).toBe(1);
 await page.evaluate(()=>{(window as any).fixturePlayer.position=20;});await page.clock.runFor(10000);
 await expect.poll(()=>f.calls.filter(c=>c.name==='watch_start').length).toBe(2);
 expect(f.calls.filter(c=>c.name==='watch_start').at(-1)?.body.playhead).toBe(20);
});
