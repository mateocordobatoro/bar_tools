import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Availability } from '@/lib/domain/contracts';
import type { Snapshot,Version,Step,Requirement,Run,RunStep,RequestProgress } from './model';

async function rows<T>(client:SupabaseClient,table:string,columns:string):Promise<T[]> {
 const output:T[]=[];
 for(let offset=0;offset<10000;offset+=500) {
  const {data,error}=await client.from(table).select(columns).order(table==='inventory_balances'?'account_id':'id').range(offset,offset+499);
  if(error) throw new Error('Workspace read failed');
  output.push(...data as T[]);
  if(data.length<500) return output;
 }
 throw new Error('Workspace exceeds supported size');
}
export async function rpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>={}):Promise<T> {
 const {data,error}=await client.rpc(name,args);
 if(error) throw Object.assign(new Error('Operation could not be completed'),{code:error.code});
 return data as T;
}
export async function loadWorkspace(c:SupabaseClient):Promise<Snapshot> {
 const [recipes,versions,steps,requirements,items,requests,allRuns,runSteps,overview,identities,accounts,balances,events]=await Promise.all([
 rows<{id:string;name:string}>(c,'recipes','id,name'),
 rows<Version>(c,'recipe_versions','id,recipe_id,version_number,production_mode,stock_identity_id'),
 rows<Step>(c,'recipe_steps','id,recipe_version_id,step_order,name,instructions'),
 rows<Requirement>(c,'recipe_requirements','id,recipe_version_id,step_id,item_id,quantity_per_batch'),
 rows<{id:string;name:string;base_unit:string}>(c,'inventory_items','id,name,base_unit'),
 rpc<RequestProgress[]>(c,'get_request_progress'),
 rows<Run>(c,'batch_runs','id,recipe_version_id,batch_quantity,lifecycle,request_id'),
 rows<RunStep>(c,'batch_run_steps','id,batch_run_id,recipe_step_id,status'),
 rpc<Availability[]>(c,'get_prep_overview'),
 rows<{id:string;name:string}>(c,'batch_stock_identities','id,name'),
 rows<{id:string;stock_identity_id:string|null}>(c,'inventory_accounts','id,stock_identity_id'),
 rows<{account_id:string;quantity:number;initialized:boolean}>(c,'inventory_balances','account_id,quantity,initialized'),
 rows<{id:string;run_id:string;event_type:string;detail:{reason?:string};occurred_at:string}>(c,'production_events','id,run_id,event_type,detail,occurred_at'),
 ]);
 const runs=allRuns.filter(r=>r.lifecycle==='IN_PROGRESS'||r.lifecycle==='BLOCKED');
 const runAvailability=Object.fromEntries(await Promise.all(runs.map(async r=>[r.id,await rpc<Availability>(c,'get_run_availability',{p_run:r.id})])));
 const blockers:Record<string,string>={};
 for(const event of events.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at))) if(event.event_type==='BLOCK') blockers[event.run_id]=event.detail.reason??'';
 return {recipes,versions,steps,requirements,items,requests,runs,runSteps,overview,runAvailability,blockers,
 stock:identities.map(i=>{const account=accounts.find(a=>a.stock_identity_id===i.id);const b=balances.find(b=>b.account_id===account?.id);return {id:i.id,name:i.name,quantity:b?.initialized?Number(b.quantity):null};}),fetchedAt:new Date().toISOString()};
}
