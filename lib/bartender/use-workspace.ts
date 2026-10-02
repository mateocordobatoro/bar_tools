'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { synchronize } from './synchronize';
import type { Availability } from '@/lib/domain/contracts';
import { nextStep,parseCommand,type Command,type Snapshot,type Version } from './model';
type Trigger='initial-load'|'sse-stale'|'polling'|'user-action'|'reconnect-recovery';
type Cause={trigger:Trigger;connectionGeneration?:number;connectionId?:string};
type Selection={kind:'recipe';id:string}|{kind:'run';id:string};
const storageKey='bartools:pending-production:';
export function useWorkspace(staffId:string,diagnostics=false) {
 const [stale,setStale]=useState(false);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [tab,setTab]=useState('Today');const [selection,setSelection]=useState<Selection|null>(null);
 const [qty,setQty]=useState('');const [availability,setAvailability]=useState<Availability|null>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
 const [reason,setReason]=useState('');const [pending,setPending]=useState<Command|null>(null);
 const completing=useRef(false);const [completingRemaining,setCompletingRemaining]=useState(false);
 const readSequence=useRef(0);const reading=useRef(false);const writing=useRef(false);const detailSequence=useRef(0);
 const connectionGeneration=useRef(0);
 const causes=useRef(new Map<string,Cause>());
 const appliedCauses=useRef<Cause[]>([]);
 const detailKey=useRef('');
 const trace=useCallback((phase:string,details:Record<string,unknown>={})=>{
  if(diagnostics)console.info('[bartender-sync]',JSON.stringify({phase,timestamp:new Date().toISOString(),...details}));
 },[diagnostics]);
 const redirect=useCallback((body:{redirect?:string})=>{if(body.redirect)window.location.assign(body.redirect);},[]);
 const refresh=useCallback(async(force=false,attribution:Cause[]=[{trigger:'user-action'}])=>{
  const current=()=>attribution.filter(c=>c.connectionGeneration===undefined||c.connectionGeneration===connectionGeneration.current);
  if(!current().length)return;
  if(reading.current&&!force){trace('refetch-skipped',{causes:attribution,reason:'read-in-flight'});return;}
  reading.current=true;const generation=++readSequence.current;
  trace('refetch-start',{resource:'workspace',generation,causes:attribution});
  try {const response=await fetch('/api/bartender',{cache:'no-store',signal:AbortSignal.timeout(15000)});const body=await response.json();
   // A read launched by an obsolete SSE source must not apply data or redirect.
   if(generation!==readSequence.current||!current().length){trace('refetch-discarded',{generation,causes:attribution});return;}
   redirect(body);if(!response.ok)throw new Error();
   appliedCauses.current=attribution;setSnapshot(body);setStale(false);
   trace('refetch-applied',{resource:'workspace',generation,causes:attribution});return body as Snapshot;
  }catch{if(generation===readSequence.current&&current().length){setStale(true);setMessage('Could not refresh the workspace. Check your connection and retry.');trace('refetch-failed',{generation,causes:attribution});}}
  finally{if(generation===readSequence.current){reading.current=false;setLoading(false);}}
 },[redirect,trace]);
 useEffect(()=>{
  try {const saved=sessionStorage.getItem(storageKey+staffId);if(saved)setPending(parseCommand(JSON.parse(saved)));}catch{setMessage('Pending action could not be restored. Check work and stock before producing again.');}
  void refresh(false,[{trigger:'initial-load'}]);
  causes.current.clear();
  const sync=synchronize(()=>{
   const attribution=[...causes.current.values()].filter(c=>c.connectionGeneration===undefined||c.connectionGeneration===connectionGeneration.current);
   causes.current.clear();return refresh(false,attribution);
  },()=>reading.current||writing.current||completing.current);
  const invalidate=(cause:Cause)=>{
   causes.current.set(`${cause.trigger}:${cause.connectionGeneration??''}`,cause);
   trace('invalidate',{...cause});sync.invalidate();
  };
  let events:EventSource|null=null;
  let reconnect:ReturnType<typeof setTimeout>|undefined;let delay=3000;let disposed=false;let attempts=0;
  const close=()=>{
   const previous=events;events=null; // revoke authority before synchronous EventSource.close()
   if(previous){previous.close();trace('disconnect-settled',{connectionGeneration:connectionGeneration.current});connectionGeneration.current++;}
  };
  const connect=()=>{
   if(disposed||events)return;
   clearTimeout(reconnect);
   if(document.visibilityState!=='hidden'&&typeof window.EventSource==='function') {
    if(connectionGeneration.current===0)connectionGeneration.current=1;
    const generation=connectionGeneration.current;
    const replacement=attempts++>0;let connected=false;
    const source=new window.EventSource('/api/bartender/events');events=source;
    let connectionId:string|undefined;
    const isCurrent=()=>!disposed&&events===source&&generation===connectionGeneration.current;
    const cause=(trigger:Trigger):Cause=>({trigger,connectionGeneration:generation,...(connectionId?{connectionId}:{})});
    trace('connect',{connectionGeneration:generation});
    source.addEventListener('diagnostic',event=>{
     if(!isCurrent()||!diagnostics)return;
     try {
      const d=JSON.parse((event as MessageEvent).data);
      const uuid=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      const timestamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
      if(!['subscribe','status','cleanup','database-event','invalidation'].includes(d.phase)||!uuid(d.connection))return;
      connectionId=d.connection;
      trace('server',{phaseName:d.phase,connectionGeneration:generation,connectionId,
       receivedAt:timestamp(d.receivedAt),
       ...(['CONNECTING','SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(d.status)?{status:d.status}:{}),
       ...(d.schema==='public'&&['batch_requests','batch_runs','batch_run_steps','inventory_balances','recipe_operational_settings'].includes(d.table)&&['INSERT','UPDATE'].includes(d.eventType)?{schema:'public',table:d.table,eventType:d.eventType,recordId:uuid(d.recordId)?d.recordId:null,eventTimestamp:timestamp(d.eventTimestamp)}:{})});
     }catch{ /* Ignore malformed diagnostics, never print the raw body. */ }
    });
    source.onmessage=event=>{
     if(!isCurrent()||!['connected','stale'].includes(event.data))return;
     delay=3000;
     if(event.data==='stale')invalidate(cause('sse-stale'));
     else if(!connected){
      connected=true;
      // Initial subscription closes the initial-read/subscribe gap without claiming a reconnect.
      invalidate(cause(replacement?'reconnect-recovery':'initial-load'));
     }
    };
    source.onerror=()=>{
     if(!isCurrent())return;
     close();trace('reconnect-scheduled',{delay,connectionGeneration:generation});
     reconnect=setTimeout(connect,delay);delay=Math.min(delay*2,30000);
    };
   }
  };
  connect();
  // Remains active while SSE is healthy; independent attribution begins at page load.
  const timer=setInterval(()=>{if(document.visibilityState!=='hidden')invalidate({trigger:'polling'});},30000);
  // Visibility/online notifications must not replace a healthy source.
  const visible=()=>{if(document.visibilityState!=='hidden')connect();};
  const online=()=>{connect();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',online);
  return()=>{trace('cleanup');disposed=true;clearTimeout(reconnect);close();sync.stop();causes.current.clear();++readSequence.current;reading.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online);};
 },[refresh,staffId,trace,diagnostics]);
 const selectedVersion=selection?.kind==='recipe'?snapshot?.versions.find(v=>v.id===selection.id):undefined;
 const selectedRun=selection?.kind==='run'?snapshot?.runs.find(r=>r.id===selection.id)??snapshot?.runHistory?.find(r=>r.id===selection.id):undefined;
 useEffect(()=>{
  const generation=++detailSequence.current;
  // Keep the same selection stable during background refresh; every write still
  // revalidates inventory server-side. A different selection clears immediately.
  setAvailability(previous=>previous?.recipe_version_id===selectedVersion?.id&&Number(previous?.selected_batch_quantity)===Number(qty)?previous:null);
  const key=`${selectedVersion?.id??''}:${qty}`;
  const attribution:Cause[]=detailKey.current===key&&appliedCauses.current.length?appliedCauses.current:[{trigger:'user-action'}];
  detailKey.current=key;
  if(!selectedVersion||!qty)return;
  const current=()=>generation===detailSequence.current&&attribution.some(c=>c.connectionGeneration===undefined||c.connectionGeneration===connectionGeneration.current);
  trace('refetch-start',{resource:'availability',generation,causes:attribution});
  const controller=new AbortController();
  void fetch(`/api/bartender?version=${encodeURIComponent(selectedVersion.id)}&batches=${encodeURIComponent(qty)}`,{cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!current())return;redirect(body);if(!response.ok)throw new Error();setAvailability(body);trace('refetch-applied',{resource:'availability',generation,causes:attribution});})
   .catch(()=>{if(!controller.signal.aborted&&current())setMessage('Could not check this batch size. Refresh and try again.');});
  return()=>controller.abort();
 },[selectedVersion?.id,qty,snapshot?.fetchedAt,redirect,trace]); // Refresh after every stock snapshot.
 // One real operation at a time. Never optimistically mark a step done.
 const execute=async(command:Command):Promise<{ok:boolean;fresh?:Snapshot}>=>{
  if(writing.current)return {ok:false};
  try {sessionStorage.setItem(storageKey+staffId,JSON.stringify(command));}catch{setMessage('Private session storage is unavailable. Enable it before producing.');return {ok:false};}
  writing.current=true;setBusy(true);setPending(command);setMessage('');
  let ok=false;
  try {
   const response=await fetch('/api/bartender',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
   const body=await response.json();redirect(body);
   if(response.ok||response.status===409||response.status===400){sessionStorage.removeItem(storageKey+staffId);setPending(null);}
   if(!response.ok){setMessage(response.status===409?'Stopped: stock or this step changed. Review the refreshed checklist and missing inputs.':body.message??'Your access changed. Sign in again.');}
   else {
    ok=true;
    setMessage(command.kind==='simple'?'Batch completed. Batch Stock and request fulfillment updated.':'Work updated.');
    if(command.kind==='simple')setSelection(null);
    if(command.kind==='start'&&typeof body.result?.run_id==='string')setSelection({kind:'run',id:body.result.run_id});
    setReason('');
   }
  }catch{setMessage('Result not confirmed. Retry the same action; it will not duplicate production.');}
  const fresh=await refresh(true);
  writing.current=false;setBusy(false);
  return {ok,fresh};
 };
 const act=async(command:Command)=>{if(!completing.current)await execute(command);};
 const completeRemaining=async()=>{
  if(completing.current||writing.current||pending||!selectedRun)return;
  const runId=selectedRun.id;
  completing.current=true;setCompletingRemaining(true);
  try {
   let fresh=await refresh(true);
   while(fresh){
    const run=fresh.runs.find(r=>r.id===runId);
    if(!run){
     setMessage(fresh.runHistory?.some(r=>r.id===runId&&r.lifecycle==='COMPLETED')?'Batch completed. Batch Stock updated.':'This work is no longer available. Review its current state.');break;
    }
    if(run.lifecycle!=='IN_PROGRESS'){setMessage('Work is paused. Resume when you can continue.');break;}
    const next=nextStep(fresh,run),available=fresh.runAvailability[runId];
    if(!next?.record||!available){setMessage('Stopped: current steps could not be verified. Refresh before continuing.');break;}
    if(available.reachable_step<next.step.step_order){setMessage(`Stopped at ${next.step.name}. Check the missing inputs below.`);break;}
    const outcome=await execute({kind:'step',run:runId,step:next.record.id,key:crypto.randomUUID()});
    if(!outcome.ok||!outcome.fresh)break;
    // A stale/incomplete read must never trigger another completion for this step.
    if(outcome.fresh.runSteps.find(s=>s.id===next.record!.id)?.status!=='DONE'){
     setMessage('Stopped: step completion could not be verified. Refresh before continuing.');break;
    }
    fresh=outcome.fresh;
   }
  }finally{completing.current=false;setCompletingRemaining(false);}
 };
 const choose=(v:Version)=>{setSelection({kind:'recipe',id:v.id});setAvailability(null);setQty(String(snapshot?.overview.find(a=>a.recipe_version_id===v.id)?.allowed_batch_sizes[0]??''));setMessage('');};
 return {stale,snapshot,tab,setTab,selection,setSelection,qty,setQty,availability,setAvailability,message,setMessage,busy:busy||completingRemaining,loading,reason,setReason,pending,refresh,act,completeRemaining,choose,selectedVersion,selectedRun};
}
