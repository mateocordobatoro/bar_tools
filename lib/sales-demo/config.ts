import fixtures from './fixtures.json';
export {fixtures};
export const sequence = fixtures.sequence;
export function demoEnabled(env:Record<string,string|undefined>) {
 if(env.VERCEL_ENV==='production'||env.SALES_DEMO_ENABLED!=='1')return false;
 const url=env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
 return env.VERCEL_ENV==='preview'?url==='https://mfwoutniamoldcieoqvc.supabase.co':
  !env.VERCEL_ENV&&env.NODE_ENV==='development'&&(url==='https://mfwoutniamoldcieoqvc.supabase.co'||url==='http://127.0.0.1:54321');
}
export function parseExecution(value:unknown):string {
 if(typeof value!=='string'||!/^\d{13}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new Error('Invalid demo execution');
 const ms=Number(value.split(':')[0]);if(ms<1577836800000||ms>Date.now()+60000)throw new Error('Invalid execution time');return value;
}
export function saleFor(execution:string,index:number,menuIds:string[]) {
 parseExecution(execution);
 if(!Number.isInteger(index)||index<0||index>=sequence.length)throw new Error('Invalid sequence index');
 const [item,quantity]=sequence[index];
 const minutes=17*60+index*24;
 return {sale_id:`demo60:${execution}:${index}`,sold_at:new Date(Number(execution.split(':')[0])+index*3000).toISOString(),
  menu_item_id:menuIds[item],quantity,server:['Demo Alex','Demo Sam','Demo Robin'][index%3],
  time:`${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,menuItem:fixtures.menu[item].name};
}
