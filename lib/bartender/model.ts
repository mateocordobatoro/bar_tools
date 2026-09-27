import type { Availability, ProductionMode } from '@/lib/domain/contracts';
export type Version = { id:string; recipe_id:string; version_number:number; production_mode:ProductionMode; stock_identity_id:string };
export type Step = { id:string; recipe_version_id:string; step_order:number; name:string; instructions:string|null };
export type Requirement = { id:string; recipe_version_id:string; step_id:string|null; item_id:string; quantity_per_batch:number };
export type Run = { id:string; recipe_version_id:string; batch_quantity:number; lifecycle:'IN_PROGRESS'|'BLOCKED'; request_id:string|null };
export type RunStep = { id:string; batch_run_id:string; recipe_step_id:string; status:string };
export type RequestProgress = { request_id:string; recipe_id:string; state:string; requested:number; fulfilled:number; remaining:number; in_progress:number };
export type Snapshot = {
 recipes:{id:string;name:string}[]; versions:Version[]; steps:Step[]; requirements:Requirement[];
 items:{id:string;name:string;base_unit:string}[]; requests:RequestProgress[]; runs:Run[]; runSteps:RunStep[];
 overview:Availability[]; runAvailability:Record<string,Availability>;
 blockers:Record<string,string>; stock:{id:string;name:string;quantity:number|null}[]; fetchedAt:string;
};
export type Command =
 | {kind:'simple'|'start';version:string;batches:string;key:string}
 | {kind:'step';run:string;step:string;key:string}
 | {kind:'block'|'resume';run:string;reason:string;key:string};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseCommand(input:unknown):Command {
 if(!input || typeof input!=='object') throw new Error('Invalid action');
 const x=input as Record<string,unknown>;
 const fields=x.kind==='simple'||x.kind==='start'?['kind','version','batches','key']:x.kind==='step'?['kind','run','step','key']:['kind','run','reason','key'];
 if(Object.keys(x).some(k=>!fields.includes(k)) || typeof x.key!=='string'||!uuid.test(x.key)) throw new Error('Invalid action');
 if(x.kind==='simple'||x.kind==='start') {
  if(typeof x.version!=='string'||!uuid.test(x.version)||typeof x.batches!=='string'||!/^\d+(\.\d+)?$/.test(x.batches)||!(Number(x.batches)>0&&Number(x.batches)<1e9)) throw new Error('Invalid quantity');
 } else if(x.kind==='step') {
  if(typeof x.run!=='string'||!uuid.test(x.run)||typeof x.step!=='string'||!uuid.test(x.step)) throw new Error('Invalid step');
 } else if(x.kind==='block'||x.kind==='resume') {
  if(typeof x.run!=='string'||!uuid.test(x.run)||typeof x.reason!=='string'||x.reason.length>2000||(x.kind==='block'&&!x.reason.trim())) throw new Error('Reason required');
 } else throw new Error('Unknown action');
 return x as Command;
}
export function rpcCommand(c:Command) {
 if(c.kind==='simple'||c.kind==='start') return {name:c.kind==='simple'?'produce_simple_batch':'start_multistep_run',args:{p_version:c.version,p_batches:c.batches,p_operation_key:c.key}};
 if(c.kind==='step') return {name:'complete_batch_step',args:{p_run:c.run,p_step:c.step,p_operation_key:c.key}};
 if(c.kind==='block'||c.kind==='resume') return {name:'transition_batch_run',args:{p_run:c.run,p_action:c.kind==='block'?'BLOCK':'RESUME',p_reason:c.reason,p_operation_key:c.key}};
 throw new Error('Unknown action');
}
export function prepGroups(s:Snapshot) {
 return {
 suggested:s.overview.filter(a=>a.should_prep===true),
 ready:s.overview.filter(a=>a.can_complete),
 start:s.overview.filter(a=>!a.can_complete&&a.can_start),
 unavailable:s.overview.filter(a=>!a.can_complete&&!a.can_start),
 };
}
export function nextStep(s:Snapshot,run:Run) {
 return s.steps.filter(x=>x.recipe_version_id===run.recipe_version_id).sort((a,b)=>a.step_order-b.step_order)
 .map(step=>({step,record:s.runSteps.find(x=>x.batch_run_id===run.id&&x.recipe_step_id===step.id)})).find(x=>x.record&&x.record.status!=='DONE');
}
export const batches=(n:number)=>`${new Intl.NumberFormat('en',{maximumFractionDigits:6}).format(n)} ${n===1?'batch':'batches'}`;
/** Physical amounts are display-only. Authoritative scaling happens inside RPCs. */
export const amount=(n:number)=>new Intl.NumberFormat('en',{maximumFractionDigits:6}).format(n);
