'use client';
import { useEffect,useRef,useState } from 'react';
import type { Availability } from '@/lib/domain/contracts';
import { amount,batches,nextStep,prepGroups,type Version } from '@/lib/bartender/model';
import { useWorkspace } from '@/lib/bartender/use-workspace';
export default function Workspace({staffId,diagnostics=false}:{staffId:string;diagnostics?:boolean}) {
 const {stale,snapshot,tab,setTab,selection,setSelection,qty,setQty,availability,setAvailability,message,busy,loading,reason,setReason,pending,refresh,act,completeRemaining,choose:chooseRecipe,selectedVersion,selectedRun}=useWorkspace(staffId,diagnostics);
 const [search,setSearch]=useState(''),[itemId,setItemId]=useState<string|null>(null);
 const choose=(v:Version)=>{setItemId(null);chooseRecipe(v);};
 const detailHeading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(selection)detailHeading.current?.focus();},[selection?.kind,selection?.id]);
 const recipeName=(v?:Version)=>snapshot?.recipes.find(r=>r.id===v?.recipe_id)?.name??'Recipe';
 const missing=(a?:Availability|null)=>a?.missing_inputs.map((m,i)=>{
  const item=snapshot?.items.find(x=>x.id===m.item_id);
  return <li key={`${m.item_id}-${i}`}>{item?.name??'Ingredient'}: {m.deficit===null?'stock count needed':`${amount(m.deficit)} ${item?.base_unit??''} short`}</li>;
 });
 const missingSummary=(a?:Availability|null)=>a?.missing_inputs.length?<div className="missing-summary"><ul>{missing({...a,missing_inputs:a.missing_inputs.slice(0,2)})}</ul>{a.missing_inputs.length>2&&<details><summary>{a.missing_inputs.length-2} more missing inputs</summary><ul>{missing({...a,missing_inputs:a.missing_inputs.slice(2)})}</ul></details>}</div>:null;
 const requirements=(v:Version,quantity:number,step?:string)=>{const inputs=snapshot?.requirements.filter(r=>r.recipe_version_id===v.id&&(step===undefined||r.step_id===step))??[];return inputs.length?<ul className="ingredients">{inputs.map(r=>{
  const item=snapshot?.items.find(i=>i.id===r.item_id);return <li key={r.id}>{amount(Number(r.quantity_per_batch)*quantity)} {item?.base_unit} · {item?.name??'Ingredient'}</li>;
 })}</ul>:null;};
 const card=(a:Availability)=>{
  const v=snapshot?.versions.find(v=>v.id===a.recipe_version_id);if(!v)return null;
  const reachable=snapshot?.steps.find(s=>s.recipe_version_id===v.id&&s.step_order===a.reachable_step);
  return <article className="work-card prep-row" key={v.id}><div className="row-copy"><h3>{recipeName(v)}</h3>
   <p>{a.current_batch_stock===null?'Stock count needed':`${batches(a.current_batch_stock)} in stock`}</p>
   {a.can_complete?<p>Can make {batches(a.selected_batch_quantity)}{a.max_full_batches!==null?` · ${a.max_full_batches} full batches possible`:''}</p>:a.can_start?<p>Can complete through {reachable?.name??`step ${a.reachable_step}`}</p>:<p>Not available to make yet</p>}
   {a.missing_inputs.length>0&&<details className="row-missing"><summary>Missing{a.can_start?' later':''}: {snapshot?.items.find(i=>i.id===a.missing_inputs[0].item_id)?.name??'Ingredient'}{a.missing_inputs.length>1?` +${a.missing_inputs.length-1}`:''}</summary>{missingSummary(a)}</details>}
   </div><div className="recipe-actions"><button className="secondary" onClick={()=>choose(v)}>View Recipe</button><button disabled={busy||pending!==null||stale||!(a.can_complete||a.can_start)} onClick={()=>choose(v)}>Start Batch</button></div></article>;
 };
 const groups=snapshot?prepGroups(snapshot):null;
 const detailVersion=selectedVersion??snapshot?.versions.find(v=>v.id===selectedRun?.recipe_version_id);
 const runAvailable=selectedRun?snapshot?.runAvailability[selectedRun.id]:null;
 const next=selectedRun&&snapshot?nextStep(snapshot,selectedRun):null;
 const locked=busy||pending!==null||stale;
 return <>
  <nav className="work-tabs" aria-label="Workspace sections">{['Today','Prep','In progress','Batch Stock','Inventory'].map(t=><button key={t} disabled={busy} aria-current={tab===t?'page':undefined} onClick={()=>{setTab(t);setSelection(null);setItemId(null);}}>{t}</button>)}</nav>
  {snapshot&&<section className="element-search"><label>Find an item or recipe<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tequila, garnish, recipe…"/></label>{search.trim()&&<ul>{(snapshot.inventory??[]).filter(i=>i.name.toLowerCase().includes(search.trim().toLowerCase())).map(i=><li key={i.id}><button className="secondary" onClick={()=>{setItemId(i.id);setSelection(null);setSearch('');}}>{i.name} · Inventory</button></li>)}{(snapshot.menu??[]).filter(m=>m.name.toLowerCase().includes(search.trim().toLowerCase())).map(m=><li key={m.id}><button className="secondary" onClick={()=>{setItemId(m.id);setSelection(null);setSearch('');}}>{m.name} · Menu item</button></li>)}{snapshot.overview.filter(a=>recipeName(snapshot.versions.find(v=>v.id===a.recipe_version_id)).toLowerCase().includes(search.trim().toLowerCase())).map(a=><li key={a.recipe_version_id}><button className="secondary" onClick={()=>{setItemId(null);setSearch('');choose(snapshot.versions.find(v=>v.id===a.recipe_version_id)!);}}>{recipeName(snapshot.versions.find(v=>v.id===a.recipe_version_id))} · Batch recipe</button></li>)}</ul>}</section>}
  {snapshot&&itemId&&(()=>{const i=snapshot.inventory?.find(i=>i.id===itemId);const menu=snapshot.menu?.find(m=>m.id===itemId);return menu?<section className="work-detail" aria-label="Menu item details"><button className="secondary" onClick={()=>setItemId(null)}>Close item</button><h2>{menu.name}</h2><p>{menu.configured?'Published serving':'Serving not configured'}</p><ul>{menu.ingredients.map((r,n)=><li key={n}>{amount(r.quantity)} {r.unit} · {r.name}</li>)}</ul><p>Service and garnish details unavailable. Live serving availability is not provided by the current API.</p></section>:i?<section className="work-detail" aria-label="Inventory details"><button className="secondary" onClick={()=>setItemId(null)}>Close item</button><h2>{i.name}</h2><p>Raw inventory · theoretical stock</p><strong>{i.quantity===null?'Not counted':`${amount(i.quantity)} ${i.unit}`}</strong><p>{i.quantity===null?'Stock availability unknown':i.quantity<=0?'Unavailable stock':'Counted stock'}</p><p>Threshold and storage location unavailable.</p><h3>Used in</h3>{snapshot.versions.filter(v=>snapshot.requirements.some(r=>r.recipe_version_id===v.id&&r.item_id===i.id)).map(v=><button key={v.id} className="secondary" onClick={()=>{setItemId(null);choose(v);}}>{recipeName(v)}</button>)}</section>:null;})()}
  <div className="work-toolbar"><small>Stock updates automatically</small>{stale&&<button className="secondary" disabled={busy} onClick={()=>void refresh()}>Retry connection</button>}</div>
  {message&&<p role="status" className="notice">{message}</p>}
  {busy&&<p role="status" className="saving">Saving… Please wait.</p>}
  {pending&&!busy&&<div className="notice"><p>An action needs confirmation. Retry this exact action before starting another.</p><button disabled={busy} onClick={()=>void act(pending)}>Retry same action</button></div>}
  {loading&&<p role="status">Loading recipes and stock…</p>}
  {!loading&&!snapshot&&<p>Workspace unavailable. Reconnecting automatically.</p>}
  {snapshot&&selection&&detailVersion?<section className="work-detail" aria-label="Recipe details">
   <button className="secondary" disabled={busy} onClick={()=>setSelection(null)}>Back to {tab}</button>
   <h2 ref={detailHeading} tabIndex={-1} className="detail-heading">{recipeName(detailVersion)}</h2><small>{detailVersion.production_mode==='SIMPLE'?'Simple batch':'Multistep batch'}</small>
   {selectedVersion?<>
    <fieldset disabled={locked}><legend>Batch quantity</legend><div className="quantity-options">{snapshot.overview.find(a=>a.recipe_version_id===selectedVersion.id)?.allowed_batch_sizes.slice(0,4).map(n=><button key={n} aria-pressed={qty===String(n)} onClick={()=>{setAvailability(null);setQty(String(n));}}>{n}</button>)}</div>{(snapshot.overview.find(a=>a.recipe_version_id===selectedVersion.id)?.allowed_batch_sizes.length??0)>4&&<details className="more-quantities"><summary>More batch sizes · {qty} selected</summary><div className="quantity-options">{snapshot.overview.find(a=>a.recipe_version_id===selectedVersion.id)?.allowed_batch_sizes.slice(4).map(n=><button key={n} aria-pressed={qty===String(n)} onClick={()=>{setAvailability(null);setQty(String(n));}}>{n}</button>)}</div></details>}</fieldset>
    {detailVersion.production_mode==='SIMPLE'&&<>{requirements(detailVersion,Number(qty))}{snapshot.steps.filter(s=>s.recipe_version_id===detailVersion.id&&s.instructions).map(s=><p key={s.id}>{s.instructions}</p>)}</>}
    {detailVersion.production_mode==='MULTISTEP'&&<ol className="recipe-preview-steps">{snapshot.steps.filter(s=>s.recipe_version_id===detailVersion.id).sort((a,b)=>a.step_order-b.step_order).map(s=><li key={s.id}><details><summary>{s.name}</summary>{s.instructions&&<p>{s.instructions}</p>}{requirements(detailVersion,Number(qty),s.id)}</details></li>)}</ol>}
    {!availability?<p role="status">Checking selected quantity…</p>:<>
     {availability.current_batch_stock===null&&<p className="notice">Ask management to initialize Batch Stock before production.</p>}
     {availability.missing_inputs.length>0&&<div className="notice"><strong>{availability.can_start&&!availability.can_complete?'Missing later':'Missing inputs'}</strong>{missingSummary(availability)}</div>}
     {snapshot.requests.filter(q=>q.state==='OPEN'&&q.recipe_id===detailVersion.recipe_id).map(q=><p key={q.request_id}>Management needs {batches(q.remaining)} more. Production links automatically; any excess remains in Batch Stock.</p>)}
     <p>{detailVersion.production_mode==='SIMPLE'?'Confirm when prepared. Ingredients and stock update together.':'Quantity is fixed after starting. Complete each step as you work.'}</p>
     <button className="primary-action" disabled={locked||!(detailVersion.production_mode==='SIMPLE'?availability.can_complete:availability.can_start)} onClick={()=>void act({kind:detailVersion.production_mode==='SIMPLE'?'simple':'start',version:detailVersion.id,batches:qty,key:crypto.randomUUID()})}>{`Start Batch · ${batches(Number(qty))}`}</button>
    </>}
   </>:selectedRun?<>
    <p>{batches(selectedRun.batch_quantity)} · {selectedRun.lifecycle==='BLOCKED'?`Waiting: ${snapshot.blockers[selectedRun.id]??'Paused work'}`:selectedRun.lifecycle==='COMPLETED'?'Batch completed':selectedRun.lifecycle==='ABANDONED'?'Work ended':'In progress'}</p>
    {selectedRun.request_id&&<p>Linked automatically to a management request.</p>}
    <details className="recipe-ingredients"><summary>Ingredients</summary>{requirements(detailVersion,selectedRun.batch_quantity)}</details>
    <h3>Steps</h3>
    <ol className="batch-checklist">{snapshot.steps.filter(s=>s.recipe_version_id===detailVersion.id).sort((a,b)=>a.step_order-b.step_order).map(step=>{
     const record=snapshot.runSteps.find(s=>s.batch_run_id===selectedRun.id&&s.recipe_step_id===step.id);
     const done=record?.status==='DONE',isNext=next?.step.id===step.id;
     const stepMissing=runAvailable?{...runAvailable,missing_inputs:runAvailable.missing_inputs.filter(m=>m.step_order===step.step_order)}:null;
     return <li key={step.id} className={done?'step-done':isNext?'step-next':'step-later'}>
      <div className="checklist-line">
       <details className="step-details"><summary><span>{done?'✓ ':''}{step.name}</span><small>{done?'Completed':stepMissing?.missing_inputs.length?'Missing inputs':isNext?'Next':''}</small></summary>
        {step.instructions&&<p>{step.instructions}</p>}
        {requirements(detailVersion,selectedRun.batch_quantity,step.id)}
        {!done&&stepMissing?.missing_inputs.length?<div className="step-missing">{missingSummary(stepMissing)}</div>:null}
       </details>
       {!done&&isNext&&selectedRun.lifecycle==='IN_PROGRESS'&&<button className="secondary" disabled={locked||!record||!runAvailable||runAvailable.reachable_step<step.step_order} onClick={()=>{if(record)void act({kind:'step',run:selectedRun.id,step:record.id,key:crypto.randomUUID()});}}>Complete {step.name}</button>}
      </div>
     </li>;
    })}</ol>
    {selectedRun.lifecycle==='COMPLETED'?<p role="status" className="notice">Batch completed · {batches(selectedRun.batch_quantity)} added to Batch Stock.</p>:selectedRun.lifecycle==='BLOCKED'?<button className="primary-action" disabled={locked} onClick={()=>void act({kind:'resume',run:selectedRun.id,reason:'',key:crypto.randomUUID()})}>Resume work</button>:selectedRun.lifecycle==='IN_PROGRESS'?<>

     <button className="primary-action" disabled={locked||!next||!runAvailable||runAvailable.reachable_step<next.step.step_order} onClick={()=>void completeRemaining()}>Complete remaining steps</button>
     <p>Confirm when prepared · adds {batches(selectedRun.batch_quantity)} to stock.</p>
     <details className="stopper-details"><summary>Can't continue?</summary><label className="block-reason">Reason<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} placeholder="e.g. waiting for filters" autoComplete="off" enterKeyHint="done" disabled={locked}/></label>
     <button className="secondary" disabled={locked||!reason.trim()} onClick={()=>void act({kind:'block',run:selectedRun.id,reason:reason.trim(),key:crypto.randomUUID()})}>Can't continue</button>
     </details>
    </>:null}
   </>:<p>This run has finished. Return to Batch Stock.</p>}
  </section>:snapshot&&<>
   {selection?.kind==='run'&&!selectedRun&&<p role="status">This run is no longer in progress. Check Batch Stock.</p>}
   {(tab==='Today'||tab==='Prep')&&<>
    {tab==='Today'&&<section className="rush-section"><h2>Out now</h2><ol>{(snapshot.inventory??[]).filter(i=>i.quantity!==null&&i.quantity<=0).map(i=><li key={i.id}><button className="secondary" onClick={()=>setItemId(i.id)}>{i.name} · {amount(i.quantity!)} {i.unit}</button></li>)}</ol>{!(snapshot.inventory??[]).some(i=>i.quantity!==null&&i.quantity<=0)&&<p>No known stockouts. Uncounted stock remains unknown.</p>}</section>}
    <section className={snapshot.requests.some(q=>q.state==='OPEN')?'request-section':'empty-section'}><h2>Requests</h2>{snapshot.requests.filter(q=>q.state==='OPEN').length===0?<p>No open management requests.</p>:<div className="work-grid">{snapshot.requests.filter(q=>q.state==='OPEN').map(q=>{
     const v=snapshot.versions.find(v=>v.recipe_id===q.recipe_id&&snapshot.overview.some(a=>a.recipe_version_id===v.id));
     return <article className="work-card prep-row" key={q.request_id}><div className="row-copy"><h3>{snapshot.recipes.find(r=>r.id===q.recipe_id)?.name??'Recipe'}</h3><p className="request-remaining">{batches(q.remaining)} remaining</p><details><summary>Request details</summary><dl className="request-totals"><div><dt>Requested</dt><dd>{batches(q.requested)}</dd></div><div><dt>Fulfilled</dt><dd>{batches(q.fulfilled)}</dd></div></dl></details>{q.in_progress>0&&<p>{batches(q.in_progress)} underway</p>}</div><div className="request-actions">{v?<button onClick={()=>choose(v)}>Start Batch</button>:<p>Recipe unavailable</p>}</div></article>;
    })}</div>}</section>
    {([['Suggested to prep',groups!.suggested,'No low-stock suggestions.'],['Ready to make',groups!.ready.filter(a=>!a.should_prep),groups!.suggested.some(a=>a.can_complete)?'See low-stock recipes above.':'No recipes can be completed with current stock.'],['Can start',groups!.start.filter(a=>!a.should_prep),groups!.suggested.some(a=>a.can_start&&!a.can_complete)?'See low-stock recipes above.':'No partial multistep work available.'],['Other recipes',groups!.unavailable,'']] as const).filter(([title])=>tab==='Prep'||title==='Suggested to prep').map(([title,list,empty])=><section key={title} className={list.length?undefined:'empty-section'}><h2>{title}</h2>{title==='Suggested to prep'&&list.length>0&&<p>Low stock — prepare these soon.</p>}{title==='Ready to make'&&list.length>0&&<p>Enough ingredients to finish.</p>}{title==='Can start'&&list.length>0&&<p>Start now; later steps need more ingredients.</p>}{list.length?<div className="work-grid"> {list.map(card)}</div>:empty&&<p>{empty}</p>}</section>)}
   </>}
   {tab==='Inventory'&&<section><h2>Raw inventory</h2><p>Read-only · categories and storage locations are not available in this view.</p><ol className="inventory-list">{(snapshot.inventory??[]).map(i=><li key={i.id}><button className="secondary" onClick={()=>setItemId(i.id)}><span>{i.name}</span><strong>{i.quantity===null?'Not counted':`${amount(i.quantity)} ${i.unit}`}</strong></button></li>)}</ol></section>}
   {tab==='In progress' &&<section><h2>In progress</h2>{snapshot.runs.length===0?<p>No work underway.</p>:<div className="work-grid">{snapshot.runs.map(run=>{const n=nextStep(snapshot,run);return <article className="work-card" key={run.id}><h3>{recipeName(snapshot.versions.find(v=>v.id===run.recipe_version_id))}</h3><p>{batches(run.batch_quantity)} · Next: {n?.step.name??'Review work'}</p>{run.lifecycle==='BLOCKED'&&<p>Waiting: {snapshot.blockers[run.id]??'Paused work'}</p>}{missingSummary(snapshot.runAvailability[run.id])}<button onClick={()=>{setSelection({kind:'run',id:run.id});setReason('');}}>Continue</button></article>;})}</div>}</section>}
   {tab==='Batch Stock'&&<section><h2>Batch Stock</h2>{snapshot.stock.length===0?<p>No published Batch Stock yet.</p>:<div className="work-grid">{snapshot.stock.map(s=>{const low=snapshot.overview.some(a=>a.should_prep===true&&snapshot.versions.find(v=>v.id===a.recipe_version_id)?.stock_identity_id===s.id);return <article className="work-card stock-row" key={s.id}><div><h3>{s.name}</h3>{low&&<span className="low-stock">Low stock · prep suggested</span>}</div><p className="stock-quantity">{s.quantity===null?'Stock count needed':batches(s.quantity)}</p></article>;})}</div>}</section>}
  </>}
  <aside className="demo-disabled"><h2>Preview demo</h2><p>Sales simulation is not enabled. A separately authorized demo operator is required.</p><button disabled>Simulate sales</button> <button disabled className="secondary">Reset demo</button></aside>
 </>;
}
