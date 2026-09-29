import { NextRequest } from 'next/server';
import { realtimeMetadata } from '@/lib/bartender/realtime-metadata';
import { randomUUID } from 'node:crypto';
import { createClient as createRealtimeClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { resolveAccess } from '@/lib/auth/access';
import { isBartenderPreview } from '@/lib/bartender/environment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const tables = ['batch_requests', 'batch_runs', 'batch_run_steps', 'inventory_balances', 'recipe_operational_settings'];

/** HttpOnly session tokens remain on the server. Only invalidation and opt-in allowlisted diagnostics cross SSE. */
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
  let dispose: () => Promise<void> = async () => {};
  const stream = new ReadableStream<Uint8Array>({
   start(controller) {
    const encoder = new TextEncoder();
    let closed = false;
    const connection = randomUUID();
    let channelStatus = 'CONNECTING';
    const diagnostic = (phase: string, fields: Record<string, string|null> = {}) => {
     // This route is already restricted to Preview + active bartender. Opt-in only.
     if (closed || process.env.BARTENDER_REALTIME_DIAGNOSTICS !== '1') return;
     const entry = {connection, phase, status: channelStatus, receivedAt: new Date().toISOString(), ...fields};
     console.info('[bartender-realtime]', JSON.stringify(entry));
     try {controller.enqueue(encoder.encode(`event: diagnostic\ndata: ${JSON.stringify(entry)}\n\n`));} catch { /* Cancellation must still clean up the channel. */ }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const channel = realtime.channel('bartender-invalidation');
    let closing: Promise<void> | undefined;
    dispose = () => {
     if (closed) return closing ?? Promise.resolve();
     diagnostic('cleanup');
     closed = true;
     clearTimeout(timer); clearInterval(heartbeat);
     request.signal.removeEventListener('abort', dispose);
     closing = realtime.removeChannel(channel).catch(() => {}).then(async () => {await realtime.realtime.disconnect();});
     try {controller.close();} catch { /* Consumer already cancelled. */ }
     return closing;
    };
    const signal = () => {
     if (closed || timer) return;
     timer = setTimeout(() => {
      timer = undefined;
      diagnostic('invalidation');
      if (!closed) controller.enqueue(encoder.encode('data: stale\n\n'));
     }, 250);
    };
    for (const table of tables) for (const event of ['INSERT', 'UPDATE'] as const) {
     channel.on('postgres_changes', {event, schema: 'public', table}, payload => {
      diagnostic('database-event', realtimeMetadata(payload, table, event));
      signal();
     });
    }
    // A fresh connection repairs any events missed during reconnect. Each connection
    // revalidates Auth and active staff. Postgres Changes additionally applies row RLS.
    controller.enqueue(encoder.encode('retry: 3000\n\n'));
    // SSE comments keep an idle transport active; they are not message events.
    // They do not extend Vercel maxDuration; only actual termination ends this stream.
    heartbeat = setInterval(() => {
     if (!closed) {try {controller.enqueue(encoder.encode(': keepalive\n\n'));} catch {void dispose();}}
    }, 15000);
    request.signal.addEventListener('abort', dispose, {once: true});
    if (request.signal.aborted) {dispose(); return;}
    diagnostic('subscribe');
    channel.subscribe(status => {
     channelStatus = status;
     diagnostic('status');
     if (status === 'SUBSCRIBED' && !closed) controller.enqueue(encoder.encode('data: connected\n\n'));
     else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) dispose();
    });
   },
   cancel() {return dispose();},
  });
  return new Response(stream, {headers: {
   'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
   'X-Accel-Buffering': 'no',
  }});
 } catch { return new Response(null, {status: 503}); }
}
