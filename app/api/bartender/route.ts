import { NextRequest,NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveAccess,destination } from '@/lib/auth/access';
import { isBartenderPreview } from '@/lib/bartender/environment';
import { parseCommand,rpcCommand } from '@/lib/bartender/model';
import { loadWorkspace,rpc } from '@/lib/bartender/service';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function authorize() {
 if(!isBartenderPreview(process.env)) return {response:json({message:'Operational Preview is not enabled.'},403)};
 const client=await createClient({writable:true});
 const access=await resolveAccess(client);
 if(access.kind!=='staff'||access.staff.role!=='bartender') return {response:json({redirect:destination(access)},access.kind==='unavailable'?503:401)};
 return {client};
}
export async function GET(req:NextRequest) {
 try {
  const auth=await authorize();if(auth.response)return auth.response;
  const version=req.nextUrl.searchParams.get('version');
  if(version) {
   const c=parseCommand({kind:'simple',version,batches:req.nextUrl.searchParams.get('batches'),key:'00000000-0000-0000-0000-000000000000'});
   if(c.kind!=='simple') return json({},400);
   return json(await rpc(auth.client!,'get_recipe_availability',{p_version:c.version,p_batches:c.batches}));
  }
  return json(await loadWorkspace(auth.client!));
 } catch {return json({message:'Availability could not be refreshed. Try again.'},503);}
}
export async function POST(req:NextRequest) {
 if(req.headers.get('origin')!==req.nextUrl.origin) return json({message:'Request origin denied.'},403);
 let command;
 try {command=parseCommand(await req.json());}catch{return json({message:'Choose a valid action and batch quantity.'},400);}
 try {
  const auth=await authorize();if(auth.response)return auth.response;
  const call=rpcCommand(command);
  const result=await rpc(auth.client!,call.name,call.args);
  return json({result});
 } catch(error) {
  const code=(error as {code?:string}).code;
  // Known database rejections rolled back. Unknown transport outcomes retain retry keys.
  if(code==='P0001'||code==='23514'||code==='22023'||code==='23505') return json({message:'Stock or work changed. Refresh availability before trying again.'},409);
  if(code==='42501') return json({redirect:'/access-denied'},403);
  return json({message:'The result could not be confirmed. Retry the same action safely.'},503);
 }
}
