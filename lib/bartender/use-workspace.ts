'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { Availability } from '@/lib/domain/contracts';
import { parseCommand,type Command,type Snapshot,type Version } from './model';
type Selection={kind:'recipe';id:string}|{kind:'run';id:string};
const storageKey='bartools:pending-production:';
export function useWorkspace(staffId:string) {
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [tab,setTab]=useState('Prep');const [selection,setSelection]=useState<Selection|null>(null);
 const [qty,setQty]=useState('');const [availability,setAvailability]=useState<Availability|null>(null);
 const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
 const [reason,setReason]=useState('');const [pending,setPending]=useState<Command|null>(null);
 const readSequence=useRef(0);const reading=useRef(false);const writing=useRef(false);const detailSequence=useRef(0);
 const redirect=useCallback((body:{redirect?:string})=>{if(body.redirect)window.location.assign(body.redirect);},[]);
 const refresh=useCallback(async(force=false)=>{
  if(reading.current&&!force)return;reading.current=true;const generation=++readSequence.current;
  try {const response=await fetch('/api/bartender',{cache:'no-store',signal:AbortSignal.timeout(15000)});const body=await response.json();redirect(body);
   if(!response.ok)throw new Error();if(generation===readSequence.current)setSnapshot(body);
  }catch{setMessage('Could not refresh the workspace. Check your connection and retry.');}
  finally{reading.current=false;setLoading(false);}
 },[redirect]);
 useEffect(()=>{
  try {const saved=sessionStorage.getItem(storageKey+staffId);if(saved)setPending(parseCommand(JSON.parse(saved)));}catch{setMessage('Pending action could not be restored. Check work and stock before producing again.');}
  void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!writing.current)void refresh();},10000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[refresh,staffId]);
 const selectedVersion=selection?.kind==='recipe'?snapshot?.versions.find(v=>v.id===selection.id):undefined;
 const selectedRun=selection?.kind==='run'?snapshot?.runs.find(r=>r.id===selection.id):undefined;
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
 const act=async(command:Command)=>{
  if(writing.current)return;
  // Persist the exact actor-scoped command before sending; a lost response is safely retryable.
  try {sessionStorage.setItem(storageKey+staffId,JSON.stringify(command));}catch{setMessage('Private session storage is unavailable. Enable it before producing.');return;}
  writing.current=true;setBusy(true);setPending(command);setMessage('');
  try {
   const response=await fetch('/api/bartender',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
   const body=await response.json();redirect(body);
   if(response.ok||response.status===409||response.status===400){sessionStorage.removeItem(storageKey+staffId);setPending(null);}
   if(!response.ok){setMessage(response.status===409?'Stock or this step changed. Review the refreshed details.':body.message??'Your access changed. Sign in again.');return;}
   setMessage(command.kind==='simple'?'Production completed. Batch Stock and request fulfillment updated.':'Work updated.');
   setSelection(null);setReason('');
  }catch{setMessage('Result not confirmed. Retry the same action; it will not duplicate production.');}
  finally{writing.current=false;setBusy(false);await refresh(true);}
 };
 const choose=(v:Version)=>{setSelection({kind:'recipe',id:v.id});setAvailability(null);setQty(String(snapshot?.overview.find(a=>a.recipe_version_id===v.id)?.allowed_batch_sizes[0]??''));setMessage('');};
 return {snapshot,tab,setTab,selection,setSelection,qty,setQty,availability,setAvailability,message,setMessage,busy,loading,reason,setReason,pending,refresh,act,choose,selectedVersion,selectedRun};
}
