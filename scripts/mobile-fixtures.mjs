// Read-only synthetic render states; no environment or network access.
import {id,sample,fixture} from './bartender-fixtures.mjs';
const noop=()=>{};
export function stateFor(page){
 const s=fixture();s.requests[0].in_progress=.5;
 s.items[0].name='Cazadores reposado 100% agave — reserve bottle for service';
 s.recipes[1].name='Clarified pineapple, coconut and toasted spice cordial';
 s.items[1].name='Fine clarification filters — food-safe paper';
 for(let i=0;i<7;i++)s.items.push({id:id(300+i),name:i===0?'ExtraLongIngredientNameWithoutSpacesToTestSafeWrappingAt320Pixels':'Prepared citrus ingredient with a long descriptive name '+(i+1),base_unit:'ml'});
 const longMissing=s.items.slice(1).map((item,i)=>({item_id:item.id,step_order:2,deficit:i+1,reason:'INSUFFICIENT'}));
 s.overview[1].missing_inputs=longMissing;s.overview[1].should_prep=false;
 s.steps[1].instructions='Mix gently, then leave covered until clarification is complete.';
 s.steps[2].instructions='Pass through the fine filter. Keep the completed mixture chilled.';
 s.runs=[{id:id(80),recipe_version_id:id(2),batch_quantity:1,lifecycle:page==='blocked'||page==='progress'?'BLOCKED':'IN_PROGRESS',request_id:null}];
 s.runSteps=[{id:id(81),batch_run_id:id(80),recipe_step_id:id(32),status:'DONE'},{id:id(82),batch_run_id:id(80),recipe_step_id:id(33),status:'PENDING'}];
 s.blockers[id(80)]='Waiting for fine filters. Mix completed by the previous bartender; covered container is on the prep shelf.';
 s.runAvailability[id(80)]=sample(2,{can_complete:false,can_start:false,reachable_step:0,missing_inputs:longMissing});
 let selection=null,selectedVersion,selectedRun,availability=null;
 if(['simple','missing','multi'].includes(page)){
  selectedVersion=s.versions[page==='multi'?1:0];selection={kind:'recipe',id:selectedVersion.id};availability={...s.overview.find(a=>a.recipe_version_id===selectedVersion.id),selected_batch_quantity:1};
  if(page==='missing'){availability.can_complete=false;availability.missing_inputs=longMissing;}
 }
 if(['run','blocked'].includes(page)){selectedRun=s.runs[0];selection={kind:'run',id:selectedRun.id};}
 return {snapshot:s,tab:page==='stock'?'Batch Stock':['run','blocked','progress'].includes(page)?'In progress':'Prep',selection,selectedVersion,selectedRun,qty:'1',availability,reason:'',pending:['pending','saving'].includes(page)?{kind:'simple',version:id(1),batches:'1',key:id(99)}:null,busy:page==='saving',loading:false,message:page==='changed'?'Stock or this step changed. Review the refreshed details.':page==='session'?'Your access changed. Sign in again.':'',setTab:noop,setSelection:noop,setQty:noop,setAvailability:noop,setReason:noop,refresh:noop,act:noop,choose:noop};
}
