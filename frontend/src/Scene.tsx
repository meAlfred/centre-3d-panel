import {memo,Suspense,useLayoutEffect,useMemo,useRef,useState,useReducer} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Environment,Html,Lightformer} from '@react-three/drei';
import {Bloom,EffectComposer} from '@react-three/postprocessing';
import * as THREE from 'three';
import {Parts,P,motherboardParts} from './Geometry';
import type {Part,V3} from './Geometry';
import {Drive} from './Drives';
import {DockerRack} from './DockerRack';
import {diskPosition,dockerLayout,ramSticks,ramX} from './layout';
import {fanDrive} from './cooling';
import {BoardSurface,FocusBeacon,HoloFloor,Silkscreen} from './Atmosphere';
import {Spark} from './Gauges';
import type {N} from './types';
import {Cosmos} from './Cosmos';
import {advanceLift} from './flow';
import {OverviewOrbit} from './orbit';
import {watchContext} from './contextRecovery';
import {smoothInput,focusEase,pointerPosition} from './motion';
import {cameraFrame,RAM_LIFT} from './framing';
import {gyroVector} from './gyro';
import {activateLabel,isCanvasBackground} from './interaction';
import {CoolingFan,Airflow} from './Cooling';
import {Cores,Signals} from './Signals';
import {ActivityLights,NetworkPackets} from './Activity';
import {diskKey,duration,failed,mainNetwork,num,pct,sourceFresh} from './metrics';
import {isMobile,sceneFocus,useStore} from './store';
import {cinematicShots,cutFade,shakeNoise,shotPose} from './cinematic';
import type {Shot} from './cinematic';
import type {Disk,Focus,Snapshot} from './types';

