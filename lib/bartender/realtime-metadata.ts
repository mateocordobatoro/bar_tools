/** Allowlisted diagnostics only. Never serialize a row or replace commit time with receive time. */
export function realtimeMetadata(payload: unknown, table: string, event: 'INSERT'|'UPDATE') {
 const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
 const p=object(payload),wire=object(p.data);
 // Public JS callback shape, plus the documented Postgres Changes wire envelope.
 const normalized=p.schema==='public'&&p.table===table&&p.eventType===event;
 const envelope=Array.isArray(p.ids)&&wire.schema==='public'&&wire.table===table&&wire.type===event;
 const source=normalized?p:envelope?wire:{};
 const row=object(normalized?source.new:source.record);
 const column=table==='inventory_balances'?'account_id':table==='recipe_operational_settings'?'recipe_id':'id';
 const value=row[column];
 const recordId=typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null;
 const time=typeof source.commit_timestamp==='string'?Date.parse(source.commit_timestamp):NaN;
 return {schema:'public',table,eventType:event,recordId,eventTimestamp:Number.isFinite(time)?new Date(time).toISOString():null};
}
