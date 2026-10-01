import {requireStaff} from '@/lib/auth/session';
import {logout} from '@/app/auth/actions';
import {demoEnabled} from '@/lib/sales-demo/config';
import SalesDemo from './sales-demo';
import ManagementWorkspace from './workspace';
export default async function Page(){
 const staff=await requireStaff("management");
 return <ManagementWorkspace staffId={staff.id} signOut={<form action={logout}><button type="submit">Sign out</button></form>} demo={demoEnabled(process.env)&&<SalesDemo/>}/>;
}
