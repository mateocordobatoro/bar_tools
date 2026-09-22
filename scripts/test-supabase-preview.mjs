// Hosted Preview ONLY. Never import or execute the disposable local harness.
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { randomUUID, randomBytes, X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const REF = 'mfwoutniamoldcieoqvc';
const URL = `https://${REF}.supabase.co`;
const HOST = 'aws-0-us-east-1.pooler.supabase.com';
const WORK = '/tmp/bar-tools-preview-hosted-step28';
const TABLES = ['app_users','recipes','recipe_versions','recipe_steps','batch_requests','batch_runs','batch_run_steps'];
class SafeError extends Error {}
let stage = 'local guards', db, inventory, checks = [];
const ensure = (condition, label) => { if (!condition) throw new SafeError(label); };
const check = (condition, label) => { ensure(condition,label); checks.push(label); };
const phase = label => { stage=label; console.log(`Testing: ${label}`); };
const persist = async () => writeFile(`${WORK}/inventory.json`,JSON.stringify(inventory,null,2),{mode:0o600});
const uuid = value => { ensure(typeof value==='string' && /^[a-f0-9-]{36}$/.test(value),'Invalid object identity'); return value; };
try {
  ensure(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()==='feat/supabase-foundation','Unexpected branch');
  ensure(process.env.NEXT_PUBLIC_SUPABASE_URL===URL,'Preview API target mismatch');
  const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  ensure(publishable?.startsWith('sb_publishable_'),'Publishable key missing');
  // Credentials arrive through a private pipe from getpass, never argv/env/files.
  let input=''; for await (const chunk of process.stdin) input+=chunk;
  const credentials=JSON.parse(input); input='';
  ensure(credentials.adminKey?.startsWith('sb_secret_') && !!credentials.dbPassword,'Private credentials missing');
  const ca=await readFile(`${homedir()}/.postgresql/bar_tools_preview-ca.crt`,'utf8');
  ensure(new X509Certificate(ca).fingerprint256.replaceAll(':','').toLowerCase()==='807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa','Unexpected CA');
  const requireRuntime=createRequire('/tmp/bar-tools-db-test-runtime/package.json');
  const {Client}=requireRuntime('pg');
  db=new Client({host:HOST,port:5432,user:`postgres.${REF}`,database:'postgres',password:credentials.dbPassword,
    ssl:{ca,rejectUnauthorized:true,servername:HOST},connectionTimeoutMillis:10000,
    application_name:'bar_tools_preview_step28'});
  db.on('error',()=>{}); // No raw driver errors or connection details in console.
  await db.connect();
  await db.query("SET statement_timeout='15s'; SET lock_timeout='5s'");
  const sql=async (text,params=[]) => (await db.query(text,params)).rows;
  const request=async (path,{token,admin=false,method='GET',body,headers={}}={})=>{
    ensure(path.startsWith('/')&&!path.startsWith('//'),'Relative API route required');
    ensure(!admin || path.startsWith('/auth/v1/admin/users'),'Admin key restricted to Auth users');
    ensure(method!=='DELETE','Destructive HTTP methods prohibited');
    const response=await fetch(URL+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{apikey:admin?credentials.adminKey:publishable,...(token?{Authorization:`Bearer ${token}`} : {}),
        ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
      body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json().catch(()=>null)};
  };
  const ok=(r,label)=>{check(r.status>=200&&r.status<300,`${label} HTTP ${r.status}`);return r.data;};
  const deny=(r,label)=>check([401,403].includes(r.status),`${label} HTTP ${r.status}`);
  const rpc=(name,token,body)=>request(`/rest/v1/rpc/${name}`,{token,method:'POST',body});
  const expect400=(r,label)=>check(r.status===400 && ['22023','23514'].includes(r.data?.code),`${label} HTTP ${r.status}`);
  phase('read-only target and empty-state prerequisites');
  const identity=(await sql('select current_user as role,current_database() as db'))[0];
  check(identity.role==='postgres'&&identity.db==='postgres','Database operator identity');
  check((await sql('select count(*)::int as n from auth.users'))[0].n===0,'Auth must be empty before first run');
  for(const table of TABLES) check((await sql(`select count(*)::int as n from public.${table}`))[0].n===0,`Empty ${table}`);
  check((await sql("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity"))[0].n===7,'Seven RLS tables');
  const settings=ok(await request('/auth/v1/settings'),'Auth settings');
  check(settings.disable_signup===true&&settings.external?.email===true,'Public signup disabled and email enabled');
  const adminUsers=ok(await request('/auth/v1/admin/users?page=1&per_page=1',{admin:true}),'Existing admin key validation');
  check(Array.isArray(adminUsers.users)&&adminUsers.users.length===0,'Admin API target empty');
  deny(await request('/rest/v1/app_users?select=id'),'Anonymous denied');
  await mkdir(WORK,{recursive:true,mode:0o700});
  const marker=await open(`${WORK}/attempted`,'wx',0o600); await marker.close();
  const runId=`BT28-${randomUUID()}`;
  inventory={project:REF,runId,startedAt:new Date().toISOString(),status:'running',users:{},objects:{
    recipe:randomUUID(),version:randomUUID(),steps:[randomUUID(),randomUUID()],requestKey:randomUUID(),runKey:randomUUID()},checks};
  await persist();
  phase('controlled Auth admin provisioning and real password login');
  const sessions={};
  for(const role of ['manager','bartender','inactive','unprovisioned']){
    const email=`${runId.toLowerCase()}-${role}@example.invalid`;
    inventory.users[role]={email,state:'creation pending'}; await persist();
    const password=`Aa1!${randomBytes(32).toString('base64url')}`;
    const user=ok(await request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email,password,email_confirm:true,
      app_metadata:{test_run:runId,synthetic:true,test_project:REF},user_metadata:{display_name:`${runId} ${role}`}}}),'Synthetic Auth creation');
    inventory.users[role]={id:uuid(user.id),email,state:'created'};await persist();
    sessions[role]=ok(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),`${role} login`);
    check(!!sessions[role].access_token&&!!sessions[role].refresh_token,'Session issued');
    const validated=ok(await request('/auth/v1/user',{token:sessions[role].access_token}),`${role} verified Auth identity`);
    check(validated.id===user.id,'Auth user matches created identity');
    const claims=JSON.parse(Buffer.from(sessions[role].access_token.split('.')[1],'base64url').toString());
    check(claims.iss===`${URL}/auth/v1`&&claims.sub===user.id,'JWT issuer and subject after Auth validation');
  }
  const token=role=>sessions[role].access_token;
  const {recipe,version,steps}=inventory.objects;
  phase('operator provisions only synthetic profiles and draft recipe');
  await db.query('BEGIN');
  try {
    for(const [key,role,active] of [['manager','management',true],['bartender','bartender',true],['inactive','bartender',false]]){
      const rows=await sql('insert into public.app_users(auth_user_id,display_name,role,active) values($1,$2,$3,$4) returning id',[inventory.users[key].id,`${runId} ${key}`,role,active]);
      inventory.users[key].profile=rows[0].id;
    }
    await sql('insert into public.recipes(id,name) values($1,$2)',[recipe,`${runId} synthetic recipe`]);
    await sql("insert into public.recipe_versions(id,recipe_id,version_number,expected_output_qty,expected_output_unit) values($1,$2,1,3,'L')",[version,recipe]);
    for(let i=0;i<2;i++) await sql('insert into public.recipe_steps(id,recipe_version_id,step_order,name,makes_ready) values($1,$2,$3,$4,$5)',[steps[i],version,i+1,`${runId} step ${i+1}`,i===1]);
    await persist(); // Planned IDs remain available even if COMMIT outcome becomes uncertain.
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
  inventory.provisioningCommitted=true;await persist();
  phase('JWT rejection, RLS and role escalation denial');
  const forged=token('bartender').split('.');
  const claims=JSON.parse(Buffer.from(forged[1],'base64url').toString());
  forged[1]=Buffer.from(JSON.stringify({...claims,sub:inventory.users.manager.id,role:'service_role'})).toString('base64url');
  deny(await request('/rest/v1/app_users?select=id',{token:forged.join('.')}),'Forged JWT rejected');
  const own=ok(await request('/rest/v1/app_users?select=id,auth_user_id',{token:token('bartender')}),'Bartender own profile SELECT');
  check(own.length===1&&own[0].auth_user_id===inventory.users.bartender.id,'Own-profile RLS');
  check(ok(await request('/rest/v1/app_users?select=id',{token:token('manager')}),'Management staff SELECT').length===3,'Management sees three profiles');
  for(const role of ['inactive','unprovisioned']){
    for(const table of TABLES) check(ok(await request(`/rest/v1/${table}?select=id`,{token:token(role)}),`${role} ${table} SELECT`).length===0,'Excluded identity sees no rows');
  }
  deny(await request(`/rest/v1/app_users?id=eq.${inventory.users.bartender.profile}`,{token:token('bartender'),method:'PATCH',body:{role:'management'}}),'Direct self-promotion denied');
  deny(await request('/rest/v1/recipes',{token:token('manager'),method:'POST',body:{name:`${runId} forbidden direct insert`}}),'Direct INSERT denied');
  check((await request('/rest/v1/audit_events?select=id',{token:token('manager'),headers:{'Accept-Profile':'bar_private'}})).status===406,'Private audit schema not exposed');
  const requestBody={p_version:version,p_qty:1,p_unit:'batch',p_operation_key:inventory.objects.requestKey};
  ok(await request('/auth/v1/user',{token:token('bartender'),method:'PUT',body:{data:{role:'management',active:true}}}),'Synthetic user metadata edit');
  sessions.bartender=ok(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:sessions.bartender.refresh_token}}),'Real refresh');
  check(ok(await request('/auth/v1/user',{token:token('bartender')}),'Refreshed JWT validation').id===inventory.users.bartender.id,'Refreshed identity preserved');
  deny(await rpc('create_batch_request',token('bartender'),requestBody),'Metadata role escalation denied');
  phase('approval and immutable approved versions');
  check(ok(await request(`/rest/v1/recipe_versions?id=eq.${version}&select=id`,{token:token('bartender')}),'Draft SELECT').length===0,'Draft hidden');
  deny(await rpc('approve_recipe_version',token('bartender'),{p_version:version}),'Bartender approval denied');
  ok(await rpc('approve_recipe_version',token('manager'),{p_version:version}),'Management approval RPC');
  check(ok(await request(`/rest/v1/recipe_versions?id=eq.${version}&select=id`,{token:token('bartender')}),'Approved SELECT').length===1,'Approved version visible');
  deny(await request(`/rest/v1/recipe_versions?id=eq.${version}`,{token:token('manager'),method:'PATCH',body:{expected_output_qty:99}}),'API version rewrite denied');
  // Operator attempts are rollback-only and restricted to the synthetic objects.
  for(const [text,params] of [
    ['update public.recipe_versions set expected_output_qty=99 where id=$1',[version]],
    ["update public.recipe_steps set name='Forbidden synthetic edit' where id=$1",[steps[0]]],
  ]){
    await db.query('BEGIN');let code;
    try{await db.query(text,params);}catch(error){code=error.code;}finally{await db.query('ROLLBACK');}
    check(code==='23514','Approved definition immutable even for operator');
  }
  phase('quantity and units, idempotency and batch workflow');
  for(const variant of [{p_qty:-1},{p_qty:0},{p_qty:0.5},{p_unit:'oz'}])
    expect400(await rpc('create_batch_request',token('manager'),{...requestBody,...variant}),'Invalid request rejected');
  const batchRequest=uuid(ok(await rpc('create_batch_request',token('manager'),requestBody),'Request RPC'));
  inventory.objects.request=batchRequest;await persist();
  check(ok(await rpc('create_batch_request',token('manager'),requestBody),'Request retry')===batchRequest,'Request idempotency');
  const runBody={...requestBody,p_operation_key:inventory.objects.runKey,p_request:batchRequest};
  deny(await rpc('start_batch_run',token('manager'),runBody),'Management cannot perform bartender operation');
  for(const role of ['inactive','unprovisioned']) deny(await rpc('start_batch_run',token(role),runBody),'Excluded identity cannot start run');
  const run=uuid(ok(await rpc('start_batch_run',token('bartender'),runBody),'Start run RPC'));
  inventory.objects.run=run;await persist();
  check(ok(await rpc('start_batch_run',token('bartender'),runBody),'Run retry')===run,'Run idempotency');
  const runSteps=ok(await request(`/rest/v1/batch_run_steps?batch_run_id=eq.${run}&select=id,recipe_version_id,recipe_step_id`,{token:token('bartender')}),'Run steps SELECT');
  check(runSteps.length===2&&runSteps.every(s=>s.recipe_version_id===version),'Exact recipe version on run steps');
  inventory.objects.runSteps=runSteps.map(s=>uuid(s.id));await persist();
  const first=runSteps.find(s=>s.recipe_step_id===steps[0]).id,last=runSteps.find(s=>s.recipe_step_id===steps[1]).id;
  expect400(await rpc('finish_batch_run',token('bartender'),{p_run:run,p_actual_qty:3}),'Premature completion denied');
  ok(await rpc('set_batch_step',token('bartender'),{p_run:run,p_step:first,p_status:'DONE'}),'Complete first step');
  ok(await rpc('set_batch_step',token('bartender'),{p_run:run,p_step:last,p_status:'BLOCKED',p_reason:`${runId} synthetic blocker`}),'Block step');
  const blocked=ok(await request(`/rest/v1/batch_run_steps?id=eq.${last}&select=blocked_by,blocked_reason`,{token:token('manager')}),'Block attribution')[0];
  check(blocked.blocked_by===inventory.users.bartender.profile&&blocked.blocked_reason===`${runId} synthetic blocker`,'Authenticated blocker actor');
  check(ok(await request(`/rest/v1/batch_runs?id=eq.${run}&select=status`,{token:token('bartender')}),'Blocked run SELECT')[0].status==='BLOCKED','Run blocked');
  expect400(await rpc('set_batch_step',token('bartender'),{p_run:run,p_step:last,p_status:'DONE'}),'Cannot skip resume');
  ok(await rpc('set_batch_step',token('bartender'),{p_run:run,p_step:last,p_status:'PENDING'}),'Resume step');
  check(ok(await request(`/rest/v1/batch_run_steps?id=eq.${first}&select=status`,{token:token('bartender')}),'Preserved step SELECT')[0].status==='DONE','Completed work preserved');
  ok(await rpc('set_batch_step',token('bartender'),{p_run:run,p_step:last,p_status:'DONE'}),'Complete resumed step');
  expect400(await rpc('finish_batch_run',token('bartender'),{p_run:run,p_actual_qty:0}),'Zero yield denied');
  ok(await rpc('finish_batch_run',token('bartender'),{p_run:run,p_actual_qty:3}),'Finish run');
  const finished=ok(await request(`/rest/v1/batch_runs?id=eq.${run}&select=status,recipe_version_id,started_by,completed_by`,{token:token('manager')}),'Finished run SELECT')[0];
  check(finished.status==='READY'&&finished.recipe_version_id===version&&finished.started_by===inventory.users.bartender.profile&&finished.completed_by===inventory.users.bartender.profile,'READY exact version and actors');
  const req=ok(await request(`/rest/v1/batch_requests?id=eq.${batchRequest}&select=status,requested_by`,{token:token('manager')}),'Request outcome SELECT')[0];
  check(req.status==='READY'&&req.requested_by===inventory.users.manager.profile,'READY request and manager actor');
  check((await sql("select count(*)::int as n from bar_private.audit_events where row_id=$1 and actor_id=$2 and operation='UPDATE'",[run,inventory.users.bartender.profile]))[0].n>0,'Audit authenticated workflow actor');
  phase('immediate profile deactivation and logout');
  const deactivated=await sql('update public.app_users set active=false where id=$1 and auth_user_id=$2 returning id',[inventory.users.bartender.profile,inventory.users.bartender.id]);
  check(deactivated.length===1,'Synthetic bartender deactivated');inventory.users.bartender.active=false;await persist();
  ok(await request('/auth/v1/user',{token:token('bartender')}),'Existing JWT still authenticated');
  for(const table of TABLES) check(ok(await request(`/rest/v1/${table}?select=id`,{token:token('bartender')}),'Deactivated SELECT').length===0,'Immediate DB read denial');
  deny(await rpc('start_batch_run',token('bartender'),{...runBody,p_operation_key:randomUUID(),p_request:null}),'Immediate DB write denial');
  for(const role of Object.keys(sessions)){
    ok(await request('/auth/v1/logout?scope=local',{token:token(role),method:'POST'}),`${role} logout`);
    const revoked=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:sessions[role].refresh_token}});
    check([400,401,403].includes(revoked.status),`${role} refresh revoked after logout`);
  }
  inventory.status='passed';inventory.completedAt=new Date().toISOString();
  console.log(`PASS: ${checks.length} checks. Synthetic records retained; no deletion performed.`);
}catch(error){
  if(inventory){inventory.status='stopped';inventory.failedStage=stage;inventory.failure=error instanceof SafeError?error.message:'Unexpected failure; raw details withheld';}
  console.error(`STOP during ${stage}: ${error instanceof SafeError?error.message:'Unexpected failure; raw details withheld'}. No automatic retry or deletion.`);
  process.exitCode=1;
}finally{
  if(inventory) await persist().catch(()=>{console.error('Inventory write failed; preserve existing journal and inspect by run tag.');process.exitCode=1;});
  await db?.end().catch(()=>{});
}
