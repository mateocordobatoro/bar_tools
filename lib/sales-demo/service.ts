import 'server-only';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {fixtures,saleFor} from './config';
import {rpc} from '@/lib/bartender/service';
type Row=Record<string,unknown>;
async function rows(c:SupabaseClient,table:string,column:string,values:string[]) {
 const {data,error}=await c.from(table).select('*').in(column,values).limit(200);
 if(error||!data||data.length===200)throw new Error('Demo fixtures unavailable');return data as Row[];
}
function only(rows:Row[],predicate:(r:Row)=>boolean){const matches=rows.filter(predicate);if(matches.length!==1)throw new Error('Dedicated demo fixtures missing or ambiguous');return matches[0];}
function exact(actual:Row[],expected:Row[]) {
 const canonical=(r:Row[])=>r.map(x=>JSON.stringify(x)).sort().join('|');
 if(canonical(actual)!==canonical(expected))throw new Error('Dedicated demo definitions changed');
}
/** Resolve fixed names and verify every transitive serving input before any write. */
export async function demoState(c:SupabaseClient) {
 const raw=await rows(c,'inventory_items','name',fixtures.raw.map(x=>fixtures.prefix+x.name));
 const items=Object.fromEntries(fixtures.raw.map(x=>{const r=only(raw,r=>r.name===fixtures.prefix+x.name&&r.active===true&&r.base_unit===x.unit&&Number(r.quantum)===x.quantum);return [x.key,String(r.id)];}));
 const recipe=only(await rows(c,'recipes','name',[fixtures.prefix+fixtures.recipe.name]),r=>r.active===true);
 const versions=await rows(c,'recipe_versions','recipe_id',[String(recipe.id)]);
 const v=only(versions,r=>r.approved_at!==null); // dedicated immutable v1 only
 if(v.production_mode!=='SIMPLE'||Number(v.production_increment)!==0.5)throw new Error('Demo recipe changed');
 const requirements=await rows(c,'recipe_requirements','recipe_version_id',[String(v.id)]);
 exact(requirements.map(r=>({id:r.item_id,quantity:Number(r.quantity_per_batch)})),fixtures.recipe.ingredients.map(r=>({id:items[r.key],quantity:r.quantity})));
 const identity=only(await rows(c,'batch_stock_identities','id',[String(v.stock_identity_id)]),r=>r.recipe_id===recipe.id&&Number(r.standard_qty)===1&&r.standard_unit==='L');
 const setting=only(await rows(c,'recipe_operational_settings','recipe_id',[String(recipe.id)]),()=>true);
 if(Number(setting.prep_threshold)!==fixtures.recipe.threshold)throw new Error('Demo threshold changed');
 const accounts=[...await rows(c,'inventory_accounts','item_id',Object.values(items)),...await rows(c,'inventory_accounts','stock_identity_id',[String(identity.id)])];
 const baseline=fixtures.raw.map(x=>({id:String(only(accounts,r=>r.item_id===items[x.key]).id),quantity:x.baseline}));
 baseline.push({id:String(only(accounts,r=>r.stock_identity_id===identity.id).id),quantity:fixtures.recipe.baseline});
 const balances=await rows(c,'inventory_balances','account_id',baseline.map(x=>x.id));
 const targets=baseline.map(x=>{const b=only(balances,b=>b.account_id===x.id&&b.initialized===true);return {...x,current:Number(b.quantity),revision:Number(b.revision)};});
 const menu=await rows(c,'menu_items','name',fixtures.menu.map(x=>fixtures.prefix+x.name));
 const menuIds=fixtures.menu.map(x=>String(only(menu,r=>r.name===fixtures.prefix+x.name&&r.active===true).id));
 const definitions=await rows(c,'serving_definitions','menu_item_id',menuIds);
 const defs=menuIds.map(id=>only(definitions,d=>d.menu_item_id===id&&d.approved_at!==null));
 const servings=await rows(c,'serving_requirements','serving_definition_id',defs.map(d=>String(d.id)));
 for(let i=0;i<defs.length;i++)exact(servings.filter(r=>r.serving_definition_id===defs[i].id).map(r=>({item:r.item_id,stock:r.stock_identity_id,quantity:Number(r.quantity_per_serving)})),fixtures.menu[i].requirements.map(r=>({item:r.key==='batch'?null:items[r.key],stock:r.key==='batch'?identity.id:null,quantity:r.quantity})));
 const runs=await rows(c,'batch_runs','recipe_version_id',versions.map(v=>String(v.id)));
 const requests=await rows(c,'batch_requests','recipe_id',[String(recipe.id)]);
 const openWork=runs.some(r=>['IN_PROGRESS','BLOCKED'].includes(String(r.lifecycle)))||requests.some(r=>r.request_state==='OPEN');
 return {targets,menuIds,openWork,ready:!openWork&&targets.every(t=>t.current===t.quantity)};
}
export async function ingestDemo(c:SupabaseClient,execution:string,index:number) {
 const state=await demoState(c);const sale=saleFor(execution,index,state.menuIds);
 const result=await rpc<{status:string}>(c,'ingest_sale',{p_sale_id:sale.sale_id,p_sold_at:sale.sold_at,p_menu_item_id:sale.menu_item_id,p_quantity:sale.quantity,p_server:sale.server});
 if(result.status!=='APPLIED')throw new Error('Observed sales migration required');
 return {time:sale.time,menuItem:sale.menuItem,quantity:sale.quantity,server:sale.server,saleId:sale.sale_id};
}
export async function resetDemo(c:SupabaseClient) {
 const state=await demoState(c);if(state.openWork)throw new Error('Finish demo work before reset');
 for(const t of state.targets)if(t.current!==t.quantity)await rpc(c,'record_inventory_count',{p_account:t.id,p_count:t.quantity,p_revision:t.revision,p_operation_key:randomUUID()});
 const after=await demoState(c);if(!after.ready)throw new Error('Reset incomplete');return {ready:true};
}
