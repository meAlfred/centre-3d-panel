import {advanceFlow} from './flow';
import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {Snapshot,Focus} from './types';
import type {V3} from './Geometry';
import {failed,mainNetwork,pct,sourceFresh} from './metrics';
import {pick,useStore} from './store';
import {SSD_NAND,containerHeight,diskPosition,dockerLayout} from './layout';
type Light={position:V3;scale:V3;color:string;level:number;pulse:number;target:Focus};
export function ActivityLights({s,live}:{s:Snapshot|null;live:boolean}){
 const reduced=useStore(v=>v.reduced);const ref=useRef<THREE.InstancedMesh>(null);const lights=useMemo(()=>{const result:Light[]=[];const net=s?mainNetwork(s):null;const traffic=(net?.rx_mbs??0)+(net?.tx_mbs??0);
 result.push({position:[-4.92,.75,-1.14],scale:[.075,.065,.08],color:'#da4f48',level:net?.link_up?.7:0,pulse:0,target:'network'},{position:[-4.92,.75,-1],scale:[.075,.065,.08],color:'#da4f48',level:traffic>0?Math.min(2,.25+traffic):0,pulse:1,target:'network'});

 const dock=dockerLayout(s?.docker.length??0);s?.docker.forEach((c,i)=>{const [x,z]=dock.slot(i),height=containerHeight(c.mem_mb);result.push({position:[dock.centre[0]+x,.094+height,dock.centre[2]+z],scale:[.5,.012,.28],color:failed(c)?'#e0413e':'#da4f48',level:sourceFresh(s,'docker')?(failed(c)?2.5:.05+Math.min(2,(c.cpu??0)/15)):0,pulse:failed(c)?.9:.1,target:`container:${c.id}`})});
 s?.disks.forEach((disk,index)=>{if(disk.kind!=='ssd'||!disk.id)return;const level=Math.min(2,((disk.read_mbs??0)+(disk.write_mbs??0))/12);const bay=diskPosition(index);for(const [x,z] of SSD_NAND)result.push({position:[bay[0]+x,.238,bay[2]+z],scale:[.24,.012,.32],color:(disk.write_mbs??0)>(disk.read_mbs??0)?'#ff3b2a':'#c8503f',level:level*.9,pulse:1,target:`disk:${disk.id}`})});
 const sensorPositions:V3[]=[[-3.35,.18,.3],[1.3,.18,2.65],[3.8,.18,1.1],[-3.25,.18,-2.9]];s?.temperatures?.slice(0,4).forEach((sensor,i)=>result.push({position:sensorPositions[i],scale:[.12,.03,.12],color:(sensor.temp_c??0)>80?'#ffbc63':'#ff443a',level:sensor.temp_c==null?0:Math.min(1.4,sensor.temp_c/60),pulse:.12,target:'power'}));
 if(s?.igpu)result.push({position:[-.2,.19,-.48],scale:[.35,.04,.25],color:'#da4f48',level:(s.igpu.busy_pct??0)/40,pulse:.3,target:'cpu'});
 return result},[s]);
 const geometry=useMemo(()=>{const g=new THREE.BoxGeometry(1,1,1);g.setAttribute('aLevel',new THREE.InstancedBufferAttribute(new Float32Array(lights.length),1));g.setAttribute('aPulse',new THREE.InstancedBufferAttribute(new Float32Array(lights.length),1));g.setAttribute('aTint',new THREE.InstancedBufferAttribute(new Float32Array(lights.length*3),3));return g},[lights.length]);
 const material=useMemo(()=>new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uLive:{value:0}},vertexShader:`attribute float aLevel;attribute float aPulse;attribute vec3 aTint;varying float vLevel;varying float vPulse;varying vec3 vTint;void main(){vLevel=aLevel;vPulse=aPulse;vTint=aTint;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;uniform float uLive;varying float vLevel;varying float vPulse;varying vec3 vTint;void main(){float pulse=1.+vPulse*sin(uTime*4.);gl_FragColor=vec4(vTint*(.06+vLevel*pulse*uLive),1.);}`}),[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useEffect(()=>()=>material.dispose(),[material]);
 useLayoutEffect(()=>{if(!ref.current)return;const obj=new THREE.Object3D(),color=new THREE.Color();lights.forEach((l,i)=>{obj.position.set(...l.position);obj.scale.set(...l.scale);obj.updateMatrix();ref.current!.setMatrixAt(i,obj.matrix);geometry.getAttribute('aLevel').setX(i,l.level);geometry.getAttribute('aPulse').setX(i,l.pulse);color.set(l.color);geometry.getAttribute('aTint').setXYZ(i,color.r,color.g,color.b)});ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();for(const key of ['aLevel','aPulse','aTint'])geometry.getAttribute(key).needsUpdate=true},[lights,geometry]);
 useFrame((_,dt)=>{if(live&&!reduced)material.uniforms.uTime.value+=Math.min(dt,.05);material.uniforms.uLive.value=live?1:0});
 return <instancedMesh ref={ref} args={[geometry,material,lights.length]} onClick={e=>{const l=lights[e.instanceId??-1];if(l){e.stopPropagation();pick(l.target)}}}/>;
}
export function NetworkPackets({s,live}:{s:Snapshot|null;live:boolean}){
 const quality=useStore(v=>v.quality),reduced=useStore(v=>v.reduced),count=quality==='high'?96:28;const net=s?mainNetwork(s):null;
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();const positions=new Float32Array(count*3);for(let i=0;i<count;i++){positions[i*3]=i/count;positions[i*3+1]=Math.sin(i*17.1);positions[i*3+2]=Math.cos(i*7.7)}g.setAttribute('position',new THREE.BufferAttribute(positions,3));return g},[count]);
 const material=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uRxPhase:{value:0},uTxPhase:{value:0},uRx:{value:0},uTx:{value:0}},vertexShader:`uniform float uRxPhase;uniform float uTxPhase;uniform float uRx;uniform float uTx;varying float vAlpha;varying float vTx;void main(){vTx=step(.5,position.x);float rate=mix(uRx,uTx,vTx);float t=fract(position.x*2.+mix(uRxPhase,uTxPhase,vTx));t=mix(1.-t,t,vTx);vec3 p=vec3(-4.9-t*3.8,.65+position.y*(.05+rate*.18),-1.+position.z*(.04+rate*.12)+vTx*.28);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=2.5*min(2.,32./max(1.,-mv.z));vAlpha=rate>0.00001?(1.-t)*min(1.,.2+rate*2.):0.;}`,fragmentShader:`varying float vAlpha;varying float vTx;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(mix(vec3(1.,.17,.28),vec3(1.,.65,.25),vTx)*1.4,a*vAlpha);}`}),[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useEffect(()=>()=>material.dispose(),[material]);
 const rx=useRef({phase:0,load:0,step:0}),tx=useRef({phase:0,load:0,step:0});
 useFrame((_,dt)=>{
  advanceFlow(rx.current,live?Math.log1p(net?.rx_mbs??0)/Math.log(126):0,dt,live&&!reduced);
  advanceFlow(tx.current,live?Math.log1p(net?.tx_mbs??0)/Math.log(126):0,dt,live&&!reduced);
  material.uniforms.uRxPhase.value=rx.current.phase;material.uniforms.uTxPhase.value=tx.current.phase;
  material.uniforms.uRx.value=rx.current.load;material.uniforms.uTx.value=tx.current.load;
 });
 return <points geometry={geometry} material={material} frustumCulled={false}/>;
}
