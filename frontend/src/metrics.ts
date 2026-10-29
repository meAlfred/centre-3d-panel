import type {Container, Disk, Focus, HistoryPoint, N, Snapshot} from './types.ts';
export const num=(v:N|undefined, digits=1)=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(v);
export const pct=(used:N|undefined,total:N|undefined):N=>used==null||total==null||total<=0?null:Math.max(0,Math.min(100,used/total*100));
export const clamp=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
export const duration=(n:N|undefined)=>{if(n==null)return '—'; const d=Math.floor(n/86400),h=Math.floor(n%86400/3600),m=Math.floor(n%3600/60);return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`};
export const mainNetwork=(s:Snapshot)=>s.network.find(n=>/^(en|eth|wl)/.test(n.iface))??s.network.find(n=>n.iface==='tailscale0');
export const failed=(c:Container)=>['dead','exited','restarting'].includes(c.state??'')||c.health==='unhealthy';
export const tone=(n:N|undefined)=>n==null?'unknown':n>90?'critical':n>75?'warning':'ok';
export function sourceFresh(s:Snapshot|undefined|null,key:string,now=Date.now()/1000){const v=s?.sources[key];return !!v&&v.status==='ok'&&v.observed_at!=null&&now-v.observed_at<(key==='kuma'?35:key==='smart'?130:key==='directories'?1250:8)}
export function overall(s:Snapshot|null,live:boolean){
 if(!s||!live)return {tone:'unknown',label:'No connection'};
 if(sourceFresh(s,'docker')&&s.docker.some(failed))return {tone:'critical',label:'Needs attention'};
 if(s.cpu.temp_c!=null&&s.cpu.temp_max_c!=null&&s.cpu.temp_c>=s.cpu.temp_max_c-10)return {tone:'critical',label:'High temperature'};
 if(s.disks.some(d=>d.kind==='unavailable'||(d.smart?.status==='ok'&&d.smart.health==='FAILED')))return {tone:'critical',label:'Check storage'};
 if((s.cpu.usage_total??0)>90||(pct(s.memory.used_mb,s.memory.total_mb)??0)>90||(s.memory.pressure_some_60s??0)>5)return {tone:'warning',label:'High load'};
 if(sourceFresh(s,'kuma')&&s.services.some(s=>s.up===false))return {tone:'critical',label:'Service down'};
 if(s.disks.some(d=>d.id&&['unavailable','stale'].includes(d.smart?.status??'')))return {tone:'warning',label:'SMART unavailable'};
 if(Object.entries(s.sources).some(([key,v])=>key!=='igpu'&&(v.status==='error'||v.status==='stale')))return {tone:'warning',label:'Some data unavailable'};
 return {tone:'ok',label:'All systems normal'};
}
export const diskKey=(d:Disk)=>d.id?`disk:${d.id}` as Focus:`bay:${d.bay??0}` as Focus;
export function validFocus(value:string):Focus {let h:string;try{h=decodeURIComponent(value.replace(/^#/,''))}catch{return null}return /^(cpu|memory|network|docker|power|disk:[\w.-]+|bay:\d+|container:[\w.-]+)$/.test(h)?h as Focus:null}
export function historyPoint(s:Snapshot):HistoryPoint {const n=mainNetwork(s),dockerFresh=sourceFresh(s,'docker');return {ts:s.ts,cpu:s.cpu.usage_total,temp:s.cpu.temp_c,memory:pct(s.memory.used_mb,s.memory.total_mb),rx:n?.rx_mbs??null,tx:n?.tx_mbs??null,disks:Object.fromEntries(s.disks.filter(d=>d.id).map(d=>[d.id!,{read:d.read_mbs,write:d.write_mbs,iops:d.iops}])),docker:Object.fromEntries(s.docker.map(c=>[c.id,{cpu:dockerFresh?c.cpu:null,memory:dockerFresh?c.mem_mb:null}]))}}
export const focusTitle=(f:Focus,s:Snapshot|null)=>f==='cpu'?'Processor':f==='memory'?'Memory':f==='network'?'Network':f==='docker'?'Containers & services':f==='power'?'Power & cooling':f?.startsWith('disk:')?s?.disks.find(d=>d.id===f.slice(5))?.model??(f.slice(5)||'Drive'):f?.startsWith('container:')?s?.docker.find(c=>c.id===f.slice(10))?.name??'Container':'Empty bay';
