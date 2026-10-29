import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {useStore} from './store';

const SEG=12,FORK=4,PER_BOLT=SEG+FORK;
type Bolt={curve:number;s:number;len:number;speed:number;age:number;life:number;fork:boolean};

export {stormLevel} from './stormLevel';

/** Fast jagged arcs running along the copper traces. Buffers are allocated once
 *  and rewritten in place, so a long session does not leak GPU memory. */
export function Lightning({curves,storm}:{curves:THREE.Curve<THREE.Vector3>[];storm:{current:number}}){
 const quality=useStore(v=>v.quality),reduced=useStore(v=>v.reduced),size=useThree(v=>v.size);
 const max=quality==='high'?6:3;
 const {geometry,core,glow,objects,buffer}=useMemo(()=>{
  const geometry=new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(max*PER_BOLT*6));
  const common={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,worldUnits:false} as const;
  const core=new LineMaterial({...common,linewidth:2.4});core.color.setRGB(3,2,1.7);
  const glow=new LineMaterial({...common,linewidth:10});glow.color.setRGB(1.9,.22,.12);
  const objects=[new LineSegments2(geometry,glow),new LineSegments2(geometry,core)];
  objects.forEach(o=>{o.frustumCulled=false;o.renderOrder=5;o.raycast=()=>{}});
  const buffer=(geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
  geometry.instanceCount=0;
  return {geometry,core,glow,objects,buffer};
 },[max]);
 useEffect(()=>()=>{geometry.dispose();core.dispose();glow.dispose()},[geometry,core,glow]);
 useEffect(()=>{core.resolution.set(size.width,size.height);glow.resolution.set(size.width,size.height)},[core,glow,size]);
 const bolts=useRef<Bolt[]>([]),clock=useRef(0);
 const v=useMemo(()=>({p:new THREE.Vector3(),t:new THREE.Vector3(),n:new THREE.Vector3(),prev:new THREE.Vector3(),fork:new THREE.Vector3()}),[]);
 useFrame((_,dt)=>{
  const level=reduced?0:storm.current,step=Math.min(dt,.05);
  const wanted=level<.03||!curves.length?0:Math.max(1,Math.round(level*max));
  const spawn=():Bolt=>({curve:Math.floor(Math.random()*curves.length),s:-Math.random()*.3,len:.16+Math.random()*.22,speed:1.4+Math.random()*1.8,age:0,life:.18+Math.random()*.35,fork:Math.random()<.45});
  while(bolts.current.length<wanted)bolts.current.push(spawn());
  bolts.current.length=Math.min(bolts.current.length,wanted);
  clock.current+=step;
  if(clock.current<1/40)return; // re-strike ~40 times a second: flicker without per-frame cost
  const elapsed=clock.current;clock.current=0;
  const array=buffer.array as Float32Array;let w=0;
  const put=(a:THREE.Vector3,b:THREE.Vector3)=>{array[w++]=a.x;array[w++]=a.y;array[w++]=a.z;array[w++]=b.x;array[w++]=b.y;array[w++]=b.z};
  for(let i=0;i<bolts.current.length;i++){
   let b=bolts.current[i];
   b.s+=b.speed*elapsed;b.age+=elapsed;
   if(b.age>b.life||b.s>1)b=bolts.current[i]=spawn();
   const curve=curves[b.curve],amp=.06+.08*level;
   for(let k=0;k<=SEG;k++){
    const u=Math.max(0,Math.min(1,b.s+b.len*k/SEG));
    curve.getPointAt(u,v.p);curve.getTangentAt(u,v.t);
    v.n.set(-v.t.z,0,v.t.x).normalize();
    const pinned=Math.sin(Math.PI*k/SEG)**.6;
    v.p.addScaledVector(v.n,(Math.random()*2-1)*amp*pinned);v.p.y+=.03+Math.random()*.05*pinned;
    if(k>0)put(v.prev,v.p);
    if(k===SEG>>1)v.fork.copy(v.p);
    v.prev.copy(v.p);
   }
   if(b.fork){
    v.prev.copy(v.fork);const side=Math.random()<.5?-1:1;
    for(let k=1;k<=FORK;k++){
     v.p.copy(v.prev).addScaledVector(v.n,side*(.04+Math.random()*.05)).addScaledVector(v.t,(Math.random()-.3)*.06);v.p.y+=Math.random()*.03;
     put(v.prev,v.p);v.prev.copy(v.p);
    }
   }
  }
  geometry.instanceCount=w/6;buffer.needsUpdate=true;
  const flicker=.55+.45*Math.random();
  core.opacity=Math.min(1,.45+level)*flicker;glow.opacity=Math.min(.7,.25+level*.6)*flicker;
 });
 return <>{objects.map((o,i)=><primitive key={i} object={o}/>)}</>;
}
