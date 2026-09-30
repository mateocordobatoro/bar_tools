'use client';
import {useEffect,useRef,useState} from 'react';
import {createDemoController,type DemoView} from '@/lib/sales-demo/controller';
export default function SalesDemo(){
 const [state,setState]=useState<DemoView>({running:false,pending:false,ready:false,uncertain:false,message:'Checking demo fixtures…',feed:[]});
 const controller=useRef<ReturnType<typeof createDemoController>|null>(null);
 useEffect(()=>{
  const c=createDemoController(async(method,body)=>{
   const response=await fetch('/api/management/demo',{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Demo unavailable');return response.json();
  },setState,setTimeout,clearTimeout,{
   read:()=>{const value=sessionStorage.getItem('demo60:pending');return value?JSON.parse(value):null;},
   write:value=>{if(value)sessionStorage.setItem('demo60:pending',JSON.stringify(value));else sessionStorage.removeItem('demo60:pending');},
  });controller.current=c;void c.check();return()=>{c.dispose();controller.current=null;};
 },[]);
 return <section className="card" aria-label="Preview sales demo"><h2>Preview demo</h2><p>Normal day · simulated sales</p>
 <p>Use one management window. Stop demo sales and finish demo production before resetting.</p>
 <div className="recipe-actions"><button disabled={!state.ready||state.running||state.pending||state.uncertain} onClick={()=>controller.current?.start()}>Start simulated day</button>
 <button disabled={!state.running} onClick={()=>controller.current?.stop()}>Stop</button>
 <button disabled={state.pending||state.uncertain} onClick={()=>{if(window.confirm('Restore only dedicated demo stock? Ledger history and sales will remain.'))void controller.current?.reset();}}>Reset demo</button>
 {state.uncertain&&<button disabled={state.pending} onClick={()=>void controller.current?.retry()}>Retry same sale</button>}</div>
 <p role="status">{state.message}</p><ul aria-label="Latest demo sales">{state.feed.map(s=><li key={s.saleId}>{s.time} · {s.menuItem} · ×{s.quantity} · {s.server}</li>)}</ul></section>;
}
