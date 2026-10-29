import {create} from 'zustand';
import type {Focus,HistoryPoint,Snapshot} from './types';
import type {GyroStatus} from './gyro';
import {historyPoint,validFocus} from './metrics';
type State={gyroStatus:GyroStatus;setGyroStatus:(status:GyroStatus)=>void;snapshot:Snapshot|null;history:HistoryPoint[];connected:boolean;receivedAt:number;focus:Focus;mode:'overview'|'focus';flat:boolean;flatReason:string;quality:'high'|'low';qualityPinned:boolean;cinematic:boolean;cineOpen:string|null;setCinematic:(on:boolean)=>void;reduced:boolean;visible:boolean;receive:(s:Snapshot)=>void;setConnected:(v:boolean)=>void;setFocus:(f:Focus)=>void;skip:()=>void;setFlat:(v:boolean,reason?:string)=>void;setQuality:(q:'high'|'low',remember?:boolean)=>void;setVisible:(v:boolean)=>void};
export const mockMode=new URLSearchParams(location.search).get('mock')==='1';
export const isMobile=matchMedia('(max-width: 800px), (pointer: coarse)').matches;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const hash=validFocus(location.hash);
// The viewer's own choice of 3D quality survives reloads; automatic downgrades are never stored.
const QUALITY_KEY='centre.quality';
const savedQuality=(()=>{try{const v=localStorage.getItem(QUALITY_KEY);return v==='high'||v==='low'?v:null}catch{return null}})();
export const useStore=create<State>((set)=>({
 gyroStatus:'off',setGyroStatus:(gyroStatus)=>set({gyroStatus}),snapshot:null,history:[],connected:false,receivedAt:0,focus:hash,mode:hash?'focus':'overview',flat:new URLSearchParams(location.search).get('view')==='2d',flatReason:'',quality:savedQuality??(isMobile?'low':'high'),qualityPinned:savedQuality!==null,cinematic:false,cineOpen:null,
 setCinematic:(on)=>set(state=>{if(on===state.cinematic)return state;
  // '#cinema' lets the Android back gesture end the animation instead of closing the app.
  history.replaceState(null,'',`${location.pathname}${location.search}${on?'#cinema':state.focus?'#'+encodeURIComponent(state.focus):''}`);
  return {cinematic:on,cineOpen:null}}),reduced,visible:!document.hidden,
 receive:(s)=>set(state=>{if(state.snapshot&&s.ts<state.snapshot.ts&&s.sequence<=state.snapshot.sequence)return state;const restart=state.snapshot&&s.sequence<state.snapshot.sequence&&s.ts>=state.snapshot.ts;let history=restart?[]:state.history; if(!history.length||s.ts>history[history.length-1].ts)history=[...history,historyPoint(s)].filter(p=>p.ts>=s.ts-300).slice(-301);return {snapshot:s,history,receivedAt:Date.now(),connected:s.sources.host?.status==='ok'}}),
 setConnected:(connected)=>set({connected}),setFocus:(focus)=>{history.replaceState(null,'',`${location.pathname}${location.search}${focus?'#'+encodeURIComponent(focus):''}`);set({focus,mode:focus?'focus':'overview'})},
 skip:()=>{set({mode:'overview',focus:null})},
 setFlat:(flat,flatReason='')=>set(state=>({flat,flatReason,mode:state.focus?'focus':'overview'})),setQuality:(quality,remember=false)=>{if(remember){try{localStorage.setItem(QUALITY_KEY,quality)}catch{/* private mode: the choice lasts for this visit */}}set(remember?{quality,qualityPinned:true}:{quality})},setVisible:(visible)=>set({visible}),
}));
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{useStore.setState({reduced:e.matches});if(e.matches)useStore.getState().skip()});
/** A click in the scene. From anywhere outside the Docker view a container first
 *  opens the list of all containers; inside that view it opens the container itself. */
export function pick(target:Focus){
 const {focus,setFocus}=useStore.getState();
 const inDocker=focus==='docker'||!!focus?.startsWith('container:');
 setFocus(target?.startsWith('container:')&&!inDocker?'docker':target);
}
/** Component focus as the 3D scene should show it: the AFK animation shows the whole machine. */
export const sceneFocus=(v:{cinematic:boolean;focus:Focus})=>v.cinematic?null:v.focus;
