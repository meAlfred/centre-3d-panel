import {useStore} from './store';
import {AreaSpark} from './Gauges';
import {mainNetwork,num,tone} from './metrics';
import type {N,Snapshot} from './types';

/** What stays on screen during the AFK animation: one strip with every component's load. */
export function CinemaOverlay({s}:{s:Snapshot|null}){
 const history=useStore(v=>v.history),manual=useStore(v=>v.cinematic);
 const net=s?mainNetwork(s):null;
 const sum=(values:N[])=>values.some(v=>v!=null)?values.reduce<number>((a,v)=>a+(v??0),0):null;
 const items:{label:string;value:N;unit:string;series:N[];max?:number;level?:N}[]=[
  {label:'CPU',value:s?.cpu.usage_total??null,unit:'%',series:history.map(p=>p.cpu),max:100,level:s?.cpu.usage_total},
  {label:'Temp',value:s?.cpu.temp_c??null,unit:'°C',series:history.map(p=>p.temp),max:s?.cpu.temp_max_c??100,level:s?.cpu.temp_c!=null?s.cpu.temp_c/(s.cpu.temp_max_c??100)*100:null},
  {label:'RAM',value:history.at(-1)?.memory??null,unit:'%',series:history.map(p=>p.memory),max:100,level:history.at(-1)?.memory},
  {label:net?.iface??'Network',value:net?(net.rx_mbs??0)+(net.tx_mbs??0):null,unit:'MB/s',series:history.map(p=>p.rx==null&&p.tx==null?null:(p.rx??0)+(p.tx??0))},
  ...(s?.disks.filter(d=>d.id).map(d=>({label:`${d.id} · ${d.kind.toUpperCase()}`,value:d.read_mbs==null&&d.write_mbs==null?null:(d.read_mbs??0)+(d.write_mbs??0),unit:'MB/s',series:history.map(p=>{const v=p.disks[d.id!];return v?sum([v.read,v.write]):null})}))??[]),
  {label:'Docker',value:s?sum(s.docker.map(c=>c.cpu)):null,unit:'% CPU',series:history.map(p=>sum(Object.values(p.docker).map(c=>c.cpu)))},
 ];
 return <><div id="cine-fade" className="cine-fade"/>{manual&&<div className="cinema" aria-hidden="true">
  <div className="cine-bar top"/><div className="cine-bar bottom"/>
  <div className="cine-title"><span>CENTRE · IDLE</span><strong id="cine-title"/></div>
  <div className="cine-hint">Tap, press a key or scroll to exit</div>
  <div className="cine-strip">{items.map(item=><div key={item.label} className={`cine-cell ${item.level!=null?tone(item.level):''}`}>
   <span>{item.label}</span><b>{num(item.value)}<small>{item.unit}</small></b><AreaSpark values={item.series} max={item.max}/>
  </div>)}</div>
 </div>}</>;
}
