import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {resolveAccess} from '@/lib/auth/access';
import {demoEnabled,parseExecution,sequence} from '@/lib/sales-demo/config';
import {demoState,ingestDemo,resetDemo} from '@/lib/sales-demo/service';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function authorize(){
 if(!demoEnabled(process.env))return {response:json({message:'Demo unavailable.'},403)};
 const client=await createClient({writable:true});const access=await resolveAccess(client);
 if(access.kind!=='staff'||access.staff.role!=='management')return {response:json({message:'Active management required.'},403)};
 return {client};
}
export async function GET(){try{
 const a=await authorize();if(a.response)return a.response;
 const s=await demoState(a.client!);return json({ready:s.ready,openWork:s.openWork});
}catch{return json({ready:false,message:'Dedicated demo fixtures are not ready.'},503);}}
// POST sends only execution + index. DELETE performs the fixed reset with no body.
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({},403);
 try{
 const a=await authorize();if(a.response)return a.response;
 let execution,index;
 try{const b=await req.json();if(!b||Object.keys(b).sort().join(',')!=='execution,index')throw new Error();execution=parseExecution(b.execution);index=b.index;if(!Number.isInteger(index)||index<0||index>=sequence.length)throw new Error();}catch{return json({message:'Invalid demo sale.'},400);}
 return json(await ingestDemo(a.client!,execution,index));
 }catch{return json({message:'Demo sale could not be confirmed. Retry the same sale before reset.'},503);}
}
export async function DELETE(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin||await req.text())return json({},403);
 try{const a=await authorize();if(a.response)return a.response;return json(await resetDemo(a.client!));}
 catch{return json({ready:false,message:'Reset incomplete. Stop all demo activity, resolve pending sales/work, then restore again.'},409);}
}
