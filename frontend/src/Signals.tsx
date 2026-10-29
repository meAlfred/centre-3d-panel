import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {mainNetwork,pct} from './metrics';
import type {Snapshot} from './types';
import {advanceFlow} from './flow';
import {useStore} from './store';
import type {V3} from './Geometry';
import {Lightning} from './Lightning';
import {heatLevel,stormLevel} from './stormLevel';
const vertex=`varying vec2 vUv;uniform float uHalo; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*.075*uHalo,1.);}`;
const fragment=`varying vec2 vUv;uniform float uHalo;uniform float uPhase;uniform float uStep;uniform float uDirection;uniform float uLoad;uniform float uLive;uniform float uStorm;uniform vec3 uColor;
void main(){
 float d=(fract(vUv.x*4.-uPhase+.5)-.5)*uDirection;
 float footprint=max(fwidth(vUv.x*4.)*.7,uStep*.7);
 float width=max(d<0.?.13:.045,footprint);
 float beam=exp(-d*d/(width*width));
 vec3 base=vec3(.09,.015,.011);vec3 energy=uColor*beam*(8.+uLoad*9.)*uLive*(1.-.75*uStorm);
 gl_FragColor=uHalo>.5?vec4(uColor*1.7,beam*.2*uLive):vec4(base+energy,1.);
}`;
function Trace({paths,load,live,color='#da4f48',reverse=false,heat=0}:{paths:V3[][];load:number;live:boolean;color?:string;reverse?:boolean;heat?:number}){
 const curves=useMemo(()=>paths.map(points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal')),[paths]);
 const mesh=useMemo(()=>{const parts=curves.map(curve=>new THREE.TubeGeometry(curve,48,.018,5,false));const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g},[curves]);
 const storm=useRef(0);
 const material=useMemo(()=>new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,toneMapped:false,uniforms:{uHalo:{value:0},uPhase:{value:0},uStep:{value:0},uDirection:{value:reverse?-1:1},uLoad:{value:0},uLive:{value:0},uStorm:{value:0},uColor:{value:new THREE.Color(color)}}}),[]);
 const halo=useMemo(()=>{const h=material.clone();h.uniforms={...material.uniforms,uHalo:{value:1}};h.transparent=true;h.depthWrite=false;h.blending=THREE.AdditiveBlending;return h},[material]);
 useEffect(()=>()=>halo.dispose(),[halo]);
 useEffect(()=>()=>mesh.dispose(),[mesh]);
 useEffect(()=>()=>material.dispose(),[material]);
 const reduced=useStore(s=>s.reduced);
 const flow=useRef({phase:0,load:0,step:0}),tint=useMemo(()=>new THREE.Color(color),[]);
 useFrame((_,dt)=>{
  const f=advanceFlow(flow.current,load,dt,live&&!reduced,reverse),blend=reduced?1:1-Math.exp(-Math.min(dt,.05)*6);
  material.uniforms.uPhase.value=f.phase;material.uniforms.uStep.value=f.step;material.uniforms.uLoad.value=f.load;
  material.uniforms.uLive.value=THREE.MathUtils.lerp(material.uniforms.uLive.value,live?1:0,blend);
  storm.current=THREE.MathUtils.damp(storm.current,live?Math.max(stormLevel(f.load),heat):0,4,Math.min(dt,.05));material.uniforms.uStorm.value=storm.current;
  tint.set(f.load>.9?'#e0413e':f.load>.75?'#f0a020':color);material.uniforms.uColor.value.lerp(tint,blend);
 });
 return <><mesh geometry={mesh} material={material}/><mesh geometry={mesh} material={halo} raycast={()=>null}/><Lightning curves={curves} storm={storm}/></>;
}
export function Signals({s,live}:{s:Snapshot|null;live:boolean}){
 const paths=useMemo(()=>({
  ram:Array.from({length:5},(_,i)=>[[-.6,.025,-1.8+i*.25],[.7,.025,-1.8+i*.25],[1.25,.025,-2.2+i*.25],[2.2,.025,-2.2+i*.25]] as V3[]),
  chipset:Array.from({length:4},(_,i)=>[[-1.7+i*.24,.03,-.3],[-1.7+i*.24,.03,.9],[-.5+i*.24,.03,1.35]] as V3[]),
  disk:Array.from({length:3},(_,i)=>[[.9,.035,1.5+i*.16],[2.5,.035,1.5+i*.16],[3.4,.035,2.35+i*.16],[4.8,.12,2.35+i*.16],[5.2,.22,1.3+i*.1]] as V3[]),
  rx:[[[-4.1,.05,-1],[-3.7,.05,-.6],[-3.7,.05,.6],[-.2,.05,1.4]]] as V3[][],
  tx:[[[-4.15,.05,-1.15],[-3.5,.05,-.5],[-3.5,.05,.45],[-.2,.05,1.2]]] as V3[][],
  power:[[[-1,.03,-4.6],[-1,.03,-3.25],[-.5,.03,-2.4]],[[-1.2,.03,-4.6],[3.8,.03,-4],[4.3,.03,-1.5]]] as V3[][],
 }),[]);const n=s?mainNetwork(s):null;const disk=s?.disks.find(d=>d.id),heat=heatLevel(s?.cpu.temp_c);return <><Trace paths={paths.ram} load={(s?.cpu.usage_total??0)/100} live={live} heat={heat}/><Trace paths={paths.chipset} load={(s?.cpu.usage_total??0)/100} live={live} heat={heat}/><Trace paths={paths.disk} load={Math.min(1,((disk?.write_mbs??0)+(disk?.read_mbs??0))/100)} live={live}/><Trace paths={paths.rx} load={(n?.rx_mbs??0)/(n?.link_mbps?n.link_mbps/8:125)} live={live}/><Trace paths={paths.tx} load={(n?.tx_mbs??0)/(n?.link_mbps?n.link_mbps/8:125)} live={live} color="#b77e7c" reverse/><Trace paths={paths.power} load={(s?.cpu.usage_total??0)/100} live={live} heat={heat}/></>;
}
export function Cores({loads,live}:{loads:(number|null)[];live:boolean}){
 const count=loads.length;const reduced=useStore(s=>s.reduced);const ref=useRef<THREE.InstancedMesh>(null);
 const material=useMemo(()=>new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:`attribute float aLoad;varying float vLoad;varying vec2 vUv;void main(){vLoad=aLoad;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,fragmentShader:`varying float vLoad;varying vec2 vUv;uniform float uTime;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 cell=floor(vUv*vec2(38.,52.));float h=hash(cell);float blink=step(.76,sin(h*40.+uTime*2.2)*.5+.5);float grid=step(.13,fract(vUv.x*38.))*step(.12,fract(vUv.y*52.));vec3 c=mix(vec3(.7,.075,.16),vec3(.94,.5,.07),smoothstep(.65,.9,vLoad));c=mix(c,vec3(.8,.06,.03),step(.91,vLoad));gl_FragColor=vec4(c*(.3+grid*(.3+blink*vLoad*3.)),1.);}`} ),[]);
 const geometry=useMemo(()=>{const g=new THREE.BoxGeometry(.39,.045,.52);g.setAttribute('aLoad',new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1,count)),1));return g},[count]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useEffect(()=>()=>material.dispose(),[material]);
 const obj=useMemo(()=>new THREE.Object3D(),[]);
 useFrame((_,dt)=>{if(live&&!reduced)material.uniforms.uTime.value+=Math.min(dt,.05);if(!ref.current)return;const cols=count<=6?3:Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),sx=Math.min(1,3/cols),sz=Math.min(1,2/rows);loads.forEach((load,i)=>{obj.position.set((i%cols-(cols-1)/2)*.44*sx,0,(Math.floor(i/cols)-(rows-1)/2)*.58*sz);obj.scale.set(sx,1,sz);obj.updateMatrix();ref.current!.setMatrixAt(i,obj.matrix);geometry.getAttribute('aLoad').setX(i,THREE.MathUtils.lerp(geometry.getAttribute('aLoad').getX(i),live?(load??0)/100:0,reduced?1:1-Math.exp(-Math.min(dt,.05)*6)))});ref.current.instanceMatrix.needsUpdate=true;geometry.getAttribute('aLoad').needsUpdate=true});
 return count?<instancedMesh ref={ref} args={[geometry,material,count]}/>:null;
}
