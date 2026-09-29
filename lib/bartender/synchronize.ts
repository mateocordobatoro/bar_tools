/** Coalesces signals and retains a trailing read if changes arrive during a read/write. */
export function synchronize(read: () => Promise<unknown>, blocked: () => boolean,
 schedule = (fn: () => void) => setTimeout(fn, 350), cancel = clearTimeout) {
 let dirty = false, running = false, stopped = false;
 let timer: ReturnType<typeof setTimeout> | undefined;
 const queue = () => {
  if (stopped || timer || running) return;
  timer = schedule(() => {timer = undefined; void flush();});
 };
 const flush = async () => {
  if (stopped || !dirty) return;
  if (blocked()) {queue(); return;}
  dirty = false; running = true;
  try {await read();} finally {running = false; if (dirty) queue();}
 };
 return {
  invalidate() {if (!stopped) {dirty = true; queue();}},
  stop() {stopped = true; dirty = false; cancel(timer);},
 };
}
