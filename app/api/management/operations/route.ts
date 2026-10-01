import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {resolveAccess,destination} from '@/lib/auth/access';
import {isBartenderPreview} from '@/lib/bartender/environment';
import {parseCommand} from '@/lib/management/model';
import {loadManagement,applyManagement} from '@/lib/management/service';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function authorize(){
 if(!isBartenderPreview(process.env))return {response:json({message:'Management V1 is unavailable in this environment.'},403)};
 const client=await createClient({writable:true});const access=await resolveAccess(client);
 if(access.kind!=='staff'||access.staff.role!=='management')return {response:json({redirect:destination(access)},access.kind==='unavailable'?503:403)};
 return {client};
}
export async function GET(){try{const a=await authorize();if(a.response)return a.response;return json(await loadManagement(a.client!));}catch{return json({message:'Inventory could not be loaded. Check configuration and try again.'},503);}}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({message:'Request origin denied.'},403);
 try{
  const a=await authorize();if(a.response)return a.response;
  let p;try{p=parseCommand(await req.json());}catch{return json({status:'failed',message:'Check the action, quantity and unit.'},400);}
  try{return json({status:'applied',result:await applyManagement(a.client!,p)});}
  catch(error){const e=error as {code?:string;conflict?:boolean;idempotencyConflict?:boolean};if(e.code==='42501')return json({redirect:'/access-denied',status:'failed'},403);
   if(e.idempotencyConflict)return json({status:'uncertain',message:'The original action or unit configuration changed. Stop and review the recorded operation before continuing.'},409);
   if(e.conflict)return json({status:'conflict',message:'Stock changed. Review the new theoretical quantity before submitting again.'},409);
   if(['P0001','23514','23505','22P02','22023'].includes(e.code??''))return json({status:'failed',message:'Change rejected. Check quantities, current requests, and the last active manager rule.'},409);
   return json({status:'uncertain',message:'Result unconfirmed. Retry this exact action; do not submit a replacement.'},503);
  }
 }catch{return json({status:'uncertain',message:'Connection unavailable. Keep this action for safe retry.'},503);}
}
