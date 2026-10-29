import {Component,lazy,Suspense,useEffect,useRef,useState} from 'react';
import type {ErrorInfo,ReactNode} from 'react';
import {Box,Clapperboard,Cpu,Database,HardDrive,Layers3,MemoryStick,Network,Power,Settings2,Smartphone,WifiOff,X} from 'lucide-react';
import {useConnection} from './connection';
import {diskKey,duration,focusTitle,mainNetwork,num,overall,pct,tone,validFocus} from './metrics';
import {isMobile,mockMode,useStore} from './store';
import {DetailPanel,OverviewPanel} from './Panels';
import type {Focus} from './types';
import {startGyroscope,stopGyroscope,gyroMessages} from './gyro';
import {FlatView} from './StatsView';
import './style.css';
import './action.css';
import './polish.css';
import './cinema.css';
import {CinemaOverlay} from './Cinema';
import {IDLE_MS} from './cinematic';
const Scene=lazy(()=>import('./Scene'));
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true}}componentDidCatch(error:Error,_info:ErrorInfo){console.warn('3D scene unavailable:',error.name);useStore.getState().setFlat(true,'3D is not available in this browser')}render(){return this.state.error?null:this.props.children}}
function Settings({close}:{close:()=>void}){const quality=useStore(v=>v.quality),reduced=useStore(v=>v.reduced);const gyro=useStore(v=>v.gyroStatus),setGyro=useStore(v=>v.setGyroStatus);async function enable(){if(gyro==='on'){stopGyroscope();setGyro('off')}else await startGyroscope(setGyro)}return <div className="settings" role="dialog" aria-label="Display settings"><header><strong>Display</strong><button onClick={close} aria-label="Close settings"><X size={16}/></button></header><label>3D quality<select value={quality} onChange={e=>useStore.getState().setQuality(e.target.value as 'high'|'low',true)}><option value="high">Full</option><option value="low">Lite</option></select></label><p>Your choice is remembered on this device.</p><p>{reduced?'Reduced motion is on in your system settings.':'Motion can be turned off in your system accessibility settings.'}</p>{isMobile&&!reduced&&<button className="secondary" onClick={enable}><Smartphone size={15}/>{gyro==='on'?gyroMessages.on:gyro==='waiting'?gyroMessages.waiting:gyroMessages.off}</button>}{gyro!=='off'&&gyro!=='on'&&gyro!=='waiting'&&<p className="gyro-status" role="status">{gyroMessages[gyro]}</p>}</div>}
export default function App(){
 useConnection();const state=useStore(),[now,setNow]=useState(Date.now()),[settings,setSettings]=useState(false),[fps,setFps]=useState<number|null>(null);const s=state.snapshot;const live=state.connected&&now-state.receivedAt<7000;const status=overall(s,live);const disk=s?.disks.find(d=>d.id);const diskTarget:Focus=disk?diskKey(disk):s?.disks[0]?diskKey(s.disks[0]):'bay:0';const targets:Focus[]=['cpu','memory',diskTarget,'network','docker','power'];
 useEffect(()=>{const tick=state.visible?setInterval(()=>setNow(Date.now()),1000):undefined;const onFps=(e:Event)=>setFps((e as CustomEvent).detail.fps);window.addEventListener('centre-fps',onFps);return()=>{clearInterval(tick);window.removeEventListener('centre-fps',onFps)}},[state.visible]);
 useEffect(()=>{if(typeof WebGL2RenderingContext==='undefined')state.setFlat(true,'WebGL2 is not supported');if(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=2)state.setFlat(true,'Lite mode is on for this device')},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,select,textarea')||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='Escape'){setSettings(false);state.setFocus(null)}const index=Number(e.key)-1;if(index>=0&&index<targets.length)state.setFocus(targets[index])};const hash=()=>{if(location.hash==='#cinema')return;const st=useStore.getState();if(st.cinematic){st.setCinematic(false);return}state.setFocus(validFocus(location.hash))};window.addEventListener('keydown',key);window.addEventListener('hashchange',hash);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('hashchange',hash)}},[disk?.id]);
 useEffect(()=>{if(state.reduced){stopGyroscope();state.setGyroStatus('off')}},[state.reduced]);
 // AFK animation: starts after 30 s without input or from the nav button; any input ends it.
 const settingsOpen=useRef(false);settingsOpen.current=settings;
 const startFilm=useRef<(manual:boolean)=>void>(()=>{});
 useEffect(()=>{
  let last=Date.now(),entered=0,manual=false,moved=0,pointer:{x:number;y:number}|null=null;
  const canPlay=()=>{const st=useStore.getState();return st.visible&&!st.flat&&!st.reduced};
  const enter=(byButton:boolean)=>{if(!canPlay())return;entered=Date.now();manual=byButton;moved=0;pointer=null;useStore.getState().setCinematic(true)};
  startFilm.current=enter;
  const wake=()=>{last=Date.now();const st=useStore.getState();if(st.cinematic&&Date.now()-entered>600)st.setCinematic(false)};
  const move=(e:PointerEvent)=>{
   if(!useStore.getState().cinematic){last=Date.now();return}
   if(manual||Date.now()-entered<1200)return; // a film started by the button ends only on a deliberate action
   if(pointer)moved+=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y);pointer={x:e.clientX,y:e.clientY};
   if(moved>60)wake();
  };
  const opts={capture:true,passive:true};
  for(const name of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(name,wake,opts);
  window.addEventListener('pointermove',move,opts);
  const timer=setInterval(()=>{const st=useStore.getState();if(!st.visible)last=Date.now();else if(!st.cinematic&&!settingsOpen.current&&Date.now()-last>IDLE_MS)enter(false)},1000);
  if(location.hash==='#cinema')setTimeout(()=>enter(true),300);
  return()=>{clearInterval(timer);for(const name of ['pointerdown','keydown','wheel','touchstart'])window.removeEventListener(name,wake,opts);window.removeEventListener('pointermove',move,opts)};
 },[]);
 useEffect(()=>{if(state.cinematic&&(state.flat||!state.visible))state.setCinematic(false)},[state.cinematic,state.flat,state.visible]);
 const staleAge=s?Math.max(0,Math.floor((now-s.ts*1000)/1000)):null;
 const nav=[{key:'cpu' as Focus,icon:Cpu,label:'CPU'},{key:'memory' as Focus,icon:MemoryStick,label:'RAM'},{key:diskTarget,icon:HardDrive,label:'Storage'},{key:'network' as Focus,icon:Network,label:'Network'},{key:'docker' as Focus,icon:Box,label:'Docker'},{key:'power' as Focus,icon:Power,label:'Power'}];
 return <div className={`app ${state.cinematic?'cinematic':''} ${state.focus&&!state.flat?'focused':''} ${!live?'stale':''} ${state.flat?'flat-mode':''}`}>
 <a href="#components" className="skip-link">Skip to components</a><header className="topbar"><button className="brand" onClick={()=>{state.skip();state.setFocus(null)}} aria-label="centre — overview"><span className="brand-mark"><i/><i/><i/></span><b>{s?.host.name??'centre'}</b><span className="brand-divider"/><small>server monitor</small></button>{s&&<div className="top-ticker" aria-hidden="true"><span className={tone(s.cpu.usage_total)}>CPU<b>{num(s.cpu.usage_total,0)}%</b></span><span className={tone(pct(s.memory.used_mb,s.memory.total_mb))}>RAM<b>{num(pct(s.memory.used_mb,s.memory.total_mb),0)}%</b></span><span className={s.cpu.temp_c!=null&&s.cpu.temp_max_c!=null&&s.cpu.temp_c>=s.cpu.temp_max_c-10?'critical':''}>TEMP<b>{num(s.cpu.temp_c,0)}°</b></span><span>NET<b>↓{num(mainNetwork(s)?.rx_mbs)} ↑{num(mainNetwork(s)?.tx_mbs)}</b></span><span>DOCKER<b>{s.docker.filter(c=>c.state==='running').length}/{s.docker.length}</b></span></div>}<div className="top-status"><span className={`status-pill ${status.tone}`}><i/>{status.label}</span><span className="live-tag">{mockMode?'DEMO':live?'LIVE':'OFFLINE'}</span></div><button className="icon-button" aria-label="Display settings" aria-expanded={settings} onClick={()=>setSettings(v=>!v)}><Settings2 size={18}/></button></header>
 {mockMode&&<div className="demo-banner"><span>DEMO DATA · not readings from a server</span><a href={location.pathname}>Connect to the agent →</a></div>}
 {!live&&<div className="connection-banner" role="status"><WifiOff size={15}/><span>{s?`No connection. Last data ${staleAge} s ago.`:'Cannot reach the agent. Check that the agent container is running.'}</span>{!mockMode&&<a href="?mock=1">Open demo</a>}</div>}
 <main><nav className="component-nav" id="components" aria-label="Server components">{nav.map((item,i)=><button key={item.label} className={state.focus===item.key?'selected':''} aria-label={`${i+1}. ${item.label}: ${item.key==='cpu'?num(s?.cpu.usage_total)+'%, '+num(s?.cpu.temp_c)+' °C':item.key==='memory'?num(s?.memory.used_mb)+' MiB':item.key==='docker'?String(s?.docker.filter(c=>c.state==='running').length??'unknown')+' running':item.key==='network'?num(s?mainNetwork(s)?.rx_mbs:null)+' MB/s RX':item.key==='power'?num(s?.fans[0]?.rpm)+' RPM':num(disk?.used_gb)+' GB used'}`} aria-pressed={state.focus===item.key} onClick={()=>state.setFocus(item.key)}><item.icon size={21}/><span>{item.label}</span><kbd>{i+1}</kbd></button>)}{!state.flat&&!state.reduced&&<button className="cine-launch" aria-label="Cinematic fly-through of the components" onClick={()=>startFilm.current(true)}><Clapperboard size={21}/><span>Cinema</span></button>}<div className="nav-bottom"><span className="orientation-mark">N</span></div></nav>
 <div className="scene-space">{!state.flat?<SceneBoundary><Suspense fallback={<div className="scene-loading"><span/><p>Loading scene</p></div>}><Scene s={s} live={live}/></Suspense></SceneBoundary>:<FlatView s={s}/>}
 {!state.flat&&<div className="scene-caption"><span className="eyebrow">{(s?.host.model??s?.cpu.model??'').toUpperCase()}</span><h1>{state.focus?focusTitle(state.focus,s):'System pulse'}</h1>{!state.focus&&live&&<svg className="pulse-line" viewBox="0 0 150 22" aria-hidden="true"><path className="pulse-ghost" d="M0,11 H42 l5,-3 5,3 h8 l4,6 6,-16 6,14 4,-4 h14 l5,-2 5,2 H150"/><path style={{animationDuration:`${(2.6-1.8*Math.min(100,s?.cpu.usage_total??0)/100).toFixed(2)}s`}} d="M0,11 H42 l5,-3 5,3 h8 l4,6 6,-16 6,14 4,-4 h14 l5,-2 5,2 H150"/></svg>}<p>{state.focus?'Live component telemetry':'Drag to rotate · click a component'}</p></div>}

 {!state.flat&&(state.focus&&s?<div className="focus-panel-shell" key={state.focus}><DetailPanel s={s} focus={state.focus}/></div>:<OverviewPanel s={s} live={live}/>)}
 {!state.flat&&<div className="scene-key"><span>DRAG — ROTATE · RETURNS AFTER 4 s</span><span>ESC — OVERVIEW</span>{s?.fans[0]?.rpm==null&&<span>FAN — ESTIMATED FROM CPU TEMPERATURE</span>}</div>}
 {!state.flat&&<CinemaOverlay s={s}/>}
 {state.flatReason&&state.flat&&<div className="fallback-note">{state.flatReason}. Telemetry continues in 2D.</div>}</div>

 </main><footer className="bottom-bar"><div><span className={`connection-dot ${live?'ok':''}`}/><span>{s?.host.os??'Linux'}</span><span className="footer-uptime">↑ {duration(s?.host.uptime_s)}</span></div><div className="view-controls"><button onClick={()=>state.setFlat(!state.flat)} aria-label={state.flat?'Switch to 3D':'Switch to 2D'}>{state.flat?<Layers3 size={15}/>:<Database size={15}/>}<span>{state.flat?'3D scene':'2D stats'}</span></button><small>{state.flat?'2D':state.reduced?'Static':fps?`${fps} fps`:'3D'}</small></div></footer>{settings&&<Settings close={()=>setSettings(false)}/>}</div>
}
