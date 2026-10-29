import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import * as THREE from 'three';
import {Parts,P} from './Geometry';
import type {Part,V3} from './Geometry';
import {activateLabel} from './interaction';
import {diskKey,pct} from './metrics';
import {pick,sceneFocus,useStore} from './store';
import type {Disk,Focus} from './types';
import {SSD_NAND} from './layout';

const STEEL='#4a4443',CAST='#57514f',BLACK='#141110',GOLD='#d2a35c';

/** Bay caddy shared by every position, occupied or not. */
function trayParts(key:Focus):Part[]{
 const p:Part[]=[P([0,.02,0],[3,.04,3.56],'#221a19',{metal:true,target:key})];
 for(const x of [-1.44,1.44]){
  p.push(P([x,.2,0],[.07,.36,3.56],'#3b3231',{metal:true,target:key}));
  for(const z of [-1.2,0,1.2])p.push(P([x+Math.sign(x)*.04,.22,z],[.03,.1,.1],'#a79c97',{metal:true,target:key}));
 }
 return p;
}

function hddParts(key:Focus):Part[]{
 const p=trayParts(key);
 // Cast tub: floor, four walls, dark inner floor.
 p.push(P([0,.1,0],[2.6,.12,3.4],CAST,{metal:true,target:key}));
 for(const x of [-1.25,1.25])p.push(P([x,.38,0],[.1,.44,3.4],CAST,{metal:true,target:key}));
 for(const z of [-1.65,1.65])p.push(P([0,.38,z],[2.4,.44,.1],CAST,{metal:true,target:key}));
 p.push(P([0,.165,0],[2.4,.012,3.2],'#191514',{target:key}));
 // Voice-coil magnet with its steel yoke on two posts.
 p.push(P([.72,.23,1.3],[.9,.12,.48],'#262221',{metal:true,target:key}),P([.72,.435,1.3],[.9,.03,.48],'#6f6966',{metal:true,target:key}));
 for(const x of [.33,1.11])p.push(P([x,.33,1.3],[.08,.2,.08],'#8d8683',{kind:'cylinder',metal:true,target:key}));
 // Head parking ramp, air filter, flex cable to the board.
 p.push(P([1.06,.3,-.28],[.14,.26,.3],'#d6ccc0',{target:key}),P([-.98,.25,1.4],[.24,.16,.18],'#b9b2aa',{target:key}),P([.22,.18,1],[.5,.02,.3],'#7d4a22',{target:key}));
 // SATA + power connector on the rear edge.
 p.push(P([-.3,.16,1.74],[1.7,.16,.1],BLACK,{target:key}));
 for(let i=0;i<14;i++)p.push(P([-1.05+i*.115,.2,1.795],[.05,.03,.03],GOLD,{metal:true,target:key}));
 return p;
}

const SSD_Z=.38;
function ssdParts(key:Focus):Part[]{
 const p=trayParts(key);
 // 3.5" → 2.5" adapter bracket with vent slots.
 p.push(P([0,.07,0],[2.6,.05,3.4],STEEL,{metal:true,target:key}));
 for(const x of [-1.24,1.24])p.push(P([x,.16,0],[.08,.18,3.4],STEEL,{metal:true,target:key}));
 for(const z of [-1.1,0,1.1])for(const x of [-1.04,1.04])p.push(P([x,.097,z],[.2,.008,.5],'#191514',{target:key}));
 // 2.5" shell, pushed to the connector end of the bracket.
 p.push(P([0,.125,SSD_Z],[1.8,.06,2.56],'#2b2524',{metal:true,target:key}));
 for(const x of [-.87,.87])p.push(P([x,.2,SSD_Z],[.06,.12,2.56],'#2b2524',{metal:true,target:key}));
 p.push(P([0,.2,SSD_Z-1.25],[1.68,.12,.06],'#2b2524',{metal:true,target:key}));
 // Board: NAND packages, controller under a heat spreader, DRAM cache, capacitors.
 p.push(P([0,.165,SSD_Z],[1.66,.02,2.44],'#4a1512',{target:key}));
 for(const [x,z] of SSD_NAND){
  p.push(P([x,.2,z],[.5,.05,.6],'#171313',{target:key}));
  for(let i=0;i<6;i++)for(const side of [-1,1])p.push(P([x+side*.262,.182,z-.22+i*.088],[.03,.012,.03],'#b9aaa4',{metal:true,target:key}));
 }
 p.push(P([-.38,.2,SSD_Z+.72],[.44,.05,.44],'#211d1c',{target:key}),P([-.38,.236,SSD_Z+.72],[.34,.012,.34],'#8f8884',{metal:true,target:key}));
 p.push(P([.36,.195,SSD_Z+.72],[.5,.04,.3],'#171313',{target:key}));
 for(let i=0;i<5;i++)p.push(P([-.6+i*.3,.195,SSD_Z+1.05],[.09,.04,.06],'#b98b4f',{metal:true,target:key}));
 for(let i=0;i<5;i++)p.push(P([-.7+i*.35,.182,SSD_Z-.1],[.014,.008,1.5],'#b9773f',{metal:true,target:key}));
 // SATA connector.
 p.push(P([-.1,.17,SSD_Z+1.3],[1.4,.1,.1],BLACK,{target:key}));
 for(let i=0;i<12;i++)p.push(P([-.72+i*.113,.2,SSD_Z+1.36],[.05,.02,.03],GOLD,{metal:true,target:key}));
 return p;
}

