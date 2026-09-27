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
   state.fetchedAt=crypto.randomUUID();if(loseAfterCommit)throw new Error('response lost after commit');return {ok:true,status:200,json:async()=>({result:{}})};
  }
  const parsed=new URL(url,'http://localhost');const version=parsed.searchParams.get('version');
  if(version&&holdAvailability)await new Promise(resolve=>{releaseAvailability=resolve;});
  return {ok:true,status:200,json:async()=>structuredClone(version?{...state.overview.find(a=>a.recipe_version_id===version),selected_batch_quantity:Number(parsed.searchParams.get('batches'))}:state)};
 };
 const hook=load('lib/bartender/use-workspace.ts',{'./model':model},{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,fetch:mockFetch,crypto,AbortController,AbortSignal,setInterval,clearInterval});
 const Component=load('app/bartender/workspace.tsx',{'@/lib/bartender/model':model,'@/lib/bartender/use-workspace':hook},{crypto}).default;
 const text=()=>document.body.textContent;
 const click=async(label)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label);assert.ok(!button.disabled,label+' enabled');await act(async()=>button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};
 try{
  await act(async()=>root.render(React.createElement(Component,{staffId:id(100)})));
  assert.match(text(),/Requested1 batch/);assert.match(text(),/Fulfilled0.5 batches/);assert.match(text(),/Suggested to prep/);assert.match(text(),/Can complete through Clarify/);assert.match(text(),/Filters: 1 unit short/);assert.ok(!text().includes('ledger'));
  assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Simulate sales').disabled);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Reset demo').disabled);
  assert.equal([...document.querySelectorAll('h3')].filter(h=>h.textContent==='Margarita').length,2,'No duplicate low-stock recipe in Ready to make');
  await click('Prepare');assert.equal(document.querySelector('.quantity-options').children.length,4);assert.ok(document.querySelector('.more-quantities'));assert.match(text(),/any excess remains in Batch Stock/);assert.match(text(),/250 ml · Tequila/);await click('1');
  holdAvailability=true;state.fetchedAt='background-refresh';await click('Refresh');
  assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Confirm production · 1 batch'&&!b.disabled),'Background refresh preserves the current selection action');
  holdAvailability=false;await act(async()=>releaseAvailability());
  await click('Confirm production · 1 batch');assert.equal(calls.at(-1).batches,'1');assert.equal(state.stock[0].quantity,1.24);
  await click('Batch Stock');assert.match(text(),/1.24 batches/);await click('Prep');assert.match(text(),/No open management requests/);
  // External stock consumption appears on refresh; UI does not write balances.
  state.stock[0].quantity=.2;state.overview[0].current_batch_stock=.2;state.overview[0].should_prep=true;state.fetchedAt='external-sale';
  await click('Refresh');const suggestions=[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Suggested to prep');assert.match(suggestions.textContent,/Margarita/);assert.match(suggestions.textContent,/0.2 batches in stock/);
  const startSection=[...document.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Can start');await act(async()=>startSection.querySelector('button').click());await click('Start · 0.5 batches');await click('In progress');await click('Continue');await click('Complete Clarify');await click('Continue');assert.equal(document.querySelector('.step-done details').open,false);assert.equal(document.querySelector('.step-next details').open,true);assert.match(text(),/✓ Completed · Clarify/);assert.match(text(),/Next · Filter/);
  // A fresh bartender mounts the same shared run and can operate it.
  await act(async()=>root.render(React.createElement(Component,{staffId:id(101),key:'second'})));await click('In progress');await click('Continue');
  const input=document.querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Waiting for filters');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await click('Pause with reason');await click('Continue');assert.match(text(),/Waiting: Waiting for filters/);await click('Resume work');assert.equal(calls.at(-1).kind,'resume');
  await click('Continue');loseResponse=true;await click('Complete Filter');assert.match(text(),/Retry same action/);const key=calls.at(-1).key;await click('Retry same action');assert.equal(calls.at(-1).key,key);assert.equal(dom.window.sessionStorage.getItem('bartools:pending-production:'+id(101)),null);
  assert.equal(calls.some(c=>'actor' in c||'request' in c),false);
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
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
test('mobile collapses completed steps, exposes next step and keeps blocked action unambiguous',()=>{const run=mobileMarkup('run'),blocked=mobileMarkup('blocked');assert.match(run,/step-done"><details>/);assert.match(run,/step-next"><details open=""/);assert.match(blocked,/Resume work/);assert.ok(!blocked.includes('Complete Filter'));});
test('mobile long missing lists remain expandable and forms avoid physical quantity input',()=>{const missing=mobileMarkup('missing'),run=mobileMarkup('run');assert.match(missing,/6 more missing inputs/);assert.match(missing,/ExtraLongIngredientName/);assert.ok(!missing.includes('<input'));assert.match(run,/enterKeyHint="done"/);assert.match(mobileMarkup('changed'),/Stock or this step changed/);});
