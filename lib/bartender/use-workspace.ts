'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { Availability } from '@/lib/domain/contracts';
import { nextStep,parseCommand,type Command,type Snapshot,type Version } from './model';
type Selection={kind:'recipe';id:string}|{kind:'run';id:string};
const storageKey='bartools:pending-production:';
export function useWorkspace(staffId:string) {
 const [stale,setStale]=useState(false);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [tab,setTab]=useState('Prep');const [selection,setSelection]=useState<Selection|null>(null);
 const [qty,setQty]=useState('');const [availability,setAvailability]=useState<Availability|null>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
 const [reason,setReason]=useState('');const [pending,setPending]=useState<Command|null>(null);
 const completing=useRef(false);const [completingRemaining,setCompletingRemaining]=useState(false);
 const readSequence=useRef(0);const reading=useRef(false);const writing=useRef(false);const detailSequence=useRef(0);
 const redirect=useCallback((body:{redirect?:string})=>{if(body.redirect)window.location.assign(body.redirect);},[]);
 const refresh=useCallback(async(force=false)=>{
  if(reading.current&&!force)return;reading.current=true;const generation=++readSequence.current;
  try {const response=await fetch('/api/bartender',{cache:'no-store',signal:AbortSignal.timeout(15000)});const body=await response.json();redirect(body);
   if(!response.ok)throw new Error();if(generation===readSequence.current){setSnapshot(body);setStale(false);}return body as Snapshot;
  }catch{setStale(true);setMessage('Could not refresh the workspace. Check your connection and retry.');}
  finally{reading.current=false;setLoading(false);}
 },[redirect]);
 useEffect(()=>{
  try {const saved=sessionStorage.getItem(storageKey+staffId);if(saved)setPending(parseCommand(JSON.parse(saved)));}catch{setMessage('Pending action could not be restored. Check work and stock before producing again.');}
  void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!writing.current&&!completing.current)void refresh();},10000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[refresh,staffId]);
 const selectedVersion=selection?.kind==='recipe'?snapshot?.versions.find(v=>v.id===selection.id):undefined;
 const selectedRun=selection?.kind==='run'?snapshot?.runs.find(r=>r.id===selection.id)??snapshot?.runHistory?.find(r=>r.id===selection.id):undefined;
 useEffect(()=>{
  const generation=++detailSequence.current;
  // Keep the same selection stable during background refresh; every write still
  // revalidates inventory server-side. A different selection clears immediately.
  setAvailability(previous=>previous?.recipe_version_id===selectedVersion?.id&&Number(previous?.selected_batch_quantity)===Number(qty)?previous:null);
  if(!selectedVersion||!qty)return;
  const controller=new AbortController();
  void fetch(`/api/bartender?version=${encodeURIComponent(selectedVersion.id)}&batches=${encodeURIComponent(qty)}`,{cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();redirect(body);if(!response.ok)throw new Error();if(generation===detailSequence.current)setAvailability(body);})
   .catch(()=>{if(!controller.signal.aborted)setMessage('Could not check this batch size. Refresh and try again.');});
  return()=>controller.abort();
 },[selectedVersion?.id,qty,snapshot?.fetchedAt,redirect]); // Refresh after every stock snapshot.
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
