import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {NextRequest,NextResponse}=require('next/server');
function load(path,mocks={}){
  const output=ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`,{process,fetch,URL,FormData})(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name];
    if(name==='server-only')return {};
    return require(name);
  },module,module.exports);
  return module.exports;
}
const policy=load('lib/auth/access.ts');
const profile={id:'staff-1',auth_user_id:'user-1',display_name:'Synthetic',role:'bartender',active:true};
function client({user={id:'user-1',user_metadata:{role:'management'}},authError=null,row=profile,dbError=null}={}){
  return {auth:{getUser:async()=>({data:{user},error:authError})},from(table){
    assert.equal(table,'app_users');return {select(columns){assert.equal(columns,'id, auth_user_id, display_name, role, active');return {
      eq(field,id){assert.equal(field,'auth_user_id');assert.equal(id,user.id);return {maybeSingle:async()=>({data:row,error:dbError})};}
    };}};}};
}
for(const [name,options,expected] of [
  ['missing session',{user:null},'anonymous'],
  ['invalid token',{authError:{status:401}},'anonymous'],
  ['missing session error',{authError:{name:'AuthSessionMissingError'}},'anonymous'],
  ['Auth outage',{authError:{status:503}},'unavailable'],
  ['anonymous identity',{user:{id:'user-1',is_anonymous:true}},'blocked'],
  ['unprovisioned',{row:null},'blocked'],
  ['inactive',{row:{...profile,active:false}},'blocked'],
  ['unsupported role',{row:{...profile,role:'admin'}},'blocked'],
  ['mismatched profile',{row:{...profile,auth_user_id:'other'}},'blocked'],
  ['database failure',{dbError:{message:'private detail'}},'unavailable'],
  ['active bartender',{},'staff'],
  ['active management',{row:{...profile,role:'management'}},'staff'],
])test(name,async()=>assert.equal((await policy.resolveAccess(client(options))).kind,expected));
test('metadata role cannot override current database profile',async()=>{
  const access=await policy.resolveAccess(client());assert.equal(access.staff.role,'bartender');assert.equal(policy.destination(access),'/bartender');
});
test('profile deactivation is observed on the next resolution',async()=>{
  const row={...profile};const c=client({row});assert.equal((await policy.resolveAccess(c)).kind,'staff');row.active=false;assert.equal((await policy.resolveAccess(c)).kind,'blocked');
});
class Redirect extends Error{constructor(path){super('redirect');this.path=path;}}
const navigation={redirect:path=>{throw new Redirect(path);}};
for(const [name,options,role,target] of [
  ['unauthenticated', {user:null},'bartender','/login'],
  ['inactive', {row:{...profile,active:false}},'management','/access-denied'],
  ['unprovisioned', {row:null},'bartender','/access-denied'],
  ['bartender at management', {},'management','/bartender'],
  ['management at bartender', {row:{...profile,role:'management'}},'bartender','/management'],
  ['outage', {dbError:{}},'bartender','/auth/unavailable'],
])test(`protected route: ${name}`,async()=>{
  const session=load('lib/auth/session.ts',{'react':{cache:f=>f},'next/navigation':navigation,'@/lib/supabase/server':{createClient:async()=>client(options)},'./access':policy});
  await assert.rejects(()=>session.requireStaff(role),error=>error.path===target);
});
test('protected route returns verified staff',async()=>{
  const session=load('lib/auth/session.ts',{'react':{cache:f=>f},'next/navigation':navigation,'@/lib/supabase/server':{createClient:async()=>client()},'./access':policy});
  assert.equal((await session.requireStaff('bartender')).id,profile.id);
});
function actions(c){return load('app/auth/actions.ts',{'next/navigation':navigation,'@/lib/supabase/server':{createClient:async options=>{assert.equal(options.writable,true);return c;}},'@/lib/auth/access':policy});}
test('login validates input without submitting it to Auth',async()=>{
  const a=actions(null);await assert.rejects(()=>a.login(new FormData()),e=>e.path==='/login?error=credentials');
});
for(const [kind,expected] of [['valid','/bartender'],['invalid','/login?error=credentials'],['inactive','/access-denied']])test(`login: ${kind}`,async()=>{
  const c=client(kind==='inactive'?{row:{...profile,active:false}}:{});
  c.auth.signInWithPassword=async values=>{assert.equal(values.password,' private password ');return {error:kind==='invalid'?{message:'private raw error'}:null};};
  const form=new FormData();form.set('email','test@example.invalid');form.set('password',' private password ');form.set('role','management');form.set('next','https://evil.invalid');
  await assert.rejects(()=>actions(c).login(form),e=>e.path===expected);
});
for(const failed of [false,true])test(`logout ${failed?'failure does not claim success':'clears local session'}`,async()=>{
  const c={auth:{signOut:async options=>{assert.equal(options.scope,'local');return {error:failed?{}:null};}}};
  await assert.rejects(()=>actions(c).logout(),e=>e.path===(failed?'/auth/unavailable':'/login'));
});
const cfg={getSupabaseConfig:()=>({url:'https://example.supabase.co',publishableKey:'sb_publishable_test'})};
const cookieOptions=load('lib/supabase/cookie-options.ts');
test('production cookies are secure, HttpOnly, same-site and root scoped',t=>{
  t.mock.property(process,'env',{...process.env,NODE_ENV:'production'});
  const options=cookieOptions.authCookieOptions();assert.equal(options.secure,true);assert.equal(options.httpOnly,true);assert.equal(options.sameSite,'lax');assert.equal(options.path,'/');
});
test('middleware refresh updates both incoming and outgoing cookies and disables caching',async()=>{
  let verified=false;
  const middleware=load('lib/supabase/middleware.ts',{'next/server':{NextResponse},'./config':cfg,'./cookie-options':cookieOptions,'@supabase/ssr':{createServerClient:(_u,_k,options)=>({auth:{getUser:async()=>{
    options.cookies.setAll([{name:'session.0',value:'fresh',options:{httpOnly:true,path:'/'}}]);
    options.cookies.setAll([{name:'session.1',value:'',options:{maxAge:0,path:'/'}}]);
    verified=true;return {data:{user:{id:'test'}}};
  }}})}});
  const request=new NextRequest('https://app.invalid/bartender',{headers:{cookie:'session.0=expired; session.1=old'}});
  const response=await middleware.updateSession(request);
  assert.equal(verified,true);assert.equal(request.cookies.get('session.0').value,'fresh');
  assert.equal(response.cookies.get('session.0').value,'fresh');assert.equal(response.cookies.get('session.1').maxAge,0);
  assert.match(response.headers.get('cache-control'),/private, no-store/);
});
test('server client persists action cookies and does not swallow write failures',async()=>{
  let options;
  const make=writable=>load('lib/supabase/server.ts',{'next/headers':{cookies:async()=>({getAll:()=>[],set:()=>{throw new Error('cookie failure');}})},'./config':cfg,'./cookie-options':cookieOptions,'@supabase/ssr':{createServerClient:(_u,_k,o)=>{options=o;return {};}}}).createClient({writable});
  await make(false);assert.doesNotThrow(()=>options.cookies.setAll([{name:'x',value:'x'}]));
  await make(true);assert.throws(()=>options.cookies.setAll([{name:'x',value:'x'}]),/cookie failure/);
});
for(const valid of [true,false])test(`PKCE callback ${valid?'routes by DB role, ignoring external next':'handles invalid code generically'}`,async()=>{
  const c=client();c.auth.exchangeCodeForSession=async code=>{assert.equal(code,'test-code');return {error:valid?null:{message:'sensitive'}};};
  const route=load('app/auth/callback/route.ts',{'next/server':{NextResponse},'@/lib/supabase/server':{createClient:async()=>c},'@/lib/auth/access':policy});
  const response=await route.GET(new NextRequest('https://app.invalid/auth/callback?code=test-code&next=https://evil.invalid'));
  assert.equal(response.headers.get('location'),valid?'/bartender':'/login?error=callback');
  assert.match(response.headers.get('cache-control'),/no-store/);
});
