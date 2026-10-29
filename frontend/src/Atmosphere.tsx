import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {componentPose} from './framing';
import {dockerLayout} from './layout';
import {sceneFocus,useStore} from './store';
import type {Snapshot} from './types';

const noRaycast=()=>null;

/** Procedural PCB: copper traces under the solder mask, vias, a silkscreen frame and a
 *  faint signal shimmer whose pace follows the real CPU load. One draw call. */
export function BoardSurface({load,live}:{load:number;live:boolean}){
 const reduced=useStore(v=>v.reduced),focus=useStore(sceneFocus);
 const material=useMemo(()=>new THREE.ShaderMaterial({
  polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-6,
  uniforms:{uTime:{value:0},uLoad:{value:0},uLive:{value:0},uDim:{value:1}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform float uTime;uniform float uLoad;uniform float uLive;uniform float uDim;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   void main(){
    vec2 p=vUv*vec2(9.8,8.);
    vec3 mask=vec3(.034,.009,.008)*(.85+.3*hash(floor(p*.8)));
    vec2 g=p/.46,id=floor(g),f=fract(g);
    float horizontal=step(.5,hash(id));
    float across=mix(f.x,f.y,horizontal),along=mix(f.y,f.x,horizontal);
    float aa=clamp(1.-max(fwidth(g.x),fwidth(g.y))*2.2,0.,1.);
    float lanes=3.+floor(hash(id+11.)*3.);
    float trace=(1.-smoothstep(.13,.2,abs(fract(across*lanes)-.5)))*step(.38,hash(id+7.))*aa;
    vec3 col=mix(mask,vec3(.095,.026,.02),trace);
    // Plated vias.
    vec2 c=f-.5-(vec2(hash(id+3.),hash(id+5.))-.5)*.6;
    float via=step(.62,hash(id+13.))*aa,d=length(c);
    col=mix(col,vec3(.36,.2,.09),via*(1.-smoothstep(.07,.09,d)));
    col=mix(col,vec3(.01),via*(1.-smoothstep(.025,.04,d)));
    // Signal shimmer along the traces.
    float s=fract(along*.5+hash(id)*9.-uTime*(.12+uLoad*.9)*(hash(id+2.)>.5?1.:-1.));
    col+=vec3(1.,.16,.09)*trace*smoothstep(.82,1.,s)*uLive*(.1+uLoad*.55);
    // Silkscreen frame near the board edge.
    vec2 e=min(p,vec2(9.8,8.)-p);
    float frame=1.-smoothstep(.0,.012,abs(min(e.x,e.y)-.16)-.006);
    col=mix(col,vec3(.3,.2,.17),frame*.5*aa);
    gl_FragColor=vec4(col*uDim,1.);
    #include <colorspace_fragment>
   }`,
 }),[]);
 useEffect(()=>()=>material.dispose(),[material]);
 useFrame((_,dt)=>{
  const step=Math.min(dt,.05),u=material.uniforms;
  if(live&&!reduced)u.uTime.value+=step;
  u.uLoad.value=THREE.MathUtils.damp(u.uLoad.value,load,3,step);
  u.uLive.value=live?1:0;
  u.uDim.value=THREE.MathUtils.damp(u.uDim.value,focus?.5:1,8,reduced?1:step);
 });
 return <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.044,0]} material={material} raycast={noRaycast}><planeGeometry args={[9.8,8]}/></mesh>;
}

/** Radar-like stage under the machine so it no longer floats in nothing. */
export function HoloFloor({live}:{live:boolean}){
 const reduced=useStore(v=>v.reduced);
 const material=useMemo(()=>new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide,
  uniforms:{uTime:{value:0},uLive:{value:0}},
  vertexShader:`varying vec2 vPos;void main(){vPos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vPos;uniform float uTime;uniform float uLive;
   void main(){
    float r=length(vPos),a=atan(vPos.y,vPos.x),w=fwidth(r)*1.4;
    float ring=1.-smoothstep(0.,w,abs(fract(r/2.+.5)-.5)*2.);
    float fine=(1.-smoothstep(0.,w,abs(fract(r*2.+.5)-.5)*.5))*.18;
    float sector=3.14159265/12.;
    float spoke=1.-smoothstep(0.,w,abs(fract(a/sector+.5)-.5)*sector*r);
    float tick=(1.-smoothstep(0.,w,abs(fract(a/(sector/5.)+.5)-.5)*(sector/5.)*r))*step(abs(r-13.),.25);
    float travel=fract(uTime*.11)*24.;
    float pulse=exp(-pow((r-travel)*1.1,2.))*(1.-travel/24.);
    float sweep=smoothstep(.9,1.,fract(a/6.2831853-uTime*.035));
    float fade=smoothstep(26.,9.,r)*smoothstep(1.5,7.,r);
    float alpha=(ring*.2+fine*.25+spoke*.07+tick*.5+pulse*.3+sweep*(ring+spoke+.05)*.3)*fade*(.35+.65*uLive);
    gl_FragColor=vec4(vec3(1.,.2,.13)*alpha,alpha);
   }`,
 }),[]);
 useEffect(()=>()=>material.dispose(),[material]);
 useFrame((_,dt)=>{if(!reduced)material.uniforms.uTime.value+=Math.min(dt,.05);material.uniforms.uLive.value=live?1:0});
 return <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.8,0]} material={material} raycast={noRaycast} renderOrder={-10}><planeGeometry args={[56,56]}/></mesh>;
}

function silkTexture(text:string){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
 const ctx=canvas.getContext('2d')!;
 ctx.font='600 58px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';ctx.textBaseline='middle';ctx.fillStyle='#fff';
 const width=Math.min(500,ctx.measureText(text).width);
 ctx.fillText(text,6,50,500);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 return {texture,aspect:(width+12)/96,share:(width+12)/512};
}
function Silk({text,position,height=.2,turn=0}:{text:string;position:[number,number];height?:number;turn?:number}){
 const {texture,aspect,share}=useMemo(()=>{const t=silkTexture(text);t.texture.repeat.set(t.share,1);return t},[text]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 // Left edge of the text sits on "position".
 return <group position={[position[0],-.03,position[1]]} rotation={[0,turn,0]}><mesh rotation={[-Math.PI/2,0,0]} position={[height*aspect/2,0,0]} raycast={noRaycast}><planeGeometry args={[height*aspect,height]}/><meshBasicMaterial map={texture} color="#e9c2ad" transparent opacity={.42} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-12}/></mesh></group>;
}
/** Board markings. Decorative, like the rest of the schematic model. */
export function Silkscreen({host,memory}:{host:string;memory:string}){
 return <>
  <Silk text={`${host.toUpperCase()} // REV 1.0`} position={[.4,3.53]} height={.19}/>
  <Silk text="CPU1" position={[-2.3,.5]}/>
  <Silk text={memory.toUpperCase()} position={[2.35,.9]}/>
  <Silk text="PCH" position={[1.2,1.2]} height={.17}/>
  <Silk text="SATA1-3" position={[3.35,3.05]} height={.17}/>
  <Silk text="ATX PWR" position={[4.75,-1.6]} height={.17} turn={Math.PI/2}/>
 </>;
}

/** Pulsing ring on the floor of whichever component is in focus (drives have their own). */
export function FocusBeacon({s}:{s:Snapshot|null}){
 const focus=useStore(sceneFocus),reduced=useStore(v=>v.reduced),ring=useRef<THREE.Mesh>(null);
 useFrame(({clock})=>{
  if(!ring.current)return;
  const wave=reduced?.5:.5+.5*Math.sin(clock.elapsedTime*2.6);
  (ring.current.material as THREE.MeshBasicMaterial).opacity=.25+wave*.4;
  ring.current.scale.setScalar(1+(reduced?0:wave*.025));
 });
 if(!focus||focus.startsWith('disk:')||focus.startsWith('bay:'))return null;
 const pose=componentPose(focus,s),dock=dockerLayout(s?.docker.length??0);
 const radius=focus==='cpu'?2.1:focus==='memory'?2:focus==='network'?1.15:focus==='power'?2.5:Math.hypot(dock.width,dock.depth)/2+.3;
 return <mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[pose.target[0],focus==='power'||focus==='docker'||focus.startsWith('container:')?-.3:-.02,pose.target[2]]} raycast={noRaycast}><ringGeometry args={[radius,radius+.035,96]}/><meshBasicMaterial color="#ff5a48" transparent opacity={.5} side={THREE.DoubleSide} depthWrite={false} toneMapped={false}/></mesh>;
}