/** One opacity for the whole cover: closed in the overview, a ghost in focus. */
function useCover(open:boolean){
 const group=useRef<THREE.Group>(null),reduced=useStore(v=>v.reduced),value=useRef(1);
 useFrame((_,dt)=>{
  const target=open?.05:1;
  value.current=reduced?target:THREE.MathUtils.damp(value.current,target,14,Math.min(dt,.05));
  group.current?.traverse(object=>{
   const material=(object as THREE.Mesh).material as THREE.Material|undefined;
   if(!material)return;
   // The bare cover stays as a faint ghost; anything printed on it must not hang over the internals.
   if(object.userData.decal){object.visible=value.current>.55;return}
   material.opacity=value.current;material.depthWrite=value.current>.6;
  });
 });
 return group;
}

function UsageRing({disk}:{disk:Disk}){
 return <mesh rotation={[-Math.PI/2,0,0]} position={[0,.01,0]}><ringGeometry args={[2.25,2.3,80,1,0,Math.PI*2*(pct(disk.used_gb,disk.size_gb)??0)/100]}/><meshBasicMaterial color="#da4f48" transparent opacity={.7} side={THREE.DoubleSide}/></mesh>;
}

/** Busy light on the side that faces the camera; brightness follows real I/O. */
function useActivityLed(disk:Disk,live:boolean){
 const material=useRef<THREE.MeshStandardMaterial>(null),reduced=useStore(v=>v.reduced);
 useFrame(({clock})=>{
  if(!material.current)return;
  const io=(disk.read_mbs??0)+(disk.write_mbs??0),busy=Math.min(1,io/10+(disk.iops??0)/400);
  const flicker=reduced?1:.6+.4*Math.sin(clock.elapsedTime*(10+busy*22));
  material.current.emissiveIntensity=live?.5+busy*3.2*flicker:0;
 });
 return material;
}

