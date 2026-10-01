// Real Next.js HTTP routes and Server Actions, exclusively against a loopback Auth stub.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
let checks=0, app;
const roles={manager:'management',bar:'bartender',inactive:'bartender',unprovisioned:null};
const inactive=new Set(['inactive']);
let refreshes=0;
const user=id=>({id,aud:'authenticated',role:'authenticated',email:`${id}@example.invalid`,app_metadata:{},user_metadata:{role:'management'},created_at:new Date().toISOString(),is_anonymous:false});
const jwt=(id,expired=false)=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+(expired?-60:3600),aud:'authenticated',role:'authenticated'})).toString('base64url')}.synthetic-signature`;
const session=(id,expired=false)=>({access_token:jwt(id,expired),refresh_token:`refresh-${id}`,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+(expired?-60:3600),user:user(id)});
const cookie=(id,expired=false)=>`sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session(id,expired))).toString('base64url')}`;
function identity(req){try{return JSON.parse(Buffer.from(req.headers.authorization.split('.')[1],'base64url').toString()).sub;}catch{return null;}}
const mock=createServer(async(req,res)=>{
  let body='';for await(const part of req)body+=part;
  const data=body?JSON.parse(body):{};const path=new URL(req.url,'http://localhost');
  const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(value===undefined?'':JSON.stringify(value));};
  if(path.pathname==='/auth/v1/token'){
    if(path.searchParams.get('grant_type')==='refresh_token'){refreshes++;const id=data.refresh_token?.replace('refresh-','');return id in roles?reply(200,session(id)):reply(400,{error_code:'refresh_token_not_found',msg:'Invalid'});}
    const id=data.email?.split('@')[0];return data.password==='test-password'&&id in roles?reply(200,session(id)):reply(400,{error_code:'invalid_credentials',msg:'Invalid credentials'});
  }
  if(path.pathname==='/auth/v1/user'){const id=identity(req);return id in roles?reply(200,user(id)):reply(401,{msg:'Invalid token'});}
  if(path.pathname==='/auth/v1/logout')return reply(204);
  if(path.pathname==='/rest/v1/app_users'){
    const id=identity(req);
    assert.equal(path.searchParams.get('auth_user_id'),`eq.${id}`);
    return reply(200,roles[id]?{id:`staff-${id}`,auth_user_id:id,display_name:`Synthetic ${id}`,role:roles[id],active:!inactive.has(id)}:null);
  }
  reply(404,{message:'Unexpected local test endpoint'});
});
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
try{
  mock.listen(0,'127.0.0.1');await once(mock,'listening');const mockPort=mock.address().port;
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{
    env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${mockPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local-auth-test'},stdio:'ignore'});
  let ready=false;
  for(let i=0;i<60;i++){
    try{if((await fetch(`${origin}/auth/unavailable`)).status===200){ready=true;break;}}catch{}
    if(app.exitCode!==null)break;
    await delay(500);
  }
  check(ready,'Local Next server starts');
  const get=(path,c)=>fetch(origin+path,{redirect:'manual',headers:c?{cookie:c}:{}});
  for(const path of ['/','/bartender','/management']){
    const r=await get(path);check([307,303].includes(r.status)&&new URL(r.headers.get('location'),origin).pathname==='/login',`Unauthenticated ${path} redirects`);
    check(!r.headers.get('cache-control')?.includes('public'),'No public cache');
  }
  const html=await (await get('/login')).text();check(html.includes('name="email"')&&html.includes('name="password"'),'Login fields render');
  for(const [id,path,expected] of [['bar','/management','/bartender'],['manager','/bartender','/management'],['inactive','/bartender','/access-denied'],['unprovisioned','/management','/access-denied']]){
    const r=await get(path,cookie(id));check(r.status===307&&new URL(r.headers.get('location'),origin).pathname===expected,`${id} route boundary`);
  }
  for(const [id,path] of [['bar','/bartender'],['manager','/management']]){
    const r=await get(path,cookie(id));const html=await r.text();
    check(r.status===200,`${id} protected route succeeds`);
    if(id==='bar')check(html.includes('Prep workspace'),'bar landing renders');
    else {
      const dom=new JSDOM(html);const document=dom.window.document;
      const navigation=document.querySelector('nav[aria-label="Management sections"]');
      check(navigation!==null,'Management navigation renders');
      check([...navigation.querySelectorAll('button')].map(button=>button.textContent).join('|')==='Overview|Inventory|Prep|Recipes|Staff','Management V1 modules render');
      check(navigation.querySelector('[aria-current="page"]')?.textContent==='Overview'&&document.querySelector('main h1')?.textContent==='Overview','Management opens the Overview section');
      dom.window.close();
    }
  }
  const renewed=await get('/bartender',cookie('bar',true));
  check(renewed.status===200&&refreshes>0,'Expired session refreshed before protected render');
  check(renewed.headers.getSetCookie().some(c=>c.startsWith('sb-127-auth-token=')&&/httponly/i.test(c)),'Refresh persisted as HttpOnly response cookie');
  inactive.add('bar');const denied=await get('/bartender',cookie('bar'));
  check(denied.status===307&&denied.headers.get('location').includes('/access-denied'),'Existing JWT observes DB deactivation');inactive.delete('bar');
  async function formPost(path,html,values,c,postOrigin=origin){
    const name=html.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];check(!!name,'Server Action form present');
    const form=new FormData();form.set(name,'');for(const [k,v] of Object.entries(values))form.set(k,v);
    return fetch(origin+path,{method:'POST',redirect:'manual',headers:{origin:postOrigin,...(c?{cookie:c}:{})},body:form});
  }
  const invalid=await formPost('/login',html,{email:'bar@example.invalid',password:'wrong'});
  check(invalid.status===303&&invalid.headers.get('location').includes('/login?error=credentials'),'Invalid login generic redirect');
  const login=await formPost('/login',html,{email:'bar@example.invalid',password:'test-password',role:'management',next:'https://evil.invalid'});
  check(login.status===303&&login.headers.get('location').endsWith('/bartender'),'Real login action role routing');
  check(login.headers.getSetCookie().some(c=>/httponly/i.test(c)),'Login persists HttpOnly cookie');
  const rejected=await formPost('/login',html,{email:'bar@example.invalid',password:'test-password'},null,'https://evil.invalid');
  check(rejected.status>=400,'Cross-origin Server Action rejected');
  const landing=await (await get('/bartender',cookie('bar'))).text();
  const logout=await formPost('/bartender',landing,{},cookie('bar'));
  check(logout.status===303&&logout.headers.get('location').endsWith('/login'),'Logout redirects to login');
  check(logout.headers.getSetCookie().some(c=>/max-age=0/i.test(c)),'Logout clears cookie');
  const callback=await get('/auth/callback?next=https://evil.invalid');
  check(callback.status===303&&new URL(callback.headers.get('location'),origin).origin===origin,`Missing callback code cannot redirect externally: ${callback.status} ${callback.headers.get('location')} expected ${origin}`);
  console.log(`PASS: ${checks} local HTTP checks; no hosted users, SQL or services used.`);
}finally{
  if(app&&app.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}
  mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));
}
