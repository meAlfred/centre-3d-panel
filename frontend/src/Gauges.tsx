import type {N} from './types';
import {num} from './metrics';

/** 270° ring gauge. An unknown value draws an empty ring, never a guessed one. */
export function Gauge({label,value,max=100,unit,digits=0,onClick}:{label:string;value:N|undefined;max?:number;unit:string;digits?:number;onClick?:()=>void}){
 const known=value!=null&&Number.isFinite(value),share=known?Math.max(0,Math.min(1,value!/max)):0;
 const radius=27,arc=2*Math.PI*radius*.75,tone=!known?'unknown':share>.9?'critical':share>.75?'warning':'ok';
 return <button className={`gauge ${tone}`} onClick={onClick} aria-label={`${label}: ${num(value,digits)} ${unit}`}>
  <svg viewBox="0 0 64 64" aria-hidden="true">
   <circle className="gauge-track" cx="32" cy="32" r={radius} strokeDasharray={`${arc} 999`} transform="rotate(135 32 32)"/>
   <circle className="gauge-fill" cx="32" cy="32" r={radius} strokeDasharray={`${arc*share} 999`} transform="rotate(135 32 32)"/>
  </svg>
  <strong>{num(value,digits)}<small>{unit}</small></strong>
  <span>{label}</span>
 </button>;
}

/** Tiny history line for HUD cards; gaps stay gaps. */
export function Spark({values,max}:{values:N[];max?:number}){
 const recent=values.slice(-45),known=recent.filter((v):v is number=>v!=null&&Number.isFinite(v));
 if(known.length<2)return null;
 const top=max??Math.max(1e-6,...known)*1.15;
 let open=false;
 const path=recent.map((v,i)=>{
  if(v==null||!Number.isFinite(v)){open=false;return ''}
  const point=`${open?'L':'M'}${(i/Math.max(1,recent.length-1)*100).toFixed(1)},${(22-Math.min(1,Math.max(0,v/top))*20).toFixed(1)}`;
  open=true;return point;
 }).join(' ');
 return <svg className="hud-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d={path}/></svg>;
}

export function Bar({label,share,text}:{label:string;share:N;text:string}){
 const tone=share==null?'unknown':share>90?'critical':share>75?'warning':'ok';
 return <div className={`usage-bar ${tone}`}><div><span>{label}</span><b>{text}</b></div><i><em style={{width:`${share??0}%`}}/></i></div>;
}

/** Area sparkline for the AFK strip. */
export function AreaSpark({values,max}:{values:N[];max?:number}){
 const recent=values.slice(-90),known=recent.filter((v):v is number=>v!=null&&Number.isFinite(v));
 if(known.length<2)return <svg className="cine-spark" viewBox="0 0 100 30" aria-hidden="true"/>;
 const top=max??Math.max(1e-6,...known)*1.15,x=(i:number)=>i/Math.max(1,recent.length-1)*100,y=(v:number)=>29-Math.min(1,Math.max(0,v/top))*27;
 const runs:string[]=[];let line='',first=-1,last=-1;
 recent.forEach((v,i)=>{
  if(v==null||!Number.isFinite(v)){if(line){runs.push(`${line} L${x(last).toFixed(1)},30 L${x(first).toFixed(1)},30 Z`);line=''}return}
  if(!line){first=i;line=`M${x(i).toFixed(1)},${y(v).toFixed(1)}`}else line+=` L${x(i).toFixed(1)},${y(v).toFixed(1)}`;last=i;
 });
 if(line)runs.push(`${line} L${x(last).toFixed(1)},30 L${x(first).toFixed(1)},30 Z`);
 return <svg className="cine-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">{runs.map((d,i)=><path key={i} d={d}/>)}</svg>;
}
