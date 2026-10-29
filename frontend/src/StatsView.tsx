import {useEffect} from 'react';
import {Activity} from 'lucide-react';
import {useStore} from './store';
import {diskKey} from './metrics';
import {DetailPanel} from './Panels';
import type {Focus,Snapshot} from './types';
export function FlatView({s}:{s:Snapshot|null}){
 const focus=useStore(v=>v.focus),reduced=useStore(v=>v.reduced),ready=!!s;
 useEffect(()=>{if(focus)document.getElementById(focus.startsWith('container:')?'stats-container-detail':`stats-${focus}`)?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'})},[focus,reduced,ready]);
 if(!s)return <div className="flat-empty"><Activity size={40}/><h2>Waiting for telemetry</h2><p>Check that the agent container is running.</p></div>;
 const sections:Focus[]=['cpu','memory',...s.disks.map(diskKey),'network','docker','power'];
 return <div className="stats-view"><header className="stats-heading"><span className="eyebrow">CENTRE / TELEMETRY</span><h1>System in detail</h1><p>Readings, load history and the state of every component</p></header>{sections.map((section,i)=><section id={`stats-${section}`} key={section??i} className={`stats-band ${focus===section?'active':''}`}><div className="stats-index">{String(i+1).padStart(2,'0')}<span>{section?.split(':')[0].toUpperCase()}</span></div><DetailPanel s={s} focus={section} embedded/>{section==='docker'&&focus?.startsWith('container:')&&<div id="stats-container-detail" className="stats-container-detail"><DetailPanel s={s} focus={focus} embedded/></div>}</section>)}</div>
}
