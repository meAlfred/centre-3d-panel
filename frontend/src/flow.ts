/** Integrate velocity; incoming telemetry must never re-position a packet. */
export type FlowState={phase:number;load:number;step:number};
export function advanceFlow(state:FlowState,target:number,dt:number,moving=true,reverse=false){
 const time=Math.min(.05,Math.max(0,dt)),safe=Number.isFinite(target)?Math.max(0,Math.min(1,target)):0;
 const before=state.load;
 state.load+=(safe-state.load)*(1-Math.exp(-time*5));
 state.step=moving?time*(.48+1.5*(before+state.load)*.5):0;
 state.phase=((state.phase+state.step*(reverse?-1:1))%1+1)%1;
 return state;
}
/** Bounded exact critical damping, including rapid open/close reversals. */
export type LiftState={value:number;velocity:number};
export function advanceLift(state:LiftState,open:boolean,dt:number,reduced=false){
 const target=open?1:0,time=Math.min(.05,Math.max(0,dt));
 if(reduced){state.value=target;state.velocity=0;return state}
 const omega=14,offset=state.value-target,v=state.velocity+omega*offset,decay=Math.exp(-omega*time);
 const value=target+(offset+v*time)*decay;
 state.velocity=(state.velocity-omega*v*time)*decay;
 state.value=Math.max(0,Math.min(1,value));
 if(value!==state.value)state.velocity=0;
 return state;
}
