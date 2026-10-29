import {useState} from 'react';
import {num} from './metrics';
import type {N} from './types';
export function Chart({series,labels,unit='',max}:{series:N[][];labels:string[];unit?:string;max?:number}){
 const [hover,setHover]=useState<number|null>(null);const all=series.flat().filter((n):n is number=>n!=null&&Number.isFinite(n));const count=Math.max(0,...series.map(s=>s.length));
 const high=max??Math.max(1,...all)*1.12;const colors=['#ff443a','#ffc078'];const w=320,h=108,p=6;
 const x=(i:number)=>p+i/Math.max(1,count-1)*(w-p*2),y=(n:number)=>h-p-Math.max(0,Math.min(high,n))/high*(h-p*2);
 const path=(values:N[])=>{let open=false;return values.map((v,i)=>{if(v==null){open=false;return ''}const d=`${open?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;open=true;return d}).join(' ')};
 return <div className="chart"><div className="chart-legend">{labels.map((label,i)=><span key={label}><i style={{background:colors[i]}}/>{label} <b>{num(series[i]?.[hover??count-1])}{unit}</b></span>)}</div><div className="plot" onMouseLeave={()=>setHover(null)} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(count-1,Math.round((e.clientX-r.left)/r.width*(count-1)))))}}>
 <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Chart: ${labels.join(', ')}. Received measurements only.`} preserveAspectRatio="none"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#da4f48" stopOpacity=".12"/><stop offset="1" stopColor="#da4f48" stopOpacity="0"/></linearGradient></defs>{[.25,.5,.75,1].map(f=><line key={f} x1="0" x2={w} y1={y(high*f)} y2={y(high*f)} stroke="#ffffff0c" strokeDasharray="2 5"/>)}
 {series.map((values,i)=><path key={i} d={path(values)} fill="none" stroke={colors[i]} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>)}{hover!=null&&count>1&&<line x1={x(hover)} x2={x(hover)} y1="0" y2={h} stroke="#948484" strokeDasharray="3 3"/>}</svg>
 {all.length<2&&<span className="chart-empty">Collecting history…</span>}</div><div className="chart-axis"><span>last 5 min · {count} samples</span><span>{num(high)} {unit}</span></div></div>
}
