import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,mocks={},globals={}){
 const js=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};vm.runInNewContext(`(function(require,module,exports){${js}\n})`,{process,URL,console,Intl,...globals})(n=>n in mocks?mocks[n]:n==='server-only'?{}:require(n),module,module.exports);return module.exports;
}
const synchronization=load('lib/bartender/synchronize.ts',{}, {setTimeout,clearTimeout});
const model=load('lib/bartender/model.ts');const environment=load('lib/bartender/environment.ts');
import {id,sample,fixture} from './bartender-fixtures.mjs';
test('prep distinguishes full completion, partial meaningful progress, unavailable and suggestions',()=>{
 const s=fixture();s.overview.push(sample(3,{can_complete:false,can_start:false,should_prep:null}));const g=model.prepGroups(s);
 assert.equal(g.ready.length,1);assert.equal(g.start.length,1);assert.equal(g.unavailable.length,1);assert.equal(g.suggested.length,2);
});
for(const [kind,expected] of [['simple','produce_simple_batch'],['start','start_multistep_run'],['step','complete_batch_step'],['block','transition_batch_run'],['resume','transition_batch_run']])test(`${kind} maps to exact server contract without actor or request assignment`,()=>{
 const command=kind==='simple'||kind==='start'?{kind,version:id(1),batches:'0.5',key:id(9)}:kind==='step'?{kind,run:id(1),step:id(2),key:id(9)}:{kind,run:id(1),reason:'Filters',key:id(9)};
 const call=model.rpcCommand(model.parseCommand(command));assert.equal(call.name,expected);assert.equal(call.args.p_operation_key,id(9));assert.equal('p_actor' in call.args,false);assert.equal('p_request' in call.args,false);
});
for(const patch of [{kind:'ABANDON'},{actor:id(1)},{request:id(2)},{batches:'NaN'},{batches:'-1'},{batches:'1e2'},{output_unit:'L'},{actual_yield:2}])test(`reject unsupported input ${JSON.stringify(patch)}`,()=>assert.throws(()=>model.parseCommand({kind:'simple',version:id(1),batches:'1',key:id(2),...patch})));
test('environment cannot enable operational UI on Production or another project',()=>{
 const e={NEXT_PUBLIC_SUPABASE_URL:'https://mfwoutniamoldcieoqvc.supabase.co',VERCEL_ENV:'preview'};assert.equal(environment.isBartenderPreview(e),true);assert.equal(environment.isBartenderPreview({...e,VERCEL_ENV:'production'}),false);assert.equal(environment.isBartenderPreview({...e,NEXT_PUBLIC_SUPABASE_URL:'https://njhcumxecwrrpbmjfdti.supabase.co'}),false);
});
// Route integration: actual handlers with an injected transport, no hosted access.
const {NextRequest}=require('next/server');
function routes(access={kind:'staff',staff:{role:'bartender'}},execute=async()=>({run_id:id(99)})){
 const calls=[];const route=load('app/api/bartender/route.ts',{
 '@/lib/supabase/server':{createClient:async()=>({})},'@/lib/auth/access':{resolveAccess:async()=>access,destination:a=>a.kind==='staff'?'/management':a.kind==='anonymous'?'/login':'/access-denied'},
 '@/lib/bartender/environment':{isBartenderPreview:()=>true},'@/lib/bartender/model':model,
 '@/lib/bartender/service':{loadWorkspace:async()=>fixture(),rpc:async(c,n,p)=>{calls.push({n,p});return execute(n,p);}},
 });return {route,calls};
}
const request=(body,origin='https://preview.example')=>new NextRequest('https://preview.example/api/bartender',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const simple={kind:'simple',version:id(1),batches:'1',key:id(99)};
for(const access of [{kind:'anonymous'},{kind:'blocked'},{kind:'staff',staff:{role:'management'}}])test(`API denies ${access.kind} ${access.staff?.role??''}`,async()=>{const {route,calls}=routes(access);assert.equal((await route.POST(request(simple))).status,401);assert.equal(calls.length,0);});
test('POST rejects cross-origin writes',async()=>{const {route,calls}=routes();assert.equal((await route.POST(request(simple,'https://evil.invalid'))).status,403);assert.equal(calls.length,0);});
test('POST preserves retry operation key and RPC parameters',async()=>{const {route,calls}=routes();assert.equal((await route.POST(request(simple))).status,200);assert.equal((await route.POST(request(simple))).status,200);assert.deepEqual(calls[0],calls[1]);});
test('database rejection refreshable, network uncertainty retryable, raw errors never returned',async()=>{
 for(const [code,status] of [['P0001',409],[undefined,503],['42501',403]]){const {route}=routes(undefined,async()=>{throw Object.assign(new Error('sensitive detail'),{code});});const res=await route.POST(request(simple));assert.equal(res.status,status);assert.ok(!(await res.text()).includes('sensitive'));}
});
// Mounted UI integration. Supabase is replaced at HTTP boundary; real React events/effects.
test('operational UI: request/overproduction, production, stock, multistep, shared continuation, block/resume and safe retry',async()=>{
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
 const previous={window:globalThis.window,document:globalThis.document};globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react');const {createRoot}=require('react-dom/client');const {act}=React;const root=createRoot(document.getElementById('root'));
 let sources=[];dom.window.EventSource=class {constructor(url){assert.equal(url,'/api/bartender/events');sources.push(this);}addEventListener(){}close(){this.closed=true;}};
 let state=fixture(),calls=[],loseResponse=false,rejected=false,receipt=new Map(),holdAvailability=false,releaseAvailability;
 state.overview[1].should_prep=false;state.overview[0].allowed_batch_sizes=[.5,1,1.5,2,2.5,3];
 const mockFetch=async(url,options={})=>{
  if(options.method==='POST'){
   const c=JSON.parse(options.body);calls.push(c);
   const loseAfterCommit=loseResponse;loseResponse=false;
   if(rejected){rejected=false;return {ok:false,status:409,json:async()=>({message:'Stock or work changed.'})};}
   if(!receipt.has(c.key)){
    if(c.kind==='simple'){state.stock[0].quantity+=Number(c.batches);state.overview[0].current_batch_stock=state.stock[0].quantity;state.overview[0].should_prep=false;state.requests[0].fulfilled=1;state.requests[0].remaining=0;state.requests[0].state='FULFILLED';}
    if(c.kind==='start'){state.runs=[{id:id(80),recipe_version_id:id(2),batch_quantity:Number(c.batches),lifecycle:'IN_PROGRESS',request_id:null}];state.runSteps=[{id:id(81),batch_run_id:id(80),recipe_step_id:id(32),status:'PENDING'},{id:id(82),batch_run_id:id(80),recipe_step_id:id(33),status:'PENDING'}];state.runAvailability[id(80)]=sample(2,{can_start:true,reachable_step:2});}
    if(c.kind==='step')state.runSteps.find(s=>s.id===c.step).status='DONE';
    if(c.kind==='block'){state.runs[0].lifecycle='BLOCKED';state.blockers[id(80)]=c.reason;}
    if(c.kind==='resume')state.runs[0].lifecycle='IN_PROGRESS';receipt.set(c.key,true);
   }
   state.fetchedAt=crypto.randomUUID();if(loseAfterCommit)throw new Error('response lost after commit');return {ok:true,status:200,json:async()=>({result:{run_id:id(80)}})};
  }
  const parsed=new URL(url,'http://localhost');const version=parsed.searchParams.get('version');
  if(version&&holdAvailability)await new Promise(resolve=>{releaseAvailability=resolve;});
  return {ok:true,status:200,json:async()=>structuredClone(version?{...state.overview.find(a=>a.recipe_version_id===version),selected_batch_quantity:Number(parsed.searchParams.get('batches'))}:state)};
 };
 const hook=load('lib/bartender/use-workspace.ts',{'./model':model,'./synchronize':synchronization},{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,fetch:mockFetch,crypto,AbortController,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval});
 const Component=load('app/bartender/workspace.tsx',{'@/lib/bartender/model':model,'@/lib/bartender/use-workspace':hook},{crypto}).default;
 const text=()=>document.body.textContent;
 const click=async(label)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label);assert.ok(!button.disabled,label+' enabled');await act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
 try{
  await act(async()=>root.render(React.createElement(Component,{staffId:id(100)})));
  assert.match(text(),/Requested1 batch/);assert.match(text(),/Fulfilled0.5 batches/);assert.match(text(),/Suggested to prep/);assert.match(text(),/Can complete through Clarify/);assert.match(text(),/Filters: 1 unit short/);assert.ok(!text().includes('ledger'));
  assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Simulate sales').disabled);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Reset demo').disabled);
  assert.equal([...document.querySelectorAll('h3')].filter(h=>h.textContent==='Margarita').length,2,'No duplicate low-stock recipe in Ready to make');
  await click('Start Batch');assert.equal(document.querySelector('.quantity-options').children.length,4);assert.ok(document.querySelector('.more-quantities'));assert.match(text(),/any excess remains in Batch Stock/);assert.match(text(),/250 ml · Tequila/);await click('1');
  holdAvailability=true;state.fetchedAt='background-refresh';await act(async()=>{sources.at(-1).onmessage({data:'stale'});sources.at(-1).onmessage({data:'stale'});await new Promise(r=>setTimeout(r,400));});
  assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Start Batch · 1 batch'&&!b.disabled),'Background refresh preserves the current selection action');
  holdAvailability=false;await act(async()=>releaseAvailability());
  await click('Start Batch · 1 batch');assert.equal(calls.at(-1).batches,'1');assert.equal(state.stock[0].quantity,1.24);
  await click('Batch Stock');assert.match(text(),/1.24 batches/);await click('Prep');assert.match(text(),/No open management requests/);
  // External stock consumption appears on refresh; UI does not write balances.
  state.stock[0].quantity=.2;state.overview[0].current_batch_stock=.2;state.overview[0].should_prep=true;state.fetchedAt='external-sale';
  await act(async()=>{sources.at(-1).onmessage({data:'stale'});sources.at(-1).onmessage({data:'stale'});await new Promise(r=>setTimeout(r,400));});const suggestions=[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Suggested to prep');assert.match(suggestions.textContent,/Margarita/);assert.match(suggestions.textContent,/0.2 batches in stock/);
  const startSection=[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Can start');await act(async()=>startSection.querySelector('button').click());await click('Start Batch · 0.5 batches');assert.ok(document.querySelector('.batch-checklist'));await click('Complete Clarify');assert.ok(document.querySelector('.step-done'));assert.ok(document.querySelector('.step-next'));assert.equal(document.querySelectorAll('.batch-checklist .step-details').length,2);assert.ok([...document.querySelectorAll('.step-details')].every(d=>!d.open));assert.match(text(),/✓ ClarifyCompleted/);assert.match(text(),/Filter/);
  // A fresh bartender mounts the same shared run and can operate it.
  await act(async()=>root.render(React.createElement(Component,{staffId:id(101),key:'second'})));await click('In progress');await click('Continue');
  const input=document.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Waiting for filters');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await click("Can't continue");assert.match(text(),/Waiting: Waiting for filters/);await click('Resume work');assert.equal(calls.at(-1).kind,'resume');
  loseResponse=true;await click('Complete Filter');assert.match(text(),/Retry same action/);const key=calls.at(-1).key;await click('Retry same action');assert.equal(calls.at(-1).key,key);assert.equal(dom.window.sessionStorage.getItem('bartools:pending-production:'+id(101)),null);
  assert.equal(calls.some(c=>'actor' in c||'request' in c),false);
  await act(async()=>{dom.window.dispatchEvent(new dom.window.Event('online'));await new Promise(r=>setTimeout(r,400));});assert.ok(sources.slice(0,-1).every(s=>s.closed));
  const current=sources.at(-1),obsolete=sources.at(-2),writesBefore=calls.length;
  await act(async()=>{obsolete.onerror();obsolete.onmessage({data:'stale'});});
  assert.ok(!current.closed,'late callbacks from old source cannot close replacement');
  assert.equal(sources.at(-1),current);
  await act(async()=>{current.onmessage({data:'connected'});await new Promise(r=>setTimeout(r,400));});
  assert.equal(calls.length,writesBefore,'reconnect signal only reads');
 }finally{await act(async()=>root.unmount());assert.ok(sources.every(s=>s.closed));dom.window.close();Object.assign(globalThis,previous);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});

test('workspace service preserves historical stock identity, fixed run version and unknown counts',async()=>{
 const s=fixture();const tables={recipes:s.recipes,recipe_versions:s.versions,recipe_steps:s.steps,recipe_requirements:s.requirements,inventory_items:s.items,
 batch_runs:[{id:id(80),recipe_version_id:id(2),batch_quantity:1,lifecycle:'BLOCKED'}, {id:id(90),recipe_version_id:id(1),lifecycle:null}],batch_run_steps:[],
 batch_stock_identities:[{id:id(51),name:'Margarita'},{id:id(52),name:'Pineapple'}],inventory_accounts:[{id:id(100),stock_identity_id:id(51)},{id:id(101),stock_identity_id:id(52)}],
 inventory_balances:[{account_id:id(100),quantity:1.4,initialized:true},{account_id:id(101),quantity:0,initialized:false}],
 production_events:[{id:id(200),run_id:id(80),event_type:'BLOCK',detail:{reason:'Filters'},occurred_at:'2026-09-26'}]};
 const calls=[];const c={from:table=>({select:()=>({order:()=>({range:async()=>({data:tables[table],error:null})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:name==='get_prep_overview'?s.overview:name==='get_request_progress'?s.requests:sample(2),error:null};}};
 const {loadWorkspace}=load('lib/bartender/service.ts');const out=await loadWorkspace(c);
 assert.equal(out.stock.length,2);assert.equal(out.stock[0].quantity,1.4);assert.equal(out.stock[1].quantity,null);assert.equal(out.runs.length,1);assert.equal(out.runs[0].recipe_version_id,id(2));assert.equal(out.blockers[id(80)],'Filters');assert.equal(calls.find(c=>c.name==='get_run_availability').args.p_run,id(80));
});
test('workspace read errors cannot silently masquerade as empty stock',async()=>{
 const c={from:()=>({select:()=>({order:()=>({range:async()=>({data:null,error:{message:'private detail'}})})})}),rpc:async()=>({data:[],error:null})};
 await assert.rejects(()=>load('lib/bartender/service.ts').loadWorkspace(c),/Workspace read failed/);
});

import {stateFor} from './mobile-fixtures.mjs';
function mobileMarkup(page){const c=load('app/bartender/workspace.tsx',{'@/lib/bartender/model':model,'@/lib/bartender/use-workspace':{useWorkspace:()=>stateFor(page)}},{crypto}).default;return require('react-dom/server').renderToStaticMarkup(require('react').createElement(c,{staffId:'local-fixture'}));}
test('mobile separates saving from uncertain-result retry',()=>{const saving=mobileMarkup('saving'),pending=mobileMarkup('pending');assert.match(saving,/Saving… Please wait/);assert.ok(!saving.includes('Retry same action'));assert.match(pending,/Retry same action/);});
test('mobile shows remaining request first, stock low signal, and no duplicate ready recipe',()=>{const prep=mobileMarkup('prep');assert.ok(prep.indexOf('Requests')<prep.indexOf('Suggested to prep'));assert.ok(prep.indexOf('0.5 batches remaining')<prep.indexOf('Requested'));assert.equal((prep.match(/<h3>Margarita<\/h3>/g)||[]).length,2);assert.match(mobileMarkup('stock'),/Low stock · prep suggested/);});
test('mobile shows the full persistent checklist and keeps blocked action unambiguous',()=>{const run=mobileMarkup('run'),blocked=mobileMarkup('blocked');assert.match(run,/batch-checklist/);assert.match(run,/✓ Clarify/);assert.match(run,/Complete remaining steps/);assert.ok(!run.includes('<summary>Next'));assert.match(blocked,/Resume work/);assert.ok(!blocked.includes('Complete Filter'));});
test('mobile long missing lists remain expandable and forms avoid physical quantity input',()=>{const missing=mobileMarkup('missing'),run=mobileMarkup('run');assert.match(missing,/6 more missing inputs/);assert.match(missing,/ExtraLongIngredientName/);assert.ok(!missing.includes('<input'));assert.match(run,/enterKeyHint="done"/);assert.match(mobileMarkup('changed'),/Stock or this step changed/);});

for(const scenario of ['complete','missing','rejected','lost-response','refresh-failed']) test(`persistent checklist sequential completion: ${scenario}`,async()=>{
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
 const previous={window:globalThis.window,document:globalThis.document};globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');const root=createRoot(document.getElementById('root'));
 const state=fixture();state.steps=Array.from({length:4},(_,i)=>({id:id(301+i),recipe_version_id:id(2),step_order:i+1,name:`Step ${i+1}`,instructions:`Instructions ${i+1}`}));
 state.runs=[{id:id(80),recipe_version_id:id(2),batch_quantity:1,lifecycle:'IN_PROGRESS',request_id:null}];
 state.runSteps=state.steps.map((s,i)=>({id:id(401+i),batch_run_id:id(80),recipe_step_id:s.id,status:i===0?'DONE':'PENDING'}));
 state.runAvailability[id(80)]=sample(2,{reachable_step:4,missing_inputs:[],can_complete:true});state.runHistory=[];
 const calls=[];let active=0,maxActive=0,failRead=false;
 const mockFetch=async(url,options={})=>{
  if(options.method==='POST'){
   const c=JSON.parse(options.body);calls.push(c);active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;
   if(scenario==='rejected'&&c.step===id(403))return {ok:false,status:409,json:async()=>({})};
   state.runSteps.find(s=>s.id===c.step).status='DONE';state.fetchedAt=crypto.randomUUID();
   if(scenario==='missing'&&c.step===id(402)){state.runAvailability[id(80)].reachable_step=2;state.runAvailability[id(80)].missing_inputs=[{item_id:state.items[1].id,step_order:3,deficit:1,reason:'INSUFFICIENT'}];}
   if(scenario==='refresh-failed')failRead=true;
   if(scenario==='lost-response')throw new Error('transport lost after server commit');
   if(state.runSteps.every(s=>s.status==='DONE')){state.runHistory=[{...state.runs[0],lifecycle:'COMPLETED'}];state.runs=[];}
   return {ok:true,status:200,json:async()=>({result:{run_id:id(80)}})};
  }
  if(failRead)throw new Error('read unavailable');
  return {ok:true,status:200,json:async()=>structuredClone(state)};
 };
 const hook=load('lib/bartender/use-workspace.ts',{'./model':model,'./synchronize':synchronization},{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,fetch:mockFetch,crypto,AbortController,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval});
 const Component=load('app/bartender/workspace.tsx',{'@/lib/bartender/model':model,'@/lib/bartender/use-workspace':hook},{crypto}).default;
 const click=async label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(b,label);assert.ok(!b.disabled);await act(async()=>b.click());};
 try{
  await act(async()=>root.render(React.createElement(Component,{staffId:id(999)})));
  await click('In progress');await click('Continue');await click('Complete remaining steps');
  assert.ok(document.querySelector('.work-detail'),'Workspace retained');
  assert.equal(document.querySelectorAll('.batch-checklist>li').length,4);
  assert.equal(maxActive,1,'Writes are strictly sequential');
  assert.equal(new Set(calls.map(c=>c.key)).size,calls.length,'Each step has its own retry key');
  assert.deepEqual(calls.map(c=>c.step),scenario==='complete'?[id(402),id(403),id(404)]:scenario==='rejected'?[id(402),id(403)]:[id(402)]);
  assert.match(document.body.textContent,/✓ Step 1Completed/);
  if(scenario!=='refresh-failed')assert.match(document.body.textContent,/✓ Step 2Completed/);else assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Complete remaining steps').disabled);
  if(scenario==='complete'){assert.match(document.body.textContent,/Batch completed · 1 batch added/);assert.equal(document.querySelectorAll('.batch-checklist button').length,0);}
  if(scenario==='missing'){assert.match(document.body.textContent,/Stopped at Step 3/);assert.match(document.querySelectorAll('.batch-checklist>li')[2].textContent,/Filters: 1 unit short/);}
  if(scenario==='rejected')assert.match(document.body.textContent,/Stopped: stock or this step changed/);
  if(scenario==='lost-response'){assert.match(document.body.textContent,/Retry same action/);assert.equal(JSON.parse(dom.window.sessionStorage.getItem('bartools:pending-production:'+id(999))).key,calls[0].key);}
  if(scenario==='refresh-failed')assert.match(document.body.textContent,/Could not refresh/);
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});

 test('recipe cards expose separate View Recipe and primary Start Batch actions',()=>{
 const markup=mobileMarkup('prep');const {JSDOM}=require('jsdom');const dom=new JSDOM(markup);
 for(const actions of dom.window.document.querySelectorAll('.recipe-actions')){const buttons=actions.querySelectorAll('button');assert.equal(buttons[0].textContent,'View Recipe');assert.equal(buttons[1].textContent,'Start Batch');assert.ok(buttons[0].classList.contains('secondary'));assert.ok(!buttons[1].classList.contains('secondary'));}
 assert.ok(dom.window.document.querySelectorAll('.recipe-actions').length>0);
 assert.match(mobileMarkup('multi'),/Start Batch · 1 batch/);dom.window.close();
 });

test('invalidation coalesces bursts, retains changes during reads/writes and cancels on cleanup',async()=>{
 let next,blocked=true,reads=0,finish;
 const sync=synchronization.synchronize(async()=>{reads++;await new Promise(r=>finish=r);},()=>blocked,
  fn=>{next=fn;return 1;},()=>{next=undefined;});
 const tick=async()=>{const fn=next;next=undefined;fn?.();await Promise.resolve();};
 sync.invalidate();sync.invalidate();await tick();assert.equal(reads,0);
 blocked=false;await tick();assert.equal(reads,1);
 sync.invalidate();sync.invalidate();finish();await new Promise(r=>setImmediate(r));await tick();assert.equal(reads,2);
 finish();await Promise.resolve();sync.invalidate();sync.stop();await tick();assert.equal(reads,2);
});

test('SSE preserves session privacy, subscribes only five INSERT/UPDATE tables and cleans up',async()=>{
 let registrations=[],status,removed=0;const timers=new Map();let timerId=0;
 const channel={on(kind,filter,fn){registrations.push({kind,filter,fn});return this;},subscribe(fn){status=fn;return this;}};
 let releaseRemoval,releaseDisconnect,disconnectStarted=false;
 const streamClient={channel:()=>channel,removeChannel:()=>{removed++;return new Promise(r=>releaseRemoval=r);},realtime:{disconnect(){disconnectStarted=true;return new Promise(r=>releaseDisconnect=r);}}};
 let access={kind:'staff',staff:{role:'bartender'}};let preview=true;
 const route=load('app/api/bartender/events/route.ts',{
 '@supabase/supabase-js':{createClient:()=>streamClient},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getSession:async()=>({data:{session:{access_token:'private-test-token'}}})}})},
 '@/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://preview.invalid',publishableKey:'public-test'})},
 '@/lib/auth/access':{resolveAccess:async()=>access},
 '@/lib/bartender/environment':{isBartenderPreview:()=>preview},
 },{Response,ReadableStream,TextEncoder,setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 const controller=new AbortController();const req=new NextRequest('https://preview.invalid/api/bartender/events',{signal:controller.signal});
 const response=await route.GET(req);assert.equal(response.status,200);
 assert.equal(registrations.length,10);assert.deepEqual([...new Set(registrations.map(r=>r.filter.table))].sort(),['batch_requests','batch_run_steps','batch_runs','inventory_balances','recipe_operational_settings']);
 assert.ok(registrations.every(r=>r.filter.schema==='public'&&['INSERT','UPDATE'].includes(r.filter.event)));
 const reader=response.body.getReader();const decoder=new TextDecoder();let output=decoder.decode((await reader.read()).value);
 status('SUBSCRIBED');output+=decoder.decode((await reader.read()).value);registrations[0].fn({secret:'must not cross stream'});
 // timer 1 is connection expiry; timer 2 is coalesced event
 const emit=timers.get(2);timers.delete(2);emit();output+=decoder.decode((await reader.read()).value);
 assert.equal(output,'retry: 3000\n\ndata: connected\n\ndata: stale\n\n');
 const cancellation=reader.cancel();let settled=false;cancellation.then(()=>settled=true);
 await new Promise(r=>setImmediate(r));assert.equal(disconnectStarted,false);assert.equal(settled,false);releaseRemoval();
 await new Promise(r=>setImmediate(r));assert.equal(disconnectStarted,true);assert.equal(settled,false);releaseDisconnect();await cancellation;
 assert.equal(removed,1);assert.equal(timers.size,0);
 for(const denied of [{kind:'anonymous'},{kind:'blocked'},{kind:'staff',staff:{role:'management'}}]){access=denied;assert.equal((await route.GET(req)).status,401);}
 preview=false;assert.equal((await route.GET(req)).status,403);
});

