export const categories=['LIQUOR','BEER','WINE','GARNISH','JUICE_MIXER','OTHER'] as const;
export type Category=typeof categories[number];
export type Status='Healthy'|'Low'|'Critical'|'Reconcile'|'Unconfigured'|'Count needed';
export type Unit={name:string;factor:string};
export type Inventory={id:string;itemId:string|null;recipeId?:string;name:string;category:Category|'BATCH';baseUnit:string;quantity:number|null;revision:number;quantum:string;units:Unit[];displayUnit:string;status:Status;low:number|null;critical:number|null};
export type Prep={id:string;name:string;stock:number|null;threshold:number;shouldPrep:boolean};
export type Progress={request_id:string;recipe_id:string;state:string;requested:number;fulfilled:number;remaining:number;in_progress:number};
export type Recipe={id:string;name:string;version:number;mode:string;increment:number;ingredients:{name:string;quantity:number;unit:string;step:string|null}[];steps:{name:string;instructions:string}[]};
export type Staff={id:string;display_name:string;role:'management'|'bartender';active:boolean};
export type Snapshot={menu?:{id:string;name:string;ingredients:{name:string;quantity:number;unit:string}[];configured:boolean}[];activity?:{id:string;time:string;kind:string;lines:{name:string;delta:number;unit:string;current:number|null}[]}[];inventory:Inventory[];prep:Prep[];requests:Progress[];recipes:Recipe[];staff:Staff[];countDiscrepancies:number;fetchedAt:string};
export function stockStatus(q:number|null,low:number|null,critical:number|null):Status {
 if(q===null)return 'Count needed';if(q<0)return 'Reconcile';
 if(critical!==null&&q<=critical)return 'Critical';if(low!==null&&q<=low)return 'Low';return low===null?'Unconfigured':'Healthy';
}
export function filteredInventory(items:Inventory[],search:string,category:string,status:string){return items.filter(i=>i.name.toLowerCase().includes(search.toLowerCase())&&(category==='All'||i.category===category)&&(status==='All'||i.status===status));}
export function displayQuantity(item:Inventory){const factor=Number(item.units.find(u=>u.name===item.displayUnit)?.factor??1);return item.quantity===null?null:item.quantity/factor;}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Command={kind:'receive'|'count'|'threshold'|'request'|'cancel'|'staff';id:string;key:string;quantity?:string;unit?:string;revision?:number;note?:string;role?:'management'|'bartender';active?:boolean};
export function decimal(value:unknown):string{if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,9})?$/.test(value)||!Number.isFinite(Number(value)))throw new Error('Invalid quantity');return value;}
export function parseCommand(value:unknown):Command{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid command');
 const c=value as Record<string,unknown>;const allowed:Record<string,string[]>={receive:['quantity','unit'],count:['quantity','unit','revision'],threshold:['quantity'],request:['quantity','note'],cancel:[],staff:['role','active']};
 if(typeof c.kind!=='string'||!Object.hasOwn(allowed,c.kind)||typeof c.id!=='string'||!uuid.test(c.id)||typeof c.key!=='string'||!uuid.test(c.key))throw new Error('Invalid command');
 if(Object.keys(c).some(k=>!['kind','id','key',...allowed[c.kind as string]].includes(k)))throw new Error('Unexpected input');
 if(['receive','count','threshold','request'].includes(c.kind))decimal(c.quantity);
 if(['receive','request'].includes(c.kind)&&Number(c.quantity)<=0)throw new Error('Quantity must be positive');
 if(['receive','count'].includes(c.kind)&&(typeof c.unit!=='string'||c.unit.length<1||c.unit.length>30))throw new Error('Choose a unit');
 if(c.kind==='count'&&(!Number.isSafeInteger(c.revision)||Number(c.revision)<0))throw new Error('Invalid revision');
 if(c.note!==undefined&&(typeof c.note!=='string'||c.note.length>2000))throw new Error('Invalid note');
 if(c.kind==='staff'&&((c.role===undefined&&c.active===undefined)||(c.role!==undefined&&!['management','bartender'].includes(String(c.role)))||(c.active!==undefined&&typeof c.active!=='boolean')))throw new Error('Invalid staff change');
 return c as Command;
}
/** Exact decimal normalization on the server; no universal package factors. */
export function normalizeQuantity(quantity:string,factor:string,quantum:string):string{
 decimal(quantity);
 const parts=(s:string)=>{const m=/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);if(!m)throw new Error('Invalid unit quantity');const exp=Number(m[3]??0);if(Math.abs(exp)>18)throw new Error('Unit precision unsupported');let scale=(m[2]??'').length-exp,n=BigInt(m[1]+(m[2]??''));if(scale<0){n*=BigInt(10)**BigInt(-scale);scale=0;}return {n,scale};};
 const q=parts(quantity),f=parts(factor),step=parts(quantum);if(f.n<=BigInt(0)||step.n<=BigInt(0))throw new Error('Invalid unit configuration');
 const n=q.n*f.n,scale=q.scale+f.scale,den=BigInt(10)**BigInt(scale);
 if(n>=BigInt(1000000000000)*den||(n*BigInt(10)**BigInt(step.scale))%(step.n*den)!==BigInt(0))throw new Error('Quantity does not match inventory unit');
 const text=n.toString().padStart(scale+1,'0');return scale?text.slice(0,-scale)+'.'+text.slice(-scale):text;
}
