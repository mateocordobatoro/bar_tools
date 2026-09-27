/** Fail closed: this unfinished operational release is Preview-only. */
export function isBartenderPreview(env:Record<string,string|undefined>) {
 return env.VERCEL_ENV!=='production' && (!env.VERCEL_ENV||env.VERCEL_ENV==='preview') &&
 env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')==='https://mfwoutniamoldcieoqvc.supabase.co';
}