for(const terminal of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])test(`Realtime ${terminal}: cleanup permits a fresh subscription; run INSERT is coalesced and diagnostics omit rows`,async()=>{
 const logs=[],channels=[],timers=new Map();let timerId=0,removed=0,releaseAuth;
 const makeClient=()=>({
  channel(){const c={registrations:[],on(kind,filter,fn){this.registrations.push({filter,fn});return this;},subscribe(fn){this.status=fn;return this;}};channels.push(c);return c;},
  removeChannel:async()=>{removed++;},realtime:{disconnect(){}}
 });
 const route=load('app/api/bartender/events/route.ts',{
  '@supabase/supabase-js':{createClient:makeClient},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getSession:async()=>({data:{session:{access_token:'do-not-log-token'}}})}})},
  '@/lib/supabase/config':{getSupabaseConfig:()=>({url:'https://preview.invalid',publishableKey:'do-not-log-key'})},
  '@/lib/auth/access':{resolveAccess:()=>new Promise(r=>releaseAuth=()=>r({kind:'staff',staff:{role:'bartender'}}))},
  '@/lib/bartender/environment':{isBartenderPreview:()=>true},
 },{Response,ReadableStream,TextEncoder,process:{env:{BARTENDER_REALTIME_DIAGNOSTICS:'1'}},console:{info:(...v)=>logs.push(v)},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 const req=new NextRequest('https://preview.invalid/api/bartender/events');
 const pending=route.GET(req);await new Promise(r=>setImmediate(r));
 assert.equal(channels.length,0,'no subscription before verified auth');releaseAuth();const response=await pending;
 const c=channels[0];assert.ok(c.registrations.some(r=>r.filter.schema==='public'&&r.filter.table==='batch_runs'&&r.filter.event==='INSERT'));
 c.status('SUBSCRIBED');
 const insert=c.registrations.find(r=>r.filter.table==='batch_runs'&&r.filter.event==='INSERT');
 insert.fn({commit_timestamp:'2026-09-29T12:00:00Z',new:{id:id(77),password:'sensitive-row'},old:{token:'secret'}});
 c.registrations.find(r=>r.filter.table==='batch_run_steps'&&r.filter.event==='INSERT').fn({commit_timestamp:'2026-09-29T12:00:00Z',new:{id:id(78),secret:'sensitive-step'}});
 assert.equal(timers.size,2,'one expiry and one coalesced invalidation');
 const emit=[...timers.entries()].at(-1);timers.delete(emit[0]);emit[1]();c.status(terminal);
 const text=await response.text();assert.equal((text.match(/data: stale/g)||[]).length,1);
 const entries=logs.map(l=>JSON.parse(l[1]));
 assert.ok(entries.some(e=>e.phase==='status'&&e.status==='SUBSCRIBED'));
 assert.ok(entries.some(e=>e.phase==='status'&&e.status===terminal));
 assert.ok(entries.some(e=>e.phase==='database-event'&&e.table==='batch_runs'&&e.eventType==='INSERT'&&e.recordId===id(77)&&e.eventTimestamp==='2026-09-29T12:00:00.000Z'&&e.status==='SUBSCRIBED'&&Number.isFinite(Date.parse(e.receivedAt))));
 assert.ok(entries.some(e=>e.phase==='database-event'&&e.table==='batch_run_steps'&&e.recordId===id(78)&&e.eventType==='INSERT'));
 assert.doesNotMatch(JSON.stringify(logs)+text,/sensitive|do-not-log|"new"|"old"/);
 assert.equal(removed,1);assert.equal(timers.size,0);
 insert.fn({new:{}});assert.equal(timers.size,0,'closed channel cannot schedule new invalidation');
 const fresh=route.GET(req);await new Promise(r=>setImmediate(r));releaseAuth();const second=await fresh;
 channels[1].status('SUBSCRIBED');await second.body.cancel();assert.equal(removed,2);
});

