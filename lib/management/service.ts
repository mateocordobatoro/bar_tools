import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {stockStatus,normalizeQuantity,type Snapshot,type Inventory,type Command,type Progress,type Staff,type Category} from './model';
import type {Availability} from '@/lib/domain/contracts';
type Row=Record<string,any>;
async function rows(c:SupabaseClient,table:string,key='id'):Promise<Row[]>{
 const all:Row[]=[];for(let offset=0;offset<10000;offset+=500){const {data,error}=await c.from(table).select('*').order(key).range(offset,offset+499);if(error||!data)throw new Error('Management data unavailable');all.push(...data);if(data.length<500)return all;}throw new Error('Management dataset too large');
}
async function rpc<T>(c:SupabaseClient,name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await c.rpc(name,args);if(error)throw Object.assign(new Error('Operation rejected'),{code:error.code,conflict:error.message==='Stale or unknown count',idempotencyConflict:error.message==='Operation key reused with different payload'});return data;}
async function recentMovements(c:SupabaseClient):Promise<Row[]>{
 const all:Row[]=[];const since=new Date(Date.now()-86400000).toISOString();
 for(let offset=0;offset<10000;offset+=500){const {data,error}=await c.from('inventory_movements').select('id,kind,occurred_at,inventory_movement_lines(account_id,delta)').gte('occurred_at',since).order('occurred_at',{ascending:false}).order('id').range(offset,offset+499);if(error||!data)throw new Error('Activity unavailable');all.push(...data);if(data.length<500)return all;}throw new Error('Activity exceeds supported size');
}
export async function loadManagement(c:SupabaseClient):Promise<Snapshot>{
 const [items,accounts,balances,settings,conversions,stock,recipes,versions,steps,requirements,prepSettings,staff,counts,overview,requests]=await Promise.all([
 rows(c,'inventory_items'),rows(c,'inventory_accounts'),rows(c,'inventory_balances','account_id'),rows(c,'inventory_item_operational_settings','inventory_item_id'),rows(c,'inventory_unit_conversions','item_id'),rows(c,'batch_stock_identities'),rows(c,'recipes'),rows(c,'recipe_versions'),rows(c,'recipe_steps'),rows(c,'recipe_requirements'),rows(c,'recipe_operational_settings','recipe_id'),rows(c,'app_users'),rows(c,'inventory_counts'),rpc<Availability[]>(c,'get_prep_overview'),rpc<Progress[]>(c,'get_request_progress')]);
 const [menuItems,servings,servingInputs]=await Promise.all([rows(c,'menu_items'),rows(c,'serving_definitions'),rows(c,'serving_requirements')]);
 const menu=menuItems.map(m=>{const v=servings.filter(v=>v.menu_item_id===m.id&&v.approved_at).sort((a,b)=>b.version_number-a.version_number)[0];return {id:m.id,name:m.name,configured:!!v,ingredients:servingInputs.filter(r=>r.serving_definition_id===v?.id).map(r=>({name:items.find(i=>i.id===r.item_id)?.name??stock.find(i=>i.id===r.stock_identity_id)?.name??'Unavailable ingredient',quantity:Number(r.quantity_per_serving),unit:r.item_id?items.find(i=>i.id===r.item_id)?.base_unit??'':'batch'}))};});
 const prep=stock.map(s=>{const account=accounts.find(a=>a.stock_identity_id===s.id),b=balances.find(b=>b.account_id===account?.id),setting=prepSettings.find(x=>x.recipe_id===s.recipe_id),a=overview.find(x=>versions.find(v=>v.id===x.recipe_version_id)?.stock_identity_id===s.id);return {id:s.recipe_id,name:s.name,stock:b?.initialized?Number(b.quantity):null,threshold:Number(setting?.prep_threshold??0.3),shouldPrep:a?.should_prep===true};});
 const inventory:Inventory[]=accounts.flatMap(a=>{
 const item=items.find(i=>i.id===a.item_id),identity=stock.find(i=>i.id===a.stock_identity_id);if(!item&&!identity)return [];
 const b=balances.find(b=>b.account_id===a.id),setting=settings.find(s=>s.inventory_item_id===item?.id),p=prep.find(p=>p.id===identity?.recipe_id);
 const low=item?(setting?.low_threshold_base_qty==null?null:Number(setting.low_threshold_base_qty)):p?.threshold??null,critical=setting?.critical_threshold_base_qty==null?null:Number(setting.critical_threshold_base_qty),quantity=b?.initialized?Number(b.quantity):null;
 const baseUnit=item?.base_unit??'batch';const units=[{name:baseUnit,factor:'1'},...conversions.filter(u=>u.item_id===item?.id&&u.unit!==baseUnit).map(u=>({name:u.unit,factor:String(u.base_quantity)}))];
 return [{id:a.id,itemId:item?.id??null,recipeId:identity?.recipe_id,name:item?.name??identity!.name,category:item?(setting?.category??'OTHER') as Category:'BATCH',baseUnit,quantity,revision:Number(b?.revision??0),quantum:String(item?.quantum??'0.000000001'),units,displayUnit:setting?.preferred_display_unit??baseUnit,status:stockStatus(quantity,low,critical),low,critical}];});
 const movements=await recentMovements(c);
 const activity=movements.map(m=>({id:m.id,time:m.occurred_at,kind:m.kind,lines:(m.inventory_movement_lines as Row[]).map(l=>{const i=inventory.find(i=>i.id===l.account_id);return {name:i?.name??'Unavailable item',delta:Number(l.delta),unit:i?.baseUnit??'',current:i?.quantity??null};})}));
 return {activity,menu,inventory,prep,requests,staff:staff.map(({id,display_name,role,active})=>({id,display_name,role,active})) as Staff[],countDiscrepancies:counts.filter(x=>Number(x.theoretical)!==Number(x.counted)).length,
 recipes:prepSettings.flatMap(p=>{const v=versions.find(v=>v.id===p.current_version_id&&v.approved_at),r=recipes.find(r=>r.id===p.recipe_id);if(!v||!r)return [];return [{id:v.id,name:r.name,version:v.version_number,mode:v.production_mode,increment:Number(v.production_increment),ingredients:requirements.filter(x=>x.recipe_version_id===v.id).map(x=>({name:items.find(i=>i.id===x.item_id)?.name??'Unknown item',quantity:Number(x.quantity_per_batch),unit:items.find(i=>i.id===x.item_id)?.base_unit??'',step:steps.find(s=>s.id===x.step_id)?.name??null})),steps:steps.filter(s=>s.recipe_version_id===v.id).sort((a,b)=>a.step_order-b.step_order).map(s=>({name:s.name,instructions:s.instructions??''}))}];}),fetchedAt:new Date().toISOString()};
}
export async function applyManagement(c:SupabaseClient,command:Command){
 const p=command;
 if(p.kind==='staff')return rpc(c,'update_staff_profile',{p_target:p.id,p_role:p.role??null,p_active:p.active??null,p_operation_key:p.key});
 if(p.kind==='threshold')return rpc(c,'set_prep_threshold',{p_recipe:p.id,p_threshold:p.quantity,p_operation_key:p.key});
 if(p.kind==='request')return rpc(c,'request_batches',{p_recipe:p.id,p_batches:p.quantity,p_operation_key:p.key,p_note:p.note?.trim()||null});
 if(p.kind==='cancel')return rpc(c,'cancel_batch_request',{p_request:p.id,p_operation_key:p.key});
 const {data:a,error}=await c.from('inventory_accounts').select('id,item_id,stock_identity_id').eq('id',p.id).single();if(error||!a)throw Object.assign(new Error('Unknown account'),{code:'22023'});
 let factor='1',quantum='0.000000001';
 if(a.item_id){
  const {data:item,error}=await c.from('inventory_items').select('base_unit,quantum,active').eq('id',a.item_id).single();if(error||!item||!item.active)throw Object.assign(new Error('Unavailable item'),{code:'22023'});quantum=String(item.quantum);
  if(p.unit!==item.base_unit){const {data:u,error}=await c.from('inventory_unit_conversions').select('base_quantity').eq('item_id',a.item_id).eq('unit',p.unit).single();if(error||!u)throw Object.assign(new Error('Unknown item unit'),{code:'22023'});factor=String(u.base_quantity);}
 }else if(p.unit!=='batch'||p.kind==='receive')throw Object.assign(new Error('Prepared stock must come from production'),{code:'22023'});
 let quantity;try{quantity=normalizeQuantity(p.quantity!,factor,quantum);}catch{throw Object.assign(new Error('Invalid normalized quantity'),{code:'22023'});}
 return p.kind==='receive'?rpc(c,'adjust_inventory',{p_account:p.id,p_delta:quantity,p_kind:'MANUAL_ADJUSTMENT',p_reason:'Receipt',p_operation_key:p.key}):rpc(c,'record_inventory_count',{p_account:p.id,p_count:quantity,p_revision:p.revision,p_operation_key:p.key});
}
