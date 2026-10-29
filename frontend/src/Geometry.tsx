import {memo,useLayoutEffect,useMemo} from 'react';
import * as THREE from 'three';
import type {ThreeEvent} from '@react-three/fiber';
import type {Focus} from './types';
import {pick,sceneFocus,useStore} from './store';
export type V3=[number,number,number];
export type Part={p:V3;s:V3;c:string;kind?:'cylinder'|'box';r?:V3;target?:Focus;metal?:boolean};
export const P=(p:V3,s:V3,c='#302726',extra:Partial<Part>={}):Part=>({p,s,c,...extra});
function Batch({parts,kind,metal}:{parts:Part[];kind:'box'|'cylinder';metal:boolean}){
 const mesh=useMemo(()=>new THREE.InstancedMesh(kind==='box'?new THREE.BoxGeometry(1,1,1):new THREE.CylinderGeometry(.5,.5,1,12),new THREE.MeshPhysicalMaterial({color:'white',roughness:metal?.38:.72,metalness:metal?.85:.16,clearcoat:metal?.1:.15}),parts.length),[parts.length,kind,metal]);
 const focus=useStore(sceneFocus);
 useLayoutEffect(()=>{const obj=new THREE.Object3D(),color=new THREE.Color();parts.forEach((p,i)=>{obj.position.set(...p.p);obj.scale.set(...p.s);obj.rotation.set(...(p.r??[0,0,0]));obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);color.set(p.c);if(focus&&p.target&&p.target!==focus&&!(focus.startsWith('container:')&&p.target==='docker')&&!(focus==='docker'&&p.target.startsWith('container:')))color.multiplyScalar(.46);mesh.setColorAt(i,color)});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere()},[mesh,parts,focus]);
 useLayoutEffect(()=>()=>{mesh.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose()},[mesh]);
 const click=(e:ThreeEvent<MouseEvent>)=>{const target=parts[e.instanceId??-1]?.target;if(target){e.stopPropagation();pick(target)}};
 return <primitive object={mesh} onClick={click} onPointerOver={(e:ThreeEvent<PointerEvent>)=>{if(parts[e.instanceId??-1]?.target){e.stopPropagation();document.body.style.cursor='pointer'}}} onPointerOut={()=>{document.body.style.cursor='auto'}}/>;
}
export const Parts=memo(function Parts({parts}:{parts:Part[]}){return <>{(['box','cylinder'] as const).flatMap(kind=>[false,true].map(metal=>{const selected=parts.filter(p=>(p.kind??'box')===kind&&!!p.metal===metal);return selected.length?<Batch key={`${kind}-${metal}`} parts={selected} kind={kind} metal={metal}/>:null}))}</>})
export function motherboardParts():Part[]{
 const p:Part[]=[P([0,-.15,0],[9.8,.2,8],'#291615'),P([0,-.31,0],[10,.12,8.2],'#171110',{metal:true}),P([0,-.25,0],[10.9,.1,8.8],'#2c2524',{metal:true})];
 for(const x of [-4.5,4.5])for(const z of [-3.6,0,3.6])p.push(P([x,.01,z],[.24,.1,.24],'#887c7c',{kind:'cylinder',metal:true}));
 // Capacitors and voltage-regulator chokes remain physically still.
 for(let i=0;i<14;i++)p.push(P([-2.55+i*.22,.25,-2.6],[.16,.5,.16],'#7c6f6f',{kind:'cylinder',metal:true,target:'cpu'}));
 for(let i=0;i<8;i++){p.push(P([-2.65,.22,-1.9+i*.3],[.2,.45,.2],'#a39a99',{kind:'cylinder',metal:true,target:'cpu'}));p.push(P([-2.22,.16,-1.9+i*.3],[.3,.3,.27],'#3d3433',{target:'cpu'}))}
 p.push(P([-1,.07,-1.1],[2.6,.1,2.5],'#211c1c',{target:'cpu'}));
 for(let i=0;i<3;i++){p.push(P([-2,.12,1.7+i*.64],[3.5,.24,.2],i===0?'#4b4241':'#211918'));for(let x=0;x<22;x++)p.push(P([-3.52+x*.14,.255,1.7+i*.64],[.055,.018,.08],'#948a59',{metal:true}))}
 for(let i=0;i<4;i++){p.push(P([2+i*.48,.1,-1.1],[.19,.2,3.2],'#2b2221',{target:'memory'}));for(const z of [-2.8,.6])p.push(P([2+i*.48,.15,z],[.3,.3,.18],'#80817a',{target:'memory'}))}
 for(let i=0;i<3;i++)p.push(P([3.5+i*.38,.22,2.6],[.3,.44,.55],'#2d2322'));
 p.push(P([4.45,.22,-.6],[.35,.45,2.1],'#272120',{target:'power'}));for(let i=0;i<12;i++)p.push(P([4.43,.45,-1.5+i*.16],[.22,.05,.075],'#927f7e',{metal:true}));
 // Chipset fins, rear I/O and vacant PCIe: no discrete GPU.
 p.push(P([.4,.08,1.5],[1.35,.14,1.25],'#201a19',{metal:true}));for(let i=0;i<10;i++)p.push(P([-.2+i*.13,.3,1.5],[.05,.44,1.2],'#584b4b',{metal:true}));
 for(let i=0;i<6;i++)if(i!==3)p.push(P([-4.65,.35,-2.9+i*.58],[.5,.7,.43],'#5d5453',{metal:true}));
 for(let i=0;i<38;i++){const x=-4+(i*1.61)%8,z=-3.6+(i*2.27)%7.2;if(Math.abs(x+1)<1.6&&Math.abs(z+1)<1.5)continue;p.push(P([x,.065,z],[.15,.12,.24],'#473838'))}
 // PSU, SATA cable retaining clips, board edge markings.
 p.push(P([-2,.55,-5.6],[3.4,1.4,2.2],'#312827',{metal:true,target:'power'}));for(let i=0;i<13;i++)p.push(P([-3.4+i*.23,1.265,-5.6],[.08,.03,1.7],'#170f0e',{target:'power'}));
 for(let i=0;i<22;i++)p.push(P([-.1+i*.19,.02,3.73],[.07,.04,.15],'#8b7574',{metal:true}));
 // Fine copper routes, plated vias and paired SMD resistors use the same four
 // instanced batches as the board. Detail does not add a draw call per part.
 for(let i=0;i<42;i++){
  const x=-3.9+(i%14)*.57,z=2.98+Math.floor(i/14)*.2;
  p.push(P([x,.006,z],[.37,.008,.015],'#a55248',{metal:true}));
  p.push(P([x+.2,.014,z],[.052,.013,.052],'#be9a79',{kind:'cylinder',metal:true}));
 }
 for(let i=0;i<54;i++){
  const x=-3.95+(i%18)*.43,z=-3.65+Math.floor(i/18)*.14;
  p.push(P([x,.032,z],[.14,.048,.065],'#38302f'));
  for(const dx of [-.08,.08])p.push(P([x+dx,.034,z],[.035,.045,.065],'#9e8e89',{metal:true}));
 }
 for(const [x,z] of [[-3.35,.3],[1.3,2.65],[3.8,1.1],[-3.25,-2.9]]){
  p.push(P([x,.09,z],[.46,.14,.42],'#241b1a',{target:'power'}));
  for(let i=0;i<6;i++)for(const side of [-1,1])p.push(P([x-.18+i*.073,.07,z+side*.25],[.035,.055,.14],'#a99790',{metal:true,target:'power'}));
 }
 // CMOS cell, its clip, socket latch and red anodised VRM heatsinks.
 p.push(P([-.35,.08,2.85],[.64,.13,.64],'#9b9696',{kind:'cylinder',metal:true}),P([-.35,.16,2.85],[.65,.03,.1],'#b8b0a3',{metal:true}));
 p.push(P([.37,.15,-1.1],[.055,.07,2.4],'#d2bbb0',{metal:true,target:'cpu'}),P([.21,.17,.06],[.36,.06,.055],'#d2bbb0',{metal:true,target:'cpu'}));
 for(let i=0;i<18;i++)p.push(P([-2.85,.26,-2.4+i*.125],[.34,.49,.035],'#91322d',{metal:true,target:'cpu'}));
 for(const x of [-4.5,4.5])for(const z of [-3.6,0,3.6]){
  p.push(P([x,.074,z],[.17,.035,.17],'#b5a6a4',{kind:'cylinder',metal:true}));
  p.push(P([x,.094,z],[.105,.008,.024],'#302323'));
 }
 return p;
}