function HardDrive({disk,live,focusKey}:{disk:Disk;live:boolean;focusKey:Focus}){
 const open=useStore(v=>sceneFocus(v)===focusKey||v.cineOpen===focusKey),reduced=useStore(v=>v.reduced);
 const parts=useMemo(()=>hddParts(focusKey),[focusKey]);
 const cover=useCover(open),led=useActivityLed(disk,live);
 const platters=useRef<THREE.Group>(null),arm=useRef<THREE.Group>(null),seek=useRef({angle:-.2,next:0});
 const select=(e:{stopPropagation:()=>void})=>{e.stopPropagation();pick(focusKey)};
 useFrame(({clock},dt)=>{
  const step=Math.min(dt,.05),standby=disk.smart?.status==='standby',spinning=live&&!standby;
  // Real platters turn far too fast to see; this is a readable constant spin.
  if(platters.current&&spinning&&!reduced)platters.current.rotation.y-=step*9;
  if(!arm.current)return;
  const iops=disk.iops??0;
  // -0.2 parked on the ramp, 0 outer track, 0.5 inner track.
  if(!spinning)seek.current.angle=-.2;
  else if(iops<=0||reduced)seek.current.angle=.06;
  else if(clock.elapsedTime>=seek.current.next){
   seek.current.angle=.02+Math.random()*.46;
   seek.current.next=clock.elapsedTime+.08+Math.random()*Math.max(.12,.9-iops/300);
  }
  arm.current.rotation.y=reduced?seek.current.angle:THREE.MathUtils.damp(arm.current.rotation.y,seek.current.angle,spinning?18:4,step);
 });
 return <>
  <Parts parts={parts}/>
  <group ref={platters} position={[-.12,0,-.42]} onClick={select}>
   {[.27,.35].map(y=><mesh key={y} position={[0,y,0]}><cylinderGeometry args={[1.02,1.02,.022,64]}/><meshPhysicalMaterial color="#ece7e2" metalness={.9} roughness={.16} envMapIntensity={2.4}/></mesh>)}
   <mesh position={[0,.368,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.42,.97,64]}/><meshBasicMaterial color="#ffd9c8" transparent opacity={.07}/></mesh>
   <mesh position={[0,.31,0]}><cylinderGeometry args={[.26,.26,.14,32]}/><meshStandardMaterial color="#77706d" metalness={.9} roughness={.35}/></mesh>
   <mesh position={[0,.377,0]}><cylinderGeometry args={[.3,.3,.03,32]}/><meshStandardMaterial color="#b5aeaa" metalness={.95} roughness={.25}/></mesh>
   {Array.from({length:6},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/3)*.2,.394,Math.sin(i*Math.PI/3)*.2]}><cylinderGeometry args={[.03,.03,.012,10]}/><meshStandardMaterial color="#2b2625" metalness={.8} roughness={.4}/></mesh>)}
  </group>
  <group ref={arm} position={[.78,0,.98]} rotation={[0,-.2,0]} onClick={select}>
   <mesh position={[0,.32,0]}><cylinderGeometry args={[.13,.13,.3,24]}/><meshStandardMaterial color="#a9a29e" metalness={.95} roughness={.3}/></mesh>
   <mesh position={[0,.4,-.3]}><boxGeometry args={[.26,.05,.5]}/><meshStandardMaterial color="#8f8884" metalness={.95} roughness={.3}/></mesh>
   <mesh position={[0,.4,-.76]}><boxGeometry args={[.15,.03,.46]}/><meshStandardMaterial color="#8f8884" metalness={.95} roughness={.3}/></mesh>
   <mesh position={[0,.39,-1.1]}><boxGeometry args={[.08,.012,.34]}/><meshStandardMaterial color="#d8d1cb" metalness={1} roughness={.2}/></mesh>
   <mesh position={[0,.378,-1.27]}><boxGeometry args={[.07,.022,.06]}/><meshStandardMaterial color="#0e0c0c" roughness={.5}/></mesh>
   <mesh position={[0,.36,.32]}><boxGeometry args={[.5,.05,.36]}/><meshStandardMaterial color="#a8642f" metalness={.8} roughness={.45}/></mesh>
  </group>
  <mesh position={[1.305,.42,-1]}><boxGeometry args={[.02,.05,.3]}/><meshStandardMaterial ref={led} color="#3a1512" emissive="#ff4a3d" toneMapped={false}/></mesh>
  <group ref={cover} onClick={select}>
   <mesh position={[0,.625,0]}><boxGeometry args={[2.6,.05,3.4]}/><meshPhysicalMaterial color="#9b9591" metalness={.9} roughness={.32} transparent/></mesh>
   <mesh position={[-.12,.66,-.42]}><cylinderGeometry args={[1.08,1.08,.024,64]}/><meshPhysicalMaterial color="#a8a29e" metalness={.9} roughness={.28} transparent/></mesh>
   <mesh position={[.72,.66,1.12]}><boxGeometry args={[.95,.024,.8]}/><meshPhysicalMaterial color="#a8a29e" metalness={.9} roughness={.28} transparent/></mesh>
   <mesh userData={{decal:true}} position={[-.55,.662,1.12]}><boxGeometry args={[1.3,.014,.82]}/><meshStandardMaterial color="#e4dfd6" roughness={.85} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8}/></mesh>
   <mesh userData={{decal:true}} position={[-.55,.676,.8]}><boxGeometry args={[1.3,.014,.14]}/><meshStandardMaterial color="#b3261e" roughness={.7} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8}/></mesh>
   {[0,1,2,3,4,5,6].map(i=><mesh userData={{decal:true}} key={i} position={[-1.05+i*.07,.676,1.34]}><boxGeometry args={[i%3?.02:.04,.014,.2]}/><meshStandardMaterial color="#231d1c" roughness={.8} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8}/></mesh>)}
   {([[-1.18,-1.58],[1.18,-1.58],[-1.18,1.58],[1.18,1.58],[-1.18,0],[1.18,0]] as const).map(([x,z])=><mesh key={`${x}:${z}`} position={[x,.655,z]}><cylinderGeometry args={[.055,.055,.02,12]}/><meshStandardMaterial color="#3a3534" metalness={.8} roughness={.4} transparent/></mesh>)}
  </group>
  {open&&<UsageRing disk={disk}/>}
 </>;
}

