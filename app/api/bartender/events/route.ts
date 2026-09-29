import { NextRequest } from 'next/server';
import { createClient as createRealtimeClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { resolveAccess } from '@/lib/auth/access';
import { isBartenderPreview } from '@/lib/bartender/environment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const tables = ['batch_requests', 'batch_runs', 'batch_run_steps', 'inventory_balances', 'recipe_operational_settings'];

/** HttpOnly session tokens remain on the server. Only an empty invalidation crosses SSE. */
export async function GET(request: NextRequest) {
 if (!isBartenderPreview(process.env)) return new Response(null, {status: 403});
 if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(null, {status: 403});
 try {
  const auth = await createClient({writable: true});
  const access = await resolveAccess(auth);
  if (access.kind !== 'staff' || access.staff.role !== 'bartender') return new Response(null, {status: 401});
  // getSession is used only after getUser + active database profile verification.
  const {data: {session}} = await auth.auth.getSession();
  if (!session) return new Response(null, {status: 401});
  const {url, publishableKey} = getSupabaseConfig();
  const realtime = createRealtimeClient(url, publishableKey, {
   auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
   accessToken: async () => session.access_token,
  });
  let dispose = () => {};
  const stream = new ReadableStream<Uint8Array>({
   start(controller) {
    const encoder = new TextEncoder();
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const channel = realtime.channel('bartender-invalidation');
    dispose = () => {
     if (closed) return;
     closed = true;
     clearTimeout(timer); clearTimeout(expiry);
     request.signal.removeEventListener('abort', dispose);
     void realtime.removeChannel(channel).catch(() => {}).finally(() => realtime.realtime.disconnect());
     try {controller.close();} catch { /* Consumer already cancelled. */ }
    };
    const signal = () => {
     if (closed || timer) return;
     timer = setTimeout(() => {
      timer = undefined;
      if (!closed) controller.enqueue(encoder.encode('data: stale\n\n'));
     }, 250);
    };
    for (const table of tables) for (const event of ['INSERT', 'UPDATE'] as const) {
     channel.on('postgres_changes', {event, schema: 'public', table}, signal);
    }
    // A fresh connection repairs any events missed during reconnect. Each connection
    // revalidates Auth and active staff. Postgres Changes additionally applies row RLS.
    controller.enqueue(encoder.encode('retry: 3000\n\n'));
    expiry = setTimeout(dispose, 45000);
    request.signal.addEventListener('abort', dispose, {once: true});
    if (request.signal.aborted) {dispose(); return;}
    channel.subscribe(status => {
     if (status === 'SUBSCRIBED' && !closed) controller.enqueue(encoder.encode('data: connected\n\n'));
     else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) dispose();
    });
   },
   cancel() {dispose();},
  });
  return new Response(stream, {headers: {
   'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
   'X-Accel-Buffering': 'no',
  }});
 } catch { return new Response(null, {status: 503}); }
}
