import type {Focus,Snapshot} from './types';
import {Vector3,MathUtils} from 'three';
import {DISKS_PER_COLUMN,diskPosition,disksRight,dockerLayout,ramSticks,ramX} from './layout.ts';
export type Vec3=[number,number,number];
export const RAM_LIFT=.22;
export function componentPose(focus:Focus,s:Snapshot|null):{target:Vec3;offset:Vec3;fov:number}{
 if(focus==='memory'){
  const sticks=s?ramSticks(s.memory.slots,s.memory.slots_status==='ok',s.memory.total_mb):[];
  const x=sticks.length?sticks.reduce((sum,stick)=>sum+ramX(stick.socket),0)/sticks.length:2.72;
  return {target:[x,.78+RAM_LIFT,-1.1],offset:[5.6,3.9,5.6],fov:37};
 }
 if(focus==='cpu')return {target:[-1,1.3,-1.1],offset:[4.8,5.4,6.8],fov:38};
 if(focus==='network')return {target:[-4.65,.4,-1.16],offset:[-4.2,3.4,4.8],fov:36};
 if(focus==='power')return {target:[-2,.55,-5.9],offset:[5.2,4.6,-6.8],fov:40};
 if(focus==='docker'||focus?.startsWith('container:')){
  // A bigger dock pushes the camera back instead of leaving containers out of frame.
  const dock=dockerLayout(s?.docker?.length??0),k=Math.max(1,dock.width/5.4,dock.depth/2.7);
  return {target:[dock.centre[0],.4,dock.centre[2]],offset:[3.2*k,5.8*k,7.7*k],fov:39};
 }
 if(focus?.startsWith('disk:')||focus?.startsWith('bay:')){
  const index=focus.startsWith('disk:')?s?.disks.findIndex(d=>d.id===focus.slice(5))??0:s?.disks.findIndex(d=>`bay:${d.bay}`===focus)??1;
  const bay=diskPosition(Math.max(0,index));
  return {target:[bay[0],.3,bay[2]],offset:[4.6,5.2,5.4],fov:39};
 }
 // Extra drive columns widen the machine to the right: pull back and re-centre.
 const extra=Math.max(0,Math.ceil((s?.disks.length??0)/DISKS_PER_COLUMN)-1);
 return {target:[.5+extra*1.6,.2,.3],offset:[13*(1+extra*.18),17*(1+extra*.18),20*(1+extra*.18)],fov:43};
}
export function focusScreenX(width:number,desktop=width>800){
 // Panel lives inside the canvas area. At desktop widths the component and
 // panel form one centred composition; mobile uses a lower details sheet.
 if(!desktop)return 0;
 const panel=Math.min(360,width*.32),gap=24;
 return -(panel+gap)/width;
}
export function cameraFrame(focus:Focus,s:Snapshot|null,width:number,height:number,desktop=width>800){
 const pose=componentPose(focus,s),target=new Vector3(...pose.target);
 const offset=new Vector3(...pose.offset);
 if(!desktop&&!focus)offset.set(10,17,17);
 if(!desktop&&!focus){
  // Fit the actual overview footprint to portrait width. A fixed distance
  // that works on desktop crops the SSD and rear I/O on tall phones.
  const forward=offset.clone().negate().normalize(),r=new Vector3().crossVectors(forward,new Vector3(0,1,0)).normalize(),up=new Vector3().crossVectors(r,forward);
  const tan=Math.tan(MathUtils.degToRad(pose.fov/2)),aspect=width/Math.max(1,height);
  for(let pass=0;pass<8;pass++){
   let ratio=1;
   const dock=dockerLayout(s?.docker?.length??0),far=Math.max(7.8,dock.centre[2]+dock.depth/2+.2);
   for(const x of [-5.6,disksRight(s?.disks.length??1)])for(const y of [-.3,2])for(const z of [-10.5,far]){
    const relative=new Vector3(x,y,z).sub(target),depth=offset.length()+relative.dot(forward);
    ratio=Math.max(ratio,Math.abs(relative.dot(r))/(depth*tan*aspect*.9),Math.abs(relative.dot(up))/(depth*tan*.7));
   }
   if(ratio<=1.001)break;
   offset.multiplyScalar(ratio*1.02);
  }
 }
 const position=target.clone().add(offset),direction=offset.clone().negate().normalize();
 const right=new Vector3().crossVectors(direction,new Vector3(0,1,0)).normalize();
 const shift=-focusScreenX(width,desktop)*offset.length()*Math.tan(MathUtils.degToRad(pose.fov/2))*width/Math.max(1,height);
 const lookAt=target.clone().addScaledVector(right,shift);position.addScaledVector(right,shift);
 return {target,position,lookAt,right,fov:pose.fov};
}