function SolidState({disk,live,focusKey}:{disk:Disk;live:boolean;focusKey:Focus}){
 const open=useStore(v=>sceneFocus(v)===focusKey||v.cineOpen===focusKey);
 const parts=useMemo(()=>ssdParts(focusKey),[focusKey]);
 const cover=useCover(open),led=useActivityLed(disk,live);
 const select=(e:{stopPropagation:()=>void})=>{e.stopPropagation();pick(focusKey)};
 return <>
  <Parts parts={parts}/>
  <mesh position={[.905,.2,SSD_Z-.6]}><boxGeometry args={[.02,.035,.5]}/><meshStandardMaterial ref={led} color="#3a1512" emissive="#ff4a3d" toneMapped={false}/></mesh>
  <group ref={cover} onClick={select}>
   <mesh position={[0,.275,SSD_Z]}><boxGeometry args={[1.8,.03,2.56]}/><meshPhysicalMaterial color="#3a3332" metalness={.85} roughness={.4} transparent/></mesh>
   <mesh userData={{decal:true}} position={[0,.298,SSD_Z-.1]}><boxGeometry args={[1.36,.012,1.7]}/><meshStandardMaterial color="#ded8cf" roughness={.85} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8}/></mesh>
   <mesh userData={{decal:true}} position={[0,.31,SSD_Z-.72]}><boxGeometry args={[1.36,.012,.34]}/><meshStandardMaterial color="#b3261e" roughness={.7} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8}/></mesh>
   {[0,.15,.3].map((dz,i)=><mesh userData={{decal:true}} key={dz} position={[-.18-i*.1,.31,SSD_Z+dz]}><boxGeometry args={[.8-i*.2,.012,.05]}/><meshStandardMaterial color="#2a2423" roughness={.8} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-8}/></mesh>)}
   {([[-.78,-1.16],[.78,-1.16],[-.78,1.16],[.78,1.16]] as const).map(([x,z])=><mesh key={`${x}:${z}`} position={[x,.292,SSD_Z+z]}><cylinderGeometry args={[.045,.045,.012,12]}/><meshStandardMaterial color="#8f8884" metalness={.9} roughness={.35} transparent/></mesh>)}
  </group>
  {open&&<UsageRing disk={disk}/>}
 </>;
}

function EmptyBay({disk,focusKey}:{disk:Disk;focusKey:Focus}){
 const parts=useMemo(()=>trayParts(focusKey),[focusKey]);
 const missing=disk.kind==='unavailable',cinematic=useStore(v=>v.cinematic);
 return <>
  <Parts parts={parts}/>
  <mesh position={[0,.34,0]} onClick={e=>{e.stopPropagation();pick(focusKey)}}><boxGeometry args={[2.6,.58,3.4]}/><meshBasicMaterial color={missing?'#e0413e':'#6b4f4d'} wireframe transparent opacity={.45}/></mesh>
  {!cinematic&&<Html center position={[0,.5,0]}><button className="bay-label" onPointerDown={e=>e.stopPropagation()} onClick={e=>activateLabel(e,focusKey,useStore.getState().setFocus)}>{missing?'NOT DETECTED':'EMPTY'}<span>BAY {(disk.bay??0)+1}</span></button></Html>}
 </>;
}

export function Drive({disk,position,live}:{disk:Disk;position:V3;live:boolean}){
 const key=diskKey(disk);
 return <group position={position}>{disk.kind==='empty'||disk.kind==='unavailable'?<EmptyBay disk={disk} focusKey={key}/>:disk.kind==='hdd'?<HardDrive disk={disk} live={live} focusKey={key}/>:<SolidState disk={disk} live={live} focusKey={key}/>}</group>;
}
