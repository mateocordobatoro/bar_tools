import {sequence} from './config';
type Sale={time:string;menuItem:string;quantity:number;server:string;saleId:string};
export type DemoView={running:boolean;pending:boolean;ready:boolean;uncertain:boolean;message:string;feed:Sale[]};
/** Page-owned timer only; no persistent/background executor. */
export function createDemoController(request:(method:string,body?:unknown)=>Promise<any>,emit:(s:DemoView)=>void,
 schedule:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>=setTimeout,cancel:typeof clearTimeout=clearTimeout, pendingStore?:{read:()=>{execution:string;index:number}|null;write:(p:{execution:string;index:number}|null)=>void}) {
 let state:DemoView={running:false,pending:false,ready:false,uncertain:false,message:'Checking demo fixtures…',feed:[]};
 let timer:ReturnType<typeof setTimeout>|undefined,disposed=false,inflight:Promise<void>|undefined;
 let execution='',index=0;
 const publish=()=>{if(!disposed)emit({...state,feed:[...state.feed]});};
 const stop=()=>{state.running=false;cancel(timer);publish();};
 const check=async()=>{try{const saved=pendingStore?.read();if(saved){execution=saved.execution;index=saved.index;state.uncertain=true;state.ready=false;state.message='Unconfirmed sale restored. Retry same sale before reset.';publish();return;}const s=await request('GET');state.ready=s.ready;state.message=s.openWork?'Finish demo work before reset.':s.ready?'Normal day · about 60 seconds':'Reset demo before starting.';}catch{state.ready=false;state.message='Dedicated demo fixtures are not ready.';}publish();};
 const tick=():Promise<void>=>{
  if(inflight||disposed)return inflight??Promise.resolve();
  state.pending=true;publish();
  inflight=(async()=>{try{
   pendingStore?.write({execution,index});
   const sale=await request('POST',{execution,index});pendingStore?.write(null);state.feed=[sale,...state.feed].slice(0,5);state.uncertain=false;index++;
   state.message=index===sequence.length?'Simulated day complete.':'Sales recorded.';
  }catch{state.running=false;state.uncertain=true;state.message='Technical error: sale result unconfirmed. Retry this sale before reset.';}
  finally{state.pending=false;inflight=undefined;if(index===sequence.length)state.running=false;publish();
   if(state.running&&!disposed)timer=schedule(()=>{void tick();},3000);
  }})();return inflight;
 };
 return {
  check,
  start(){if(!state.ready||state.running||state.pending||state.uncertain||disposed)return;execution=`${Date.now()}:${crypto.randomUUID()}`;index=0;state.ready=false;state.running=true;state.feed=[];void tick();},
  stop,
  retry(){if(state.uncertain&&!state.pending){state.running=false;return tick();}},
  async reset(){stop();await inflight;if(state.uncertain||disposed)return;state.pending=true;state.ready=false;publish();
   try{await request('DELETE');await check();}catch{state.ready=false;state.message='Reset incomplete. Stop other demo activity and restore again.';}
   finally{state.pending=false;publish();}
  },
  dispose(){disposed=true;stop();},
 };
}