const CPU:V3=[-1,0,-1.1];
function NetworkPort({s,live}:{s:Snapshot|null;live:boolean}){
 const net=s?mainNetwork(s):null,focus=useStore(sceneFocus),reduced=useStore(v=>v.reduced),ring=useRef<THREE.Mesh>(null);
 const parts=useMemo(()=>{const p:Part[]=[P([0,.38,0],[.78,.76,.88],'#938281',{metal:true,target:'network'}),P([-.405,.36,0],[.035,.46,.59],'#180e0d',{target:'network'}),P([0,.78,0],[.7,.035,.8],'#bf3f39',{metal:true,target:'network'}),P([.65,.11,0],[.43,.2,.43],'#251616',{target:'network'})];for(let i=0;i<8;i++)p.push(P([-.43,.22,-.245+i*.07],[.06,.12,.035],'#d9af76',{metal:true,target:'network'}));for(const z of [-.31,.31])p.push(P([-.44,.63,z],[.05,.085,.08],'#ed6c55',{target:'network'}));return p},[]);
 useFrame(({clock})=>{if(ring.current){const m=ring.current.material as THREE.MeshBasicMaterial;m.opacity=focus==='network'?.65:live&&net?.link_up?.2+(reduced?0:.08*Math.sin(clock.elapsedTime*4)):0}});
 return <group position={[-4.65,0,-1.16]} onClick={e=>{e.stopPropagation();useStore.getState().setFocus('network')}}><Parts parts={parts}/><mesh rotation={[-Math.PI/2,0,0]} position={[.1,.018,0]} ref={ring}><ringGeometry args={[.78,.81,48]}/><meshBasicMaterial color="#ff524a" transparent opacity={.3} side={THREE.DoubleSide}/></mesh></group>;
}
function CPUModel({s,live}:{s:Snapshot|null;live:boolean}){
 const open=useStore(v=>sceneFocus(v)==='cpu'),reduced=useStore(v=>v.reduced);
 const cooler=useRef<THREE.Group>(null),lid=useRef<THREE.Mesh>(null),lift=useRef({value:0,velocity:0}),heat=useRef<THREE.PointLight>(null);
 useFrame((_,dt)=>{
  const value=advanceLift(lift.current,open,dt,reduced).value;
  if(cooler.current)cooler.current.position.y=.15+value*1.95;
  if(heat.current){const load=(s?.cpu.usage_total??0)/100,hot=Math.min(1,Math.max(0,((s?.cpu.temp_c??40)-40)/45));heat.current.intensity=THREE.MathUtils.damp(heat.current.intensity,live?3+load*22+hot*10:0,3,Math.min(dt,.05));heat.current.color.setRGB(1,.2+hot*.28,.12)}
  if(lid.current){lid.current.position.y=.25+value*.24;(lid.current.material as THREE.MeshPhysicalMaterial).opacity=1-value*.94}
 });

 const parts=useMemo(()=>{const out:Part[]=[];for(let i=0;i<14;i++)out.push(P([-.94+i*.145,.5,0],[.05,.7,1.85],'#766564',{metal:true,target:'cpu'}));for(const x of [-1,1])for(const z of [-1,1])out.push(P([x,.3,z],[.15,.65,.15],'#453d3c',{kind:'cylinder',metal:true,target:'cpu'}));out.push(P([0,.08,0],[2,.16,2],'#5c5453',{metal:true,target:'cpu'}));return out},[]);

 return <group position={CPU}><pointLight ref={heat} position={[0,.9,1.5]} distance={7} decay={2} intensity={0} color="#ff3b24"/><mesh position={[0,.07,0]} onClick={e=>{e.stopPropagation();useStore.getState().setFocus('cpu')}}><boxGeometry args={[1.8,.12,1.65]}/><meshPhysicalMaterial color="#332424" metalness={.25} roughness={.5}/></mesh><group position={[0,.16,0]}><Cores loads={s?.cpu.per_core??[]} live={live}/></group><mesh ref={lid} position={[0,.25,0]}><boxGeometry args={[1.65,.13,1.52]}/><meshPhysicalMaterial color="#afa3a3" metalness={.94} roughness={.25} transparent depthWrite={false}/></mesh><group ref={cooler} position={[0,.15,0]} onClick={e=>{e.stopPropagation();useStore.getState().setFocus('cpu')}}><Parts parts={parts}/><group position={[0,.92,0]}><CoolingFan rpm={s?.fans[0]?.rpm??null} temp={s?.cpu.temp_c??null} live={live}/></group></group></group>;
}
function RAM({s,live}:{s:Snapshot|null;live:boolean}){
 const group=useRef<THREE.Group>(null),focus=useStore(sceneFocus),reduced=useStore(v=>v.reduced);
 const sticks=s?ramSticks(s.memory.slots,s.memory.slots_status==='ok',s.memory.total_mb):[];
 const signature=sticks.map(stick=>`${stick.socket}${stick.ghost?'g':''}`).join(',');
 const parts=useMemo(()=>sticks.flatMap(stick=>{
  const x=ramX(stick.socket);const p:Part[]=[P([x,.62,-1.1],[.085,.96,2.65],'#1d1413',{target:'memory'}),P([x,.17,-1.1],[.09,.17,2.45],'#ba9050',{metal:true,target:'memory'})];
  for(const side of [-1,1]){
   for(let i=0;i<8;i++)p.push(P([x+side*.073,.6,-2.17+i*.3],[.055,.4,.22],'#171515',{target:'memory'}));
   p.push(P([x+side*.105,.83,-1.1],[.055,.38,2.57],'#3a0b09',{metal:true,target:'memory'}));
   for(let i=0;i<8;i++)p.push(P([x+side*.138,.85,-2.15+i*.3],[.012,.22,.06],'#761712',{metal:true,target:'memory'}));
  }
  p.push(P([x,1.04,-1.1],[.25,.045,2.62],'#8d1b15',{metal:true,target:'memory'}));
  return p;
 }),[signature]);
 useFrame((_,dt)=>{if(group.current)group.current.position.y=THREE.MathUtils.damp(group.current.position.y,focus==='memory'?RAM_LIFT:0,12,reduced?10:dt)});
 return <group ref={group}><Parts parts={parts}/>{sticks.map(stick=><mesh key={stick.socket} position={[ramX(stick.socket),1.069,-1.1]} onClick={e=>{e.stopPropagation();useStore.getState().setFocus('memory')}}><boxGeometry args={[.12,.014,2.5]}/><meshStandardMaterial color="#a21f18" emissive="#ff3027" emissiveIntensity={live?(stick.ghost?.25:1)*(.4+.7*(pct(s?.memory.used_mb,s?.memory.total_mb)??0)/100):0} toneMapped={false}/></mesh>)}</group>;
}
function Hud({position,title,value,sub,target,level,spark,sparkMax}:{position:V3;title:string;value:string;sub:string;target:Focus;priority?:number;level?:N;spark?:N[];sparkMax?:number}){
 return <Html center position={position} zIndexRange={[30,20]} style={{pointerEvents:'none'}}><button className="hud" style={{pointerEvents:'auto'}} onPointerDown={e=>e.stopPropagation()} onClick={e=>activateLabel(e,target,useStore.getState().setFocus)} aria-label={`${title}: ${value}, ${sub}`}><span>{title}<i/></span><strong>{value}</strong><small>{sub}</small>{spark&&<Spark values={spark} max={sparkMax}/>}{level!=null&&<b className={`hud-level ${level>90?'critical':level>75?'warning':''}`} style={{'--level':`${Math.max(0,Math.min(100,level))}%`} as React.CSSProperties}/>}<em/></button></Html>;
}
function HUDs({s}:{s:Snapshot|null}){
 const {size}=useThree();const history=useStore(v=>v.history);const cinematic=useStore(v=>v.cinematic);const mode=useStore(v=>v.mode),net=s?mainNetwork(s):null,dock=dockerLayout(s?.docker.length??0),fan=fanDrive(s?.fans[0]?.rpm,s?.cpu.temp_c);
 if(cinematic||mode!=='overview'||size.width<800)return null;
 return <><Hud position={[-.6,2.6,-2.1]} target="cpu" title="CPU" value={`${num(s?.cpu.usage_total)} %`} sub={`${num(s?.cpu.temp_c,0)} °C · ${num(s?.cpu.freq_mhz!=null?s.cpu.freq_mhz/1000:null,2)} GHz`} priority={5} level={s?.cpu.usage_total} spark={history.map(p=>p.cpu)} sparkMax={100}/><Hud position={[4.6,1.7,-3.2]} target="memory" title="RAM" value={`${num(s?.memory.used_mb!=null?s.memory.used_mb/1024:null)} / ${num(s?.memory.total_mb!=null?s.memory.total_mb/1024:null)} GiB`} sub={`PSI ${num(s?.memory.pressure_some_60s)} %`} priority={4} level={pct(s?.memory.used_mb,s?.memory.total_mb)}/><Hud position={[-6.2,1.1,.2]} target="network" title={net?.iface??'NETWORK'} value={`↓ ${num(net?.rx_mbs)} · ↑ ${num(net?.tx_mbs)}`} sub={`MB/s · ${net&&/^wl/.test(net.iface)?'Wi-Fi':'Ethernet'}`} priority={2} spark={history.map(p=>p.rx==null&&p.tx==null?null:(p.rx??0)+(p.tx??0))}/><Hud position={[dock.centre[0],1.2,dock.centre[2]+dock.depth/2+.5]} target="docker" title="DOCKER" value={`${s?.docker.filter(c=>c.state==='running').length??'—'} / ${s?.docker.length??'—'}`} sub={s?.docker.some(failed)?'containers need attention':'containers running'} priority={3}/><Hud position={[-3.4,3.1,-6.9]} target="power" title="COOLING" value={fan.estimated?`≈ ${fan.percent??'—'} %`:`${num(s?.fans[0]?.rpm,0)} RPM`} sub={fan.estimated?`estimated · from ${num(s?.cpu.temp_c,0)} °C CPU`:`Uptime ${duration(s?.host.uptime_s)}`} level={fan.percent}/>{s?.disks.map((d,i)=>({d,at:diskPosition(i)})).filter(({d})=>d.id).map(({d,at})=><Hud key={d.id} position={[at[0]+2.1,.8,at[2]+.6]} target={diskKey(d)} title={d.kind.toUpperCase()} value={`${num(pct(d.used_gb,d.size_gb))} %`} sub={`↓ ${num(d.read_mbs)} · ↑ ${num(d.write_mbs)} MB/s`} priority={3} level={pct(d.used_gb,d.size_gb)}/>)}</>;
}
function Rig({s}:{s:Snapshot|null}){
 const {camera,gl,size,invalidate}=useThree(),focus=useStore(v=>v.focus),reduced=useStore(v=>v.reduced),cinematic=useStore(v=>v.cinematic);
 const cine=useRef({active:false,index:0,t:0,time:0,shot:null as Shot|null,roll:0,fade:null as HTMLElement|null,title:null as HTMLElement|null});
 const [desktop,setDesktop]=useState(()=>window.matchMedia('(min-width:801px)').matches);
 useLayoutEffect(()=>{const mq=window.matchMedia('(min-width:801px)'),change=()=>setDesktop(mq.matches);mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change)},[]);
 const look=useRef(new THREE.Vector3()),previous=useRef<string|null>(null),elapsed=useRef(1);
 const from=useRef(new THREE.Vector3()),fromLook=useRef(new THREE.Vector3()),fromFov=useRef(43);
 const sway=useRef(0);const input=useRef({x:0,y:0}),filtered=useRef({x:0,y:0}),orbit=useRef(new OverviewOrbit()),suppressClick=useRef(false);
 const frame=useMemo(()=>cameraFrame(focus,s,size.width,size.height,desktop),[focus,s,size.width,size.height,desktop]);
 const v=useMemo(()=>({dest:new THREE.Vector3(),aim:new THREE.Vector3(),direction:new THREE.Vector3(),up:new THREE.Vector3(0,1,0),sphere:new THREE.Spherical(),right:new THREE.Vector3()}),[]);
 useLayoutEffect(()=>{
  orbit.current.reset();suppressClick.current=false;
 },[focus]);
 useLayoutEffect(()=>{
  const element=gl.domElement,host=element.closest('.scene-space')??element;
  const focused=()=>useStore.getState().focus!==null;
  let returnTimer:ReturnType<typeof setTimeout>|undefined;
  const scheduleReturn=()=>{clearTimeout(returnTimer);returnTimer=setTimeout(()=>{if(!focused())invalidate()},4010)};
  const down=(e:PointerEvent)=>{
   if(e.button!==0||!orbit.current.start(e.pointerId,e.clientX,e.clientY,performance.now(),focused()))return;
   suppressClick.current=false;clearTimeout(returnTimer);element.setPointerCapture(e.pointerId);
  };
  const drag=(e:PointerEvent)=>{
   if(orbit.current.pointer!==e.pointerId)return;
   const rect=element.getBoundingClientRect();
   if(orbit.current.move(e.pointerId,e.clientX,e.clientY,rect.width,rect.height,performance.now(),focused())){e.preventDefault();invalidate()}
  };
  const up=(e:PointerEvent)=>{
   if(orbit.current.pointer!==e.pointerId)return;
   suppressClick.current=orbit.current.end(e.pointerId,performance.now());
   if(element.hasPointerCapture(e.pointerId))element.releasePointerCapture(e.pointerId);
   if(!focused())scheduleReturn();invalidate();
  };
  const click=(e:MouseEvent)=>{if(suppressClick.current&&e.detail!==0){suppressClick.current=false;e.preventDefault();e.stopImmediatePropagation()}};
  const move=(event:Event)=>{const e=event as PointerEvent;if(e.pointerType==='mouse'&&orbit.current.pointer===null)input.current=pointerPosition(e.clientX,e.clientY,element.getBoundingClientRect())};
  const reset=()=>{input.current={x:0,y:0};const id=orbit.current.pointer;if(id!==null){orbit.current.end(id,performance.now());if(element.hasPointerCapture(id))element.releasePointerCapture(id);scheduleReturn()}};
  element.addEventListener('pointerdown',down);element.addEventListener('pointermove',drag);element.addEventListener('pointerup',up);element.addEventListener('pointercancel',up);element.addEventListener('lostpointercapture',up);element.addEventListener('click',click,true);
  host.addEventListener('pointermove',move);host.addEventListener('pointerleave',reset);window.addEventListener('blur',reset);
  return ()=>{clearTimeout(returnTimer);reset();clearTimeout(returnTimer);element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',drag);element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',up);element.removeEventListener('lostpointercapture',up);element.removeEventListener('click',click,true);host.removeEventListener('pointermove',move);host.removeEventListener('pointerleave',reset);window.removeEventListener('blur',reset)};
 },[gl,invalidate]);
 useFrame((_,dt)=>{
  const cam=camera as THREE.PerspectiveCamera,c=cine.current,step=Math.min(dt,.05);
  if(cinematic&&!reduced){
   // AFK film: a loop of shots with cuts through black, hand-held shake near components.
   const shots=cinematicShots(s);
   if(!c.active){c.active=true;c.t=0;c.shot=null;c.fade=document.getElementById('cine-fade');c.title=document.getElementById('cine-title')}
   // Real time, not the clamped animation step: a slow device still sees every shot on schedule.
   const real=Math.min(dt,.25);c.t+=real;c.time+=real;
   if(!c.shot||c.t>=c.shot.duration){
    if(c.shot){c.index=(c.index+1)%shots.length;c.t=0}
    c.shot=shots[c.index%shots.length];
    useStore.setState({cineOpen:c.shot.open??null});
    if(c.title){c.title.textContent=c.shot.title;c.title.style.animation='none';void c.title.offsetWidth;c.title.style.animation=''}
   }
   const shot=c.shot,pose=shotPose(shot,c.t),noise=shakeNoise(c.time);
   const amp=shot.shake*pose.closeness; // shake only while passing close to the processor
   look.current.set(...pose.look);cam.position.set(...pose.position);
   v.direction.subVectors(look.current,cam.position).normalize();
   v.right.crossVectors(v.direction,v.up).normalize();
   cam.position.addScaledVector(v.right,noise[0]*amp).addScaledVector(v.up,noise[1]*amp);
   cam.lookAt(look.current);c.roll=pose.roll;cam.rotateZ(c.roll+noise[2]*amp*.5);
   if(c.fade)c.fade.style.opacity=String(cutFade(c.t,shot.duration));
   if(Math.abs(cam.fov-pose.fov)>.005||cam.near!==.06){cam.fov=pose.fov;cam.near=.06;cam.updateProjectionMatrix()}
   previous.current='cinematic';
   return;
  }
  if(c.active){
   // Next time the film continues with the following shot.
   c.active=false;c.index=(c.index+1)%cinematicShots(s).length;c.shot=null;
   useStore.setState({cineOpen:null});if(c.fade)c.fade.style.opacity='0';
  }
  const key=focus??'overview';
  v.dest.copy(frame.position);v.aim.copy(frame.lookAt);
  if(previous.current!==key){
   const initial=previous.current===null;previous.current=key;from.current.copy(cam.position);fromLook.current.copy(look.current);fromFov.current=cam.fov;elapsed.current=initial?1:0;
   if(initial){cam.position.copy(v.dest);look.current.copy(v.aim)}
  }
  // Resize updates the destination, never restarts a focus animation.
  elapsed.current=Math.min(1,elapsed.current+Math.min(dt,.05)/(focus?.62:.72));
  const progress=reduced?1:elapsed.current,t=focusEase(progress);
  orbit.current.tick(performance.now(),dt,!!focus,reduced);
  const manual=orbit.current.pointer!==null||Math.abs(orbit.current.yaw)+Math.abs(orbit.current.pitch)>.001;
  if(focus||manual||reduced||progress<1)sway.current=0;else sway.current+=Math.min(dt,.05)*.13;
  const idle=Math.sin(sway.current)*.05;
  const raw=manual?{x:0,y:0}:isMobile?gyroVector:input.current;
  filtered.current.x=smoothInput(filtered.current.x,!focus&&!reduced?raw.x:0,dt);
  filtered.current.y=smoothInput(filtered.current.y,!focus&&!reduced?raw.y:0,dt);
  if(progress<1){cam.position.lerpVectors(from.current,v.dest,t);look.current.lerpVectors(fromLook.current,v.aim,t)}
  else {
   if(!focus){
    v.direction.subVectors(v.dest,v.aim);v.sphere.setFromVector3(v.direction);
    v.sphere.theta+=orbit.current.yaw;v.sphere.phi=THREE.MathUtils.clamp(v.sphere.phi+orbit.current.pitch,.3,1.38);
    v.direction.setFromSpherical(v.sphere);
    const shift=frame.lookAt.distanceTo(frame.target);
    v.right.crossVectors(v.direction,v.up).normalize().negate();
    v.aim.copy(frame.target).addScaledVector(v.right,shift);v.dest.copy(v.aim).add(v.direction);
   }
   if(!focus&&!reduced){
    v.direction.subVectors(v.dest,v.aim).applyAxisAngle(v.up,filtered.current.x*(isMobile?.045:.012)+idle);
    v.dest.copy(v.aim).add(v.direction);v.dest.y+=filtered.current.y*(isMobile?.45:.16);
   }
   const blend=reduced?1:1-Math.exp(-Math.min(dt,.05)*12);
   cam.position.lerp(v.dest,blend);look.current.lerp(v.aim,blend);
  }
  cam.lookAt(look.current);
  c.roll=reduced?0:THREE.MathUtils.damp(c.roll,0,5,step);if(Math.abs(c.roll)>1e-4)cam.rotateZ(c.roll);
  const fov=THREE.MathUtils.lerp(fromFov.current,frame.fov,t),near=progress<1?.06:.5;
  if(Math.abs(cam.fov-fov)>.005||cam.near!==near){cam.fov=fov;cam.near=near;cam.updateProjectionMatrix()}
 },-1);
 return null;
}
function ContextRecovery({onStatus,onRestore}:{onStatus:(lost:boolean)=>void;onRestore:()=>void}){
 const {gl,invalidate}=useThree();
 useLayoutEffect(()=>watchContext(gl.domElement,{
  lost:()=>{onStatus(true);useStore.getState().setQuality('low')},
  restored:()=>{onRestore();onStatus(false);invalidate()},
  failed:()=>useStore.getState().setFlat(true,'Could not restore WebGL. You can switch 3D back on below'),
 }),[gl,invalidate,onStatus,onRestore]);
 return null;
}
function Performance(){
 const {gl}=useThree(),reduced=useStore(v=>v.reduced),quality=useStore(v=>v.quality),pinned=useStore(v=>v.qualityPinned);const sample=useRef({time:0,count:0,low:0,warmup:3});
 useFrame((_,dt)=>{if(reduced||document.hidden||gl.getContext().isContextLost()||dt>.25){sample.current={time:0,count:0,low:0,warmup:3};return}if(sample.current.warmup>0){sample.current.warmup-=dt;return}sample.current.time+=dt;sample.current.count++;if(sample.current.time>=2){const fps=sample.current.count/sample.current.time;window.dispatchEvent(new CustomEvent('centre-fps',{detail:{fps:Math.round(fps),calls:gl.info.render.calls,triangles:gl.info.render.triangles}}));if(fps<38&&quality==='high'&&!pinned)useStore.getState().setQuality('low');else if(fps<25){sample.current.low++;if(sample.current.low>=2){if(quality==='high'){useStore.getState().setQuality('low');sample.current.low=0}else if(!useStore.getState().cinematic)useStore.getState().setFlat(true,'3D is running slowly on this device')}}else sample.current.low=0;sample.current.time=0;sample.current.count=0}});return null;
}
function World({s,live}:{s:Snapshot|null;live:boolean}){
 const parts=useMemo(motherboardParts,[]);const disks=s?.disks??[];const quality=useStore(v=>v.quality);const fan=fanDrive(s?.fans[0]?.rpm,s?.cpu.temp_c);const cinematic=useStore(v=>v.cinematic);
 return <><Cosmos/><HoloFloor live={live}/><ambientLight intensity={.4}/><directionalLight position={[7,6,-10]} intensity={1.5} color="#ffd2b8"/><rectAreaLight position={[0,11,3]} rotation={[-Math.PI/2,0,0]} width={12} height={10} intensity={3.8} color="#fff0dd"/><directionalLight position={[-8,5,-4]} intensity={1.3} color="#ff241c"/><Environment resolution={64}><Lightformer position={[0,8,0]} rotation={[Math.PI/2,0,0]} scale={[15,10,1]} intensity={1.6}/><Lightformer position={[-10,2,0]} rotation={[0,Math.PI/2,0]} scale={[10,4,1]} intensity={.5} color="#e83321"/></Environment><group><Parts parts={parts}/><BoardSurface load={(s?.cpu.usage_total??0)/100} live={live}/><Silkscreen host={s?.host.name??'centre'} memory={s?.memory.slots.find(slot=>slot.populated&&slot.type)?.type??'DIMM'}/><FocusBeacon s={s}/><CPUModel s={s} live={live}/><RAM s={s} live={live}/><NetworkPort s={s} live={live}/>{disks.map((d,i)=><Drive key={d.id??`bay-${d.bay}`} disk={d} position={diskPosition(i)} live={live}/>)}<DockerRack s={s} live={live&&sourceFresh(s,'docker')}/><Signals s={s} live={live}/><ActivityLights s={s} live={live}/><NetworkPackets s={s} live={live}/><Airflow live={live} strength={(fan.percent??30)/100}/><HUDs s={s}/></group><Rig s={s}/><Performance/>{quality==='high'&&<EffectComposer multisampling={0}><Bloom intensity={cinematic?1.35:.9} luminanceThreshold={1.15} luminanceSmoothing={.25} mipmapBlur resolutionScale={.5}/></EffectComposer>}</>;
}
const Scene=memo(function Scene({s,live}:{s:Snapshot|null;live:boolean}){
 const visible=useStore(v=>v.visible),reduced=useStore(v=>v.reduced),quality=useStore(v=>v.quality);const [recovering,setRecovering]=useState(false);const [worldVersion,resetWorld]=useReducer((n:number)=>n+1,0);
 return <><Canvas className="scene-canvas" frameloop={!visible?'never':reduced?'demand':'always'} dpr={quality==='high'?[1,1.5]:1} camera={{position:[13,16,18],fov:42,near:.5,far:220}} gl={{antialias:false,alpha:true,powerPreference:'default'}} onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=.95;gl.setClearColor('#000000',0)}} onPointerMissed={e=>{if(isCanvasBackground(e.target))useStore.getState().setFocus(null)}}><ContextRecovery onStatus={setRecovering} onRestore={resetWorld}/><Suspense fallback={null}><World key={worldVersion} s={s} live={live}/></Suspense></Canvas>{recovering&&<div className="context-recovery" role="status">Restoring 3D… Telemetry is still live.</div>}</>;
});
export default Scene;