test('refresh attribution starts before SSE; polling, bursts, user action and replacement generations are distinct',async()=>{
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document};globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');const root=createRoot(document.getElementById('root'));
 const logs=[],sources=[],timers=new Map(),intervals=new Map();let timerId=0,reads=0,latest,hold=false,release;
 const schedule=(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;};const cancel=id=>timers.delete(id);
 const sync=load('lib/bartender/synchronize.ts',{}, {setTimeout:schedule,clearTimeout:cancel});
 dom.window.EventSource=class {constructor(){assert.ok(sources.every(s=>s.closed),'old source closed before constructing replacement');this.handlers={};sources.push(this);}addEventListener(name,fn){this.handlers[name]=fn;}close(){this.closed=true;}};
 const hook=load('lib/bartender/use-workspace.ts',{'./model':model,'./synchronize':sync},{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,
 console:{info:(prefix,entry)=>{assert.equal(prefix,'[bartender-sync]');assert.equal(typeof entry,'string','diagnostics must survive text-only log collectors');logs.push(JSON.parse(entry));}},fetch:async()=>{reads++;const value={...fixture(),fetchedAt:'read-'+reads};if(hold){hold=false;await new Promise(r=>release=r);}return {ok:true,json:async()=>value};},
 crypto,AbortController,AbortSignal,setTimeout:schedule,clearTimeout:cancel,setInterval:(fn,ms)=>{assert.equal(ms,30000);intervals.set(++timerId,fn);return timerId;},clearInterval:id=>intervals.delete(id)});
 function Probe(){latest=hook.useWorkspace(id(100),true);return null;}
 const flush=async()=>act(async()=>{const t=[...timers.entries()].find(([,t])=>t.ms===350);if(t){timers.delete(t[0]);t[1].fn();}});
 const applied=()=>logs.filter(l=>l.phase==='refetch-applied').at(-1);
 try {
  await act(async()=>root.render(React.createElement(Probe)));assert.equal(reads,1);assert.equal(applied().causes[0].trigger,'initial-load');
  await act(async()=>[...intervals.values()][0]());await flush();assert.equal(reads,2);assert.equal(applied().causes[0].trigger,'polling','polling traces exist without any SSE handshake');
  const first=sources.at(-1);
  await act(async()=>{first.handlers.diagnostic({data:JSON.stringify({phase:'database-event',connection:id(70),status:'SUBSCRIBED',schema:'public',table:'batch_runs',eventType:'INSERT',recordId:id(71),eventTimestamp:'2026-09-29T12:00:00Z',receivedAt:'2026-09-29T12:00:01Z',secret:'never-log'})});first.onmessage({data:'stale'});first.onmessage({data:'stale'});first.onmessage({data:'stale'});});
  await flush();assert.equal(reads,3,'related signals produce one read');assert.equal(applied().causes.length,1);assert.equal(applied().causes[0].trigger,'sse-stale');assert.equal(applied().causes[0].connectionId,id(70));
  assert.ok(logs.some(l=>l.phase==='server'&&l.recordId===id(71)&&l.table==='batch_runs'));assert.ok(!JSON.stringify(logs).includes('never-log'));
  await act(async()=>{first.onmessage({data:'stale'});[...intervals.values()][0]();});await flush();assert.deepEqual(Array.from(applied().causes,c=>c.trigger).sort(),['polling','sse-stale'],'mixed causes stay explicit');
  await act(async()=>latest.refresh());assert.equal(applied().causes[0].trigger,'user-action');
  const before=reads;hold=true;
  await act(async()=>first.onmessage({data:'stale'}));await flush();assert.equal(reads,before+1);
  await act(async()=>dom.window.dispatchEvent(new dom.window.Event('online')));
  const second=sources.at(-1);assert.notEqual(first,second);assert.ok(first.closed);
  const replacementCount=sources.length;
  await act(async()=>{first.onmessage({data:'stale'});first.onerror();first.handlers.diagnostic({data:'{}'});});
  assert.equal(sources.length,replacementCount);assert.ok(!second.closed);
  await act(async()=>release());assert.ok(logs.some(l=>l.phase==='refetch-discarded'),'old-generation in-flight response cannot apply');
  await act(async()=>second.onmessage({data:'connected'}));await flush();assert.equal(applied().causes.at(-1).trigger,'reconnect-recovery');
  assert.ok(applied().causes.some(c=>c.connectionGeneration>1));
  await act(async()=>second.onerror());assert.ok(second.closed);
  await act(async()=>{const retry=[...timers.entries()].find(([,v])=>v.ms===3000);assert.ok(retry);timers.delete(retry[0]);retry[1].fn();});
  assert.equal(sources.length,replacementCount+1);assert.ok(!sources.at(-1).closed);
 }finally{await act(async()=>root.unmount());assert.ok(sources.every(s=>s.closed));assert.equal(timers.size,0);assert.equal(intervals.size,0);dom.window.close();Object.assign(globalThis,previous);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
