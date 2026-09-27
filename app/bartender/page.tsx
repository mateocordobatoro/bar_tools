import { requireStaff } from '@/lib/auth/session';
import { logout } from '@/app/auth/actions';
import { isBartenderPreview } from '@/lib/bartender/environment';
import Workspace from './workspace';
export default async function Page() {
 const staff=await requireStaff('bartender');
 return <main className="bartender-shell"><header className="work-header"><div><div className="eyebrow">BarThings · Bartender</div><h1>Prep workspace</h1><small>{staff.display_name}</small></div><form action={logout}><button className="secondary" type="submit">Sign out</button></form></header>
 {isBartenderPreview(process.env)?<Workspace staffId={staff.id}/>:<p>This operational workspace is available only in the authorized Preview environment.</p>}
 </main>;
}
