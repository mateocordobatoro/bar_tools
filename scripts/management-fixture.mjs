export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function managementFixture(){return {
 inventory:[
 {id:id(1),itemId:id(101),name:'Cazadores tequila — long operational bottle label',category:'LIQUOR',baseUnit:'ml',quantity:750,revision:1,quantum:'1',units:[{name:'ml',factor:'1'},{name:'bottle',factor:'750'}],displayUnit:'bottle',status:'Critical',low:2250,critical:750},
 {id:id(2),itemId:id(102),name:'Corona',category:'BEER',baseUnit:'unit',quantity:-2,revision:4,quantum:'1',units:[{name:'unit',factor:'1'},{name:'case',factor:'24'}],displayUnit:'unit',status:'Reconcile',low:24,critical:6},
 {id:id(3),itemId:id(103),name:'Lime',category:'OTHER',baseUnit:'unit',quantity:24,revision:1,quantum:'1',units:[{name:'unit',factor:'1'}],displayUnit:'unit',status:'Unconfigured',low:null,critical:null},
 {id:id(4),itemId:null,recipeId:id(20),name:'Margarita Base',category:'BATCH',baseUnit:'batch',quantity:0.24,revision:2,quantum:'0.000000001',units:[{name:'batch',factor:'1'}],displayUnit:'batch',status:'Low',low:0.3,critical:null}],
 prep:[{id:id(20),name:'Margarita Base',stock:0.24,threshold:0.3,shouldPrep:true}],
 requests:[{request_id:id(30),recipe_id:id(20),state:'OPEN',requested:2,fulfilled:0.5,remaining:1.5,in_progress:1}],
 recipes:[{id:id(40),name:'Margarita Base',version:2,mode:'SIMPLE',increment:0.5,ingredients:[{name:'Cazadores',quantity:600,unit:'ml',step:null}],steps:[{name:'Combine',instructions:'Combine measured ingredients.'}]}],
 staff:[{id:id(50),display_name:'Local Manager',role:'management',active:true},{id:id(51),display_name:'Local Bartender',role:'bartender',active:false}],countDiscrepancies:3,fetchedAt:'2026-09-30T00:00:00Z'};}
