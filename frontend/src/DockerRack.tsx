import {Suspense,useMemo} from 'react';
import {Parts,P} from './Geometry';
import type {Part} from './Geometry';
import {DockerBadges} from './DockerBadges';
import {failed} from './metrics';
import {sceneFocus,useStore} from './store';
import type {Focus,Snapshot} from './types';
import {containerHeight,dockerLayout} from './layout';

/** Containers as small shipping containers on a dock: height = RAM, roof light = CPU. */
export function DockerRack({s,live}:{s:Snapshot|null;live:boolean}){
 const focus=useStore(sceneFocus),containers=s?.docker??[];
 const layout=useMemo(()=>dockerLayout(containers.length),[containers.length]);
 const parts=useMemo(()=>{
  const {width,depth}=layout,p:Part[]=[];
  // Deck, under-plate, red edge rails.
  p.push(P([0,-.05,0],[width,.14,depth],'#201211',{target:'docker'}),P([0,-.14,0],[width+.3,.06,depth+.3],'#2c2524',{metal:true,target:'docker'}));
  for(const z of [-depth/2+.06,depth/2-.06])p.push(P([0,.035,z],[width,.03,.05],'#8a3a34',{metal:true,target:'docker'}));
  for(const x of [-width/2+.06,width/2-.06])p.push(P([x,.035,0],[.05,.03,depth-.12],'#8a3a34',{metal:true,target:'docker'}));
  // Edge connector and ribbon cables towards the motherboard.
  const pins=Math.floor((width-.6)/.16);
  for(let i=0;i<pins;i++)p.push(P([-(pins-1)*.08+i*.16,-.02,-depth/2-.09],[.08,.03,.2],'#c99a5b',{metal:true,target:'docker'}));
  for(const x of [-1.3,0,1.3])p.push(P([x,-.1,-depth/2-.36],[.7,.02,.4],'#2a1b1a',{target:'docker'}));
  containers.forEach((c,i)=>{
   const [x,z]=layout.slot(i),h=containerHeight(c.mem_mb),target=`container:${c.id}` as Focus,y=.07+h/2;
   const bad=failed(c),running=c.state==='running';
   const body=!live?'#463938':bad?'#c43b32':running?'#7a2a25':'#4d4847';
   const rib=!live?'#3a2f2e':bad?'#9d2c25':running?'#5e1f1b':'#3d3938';
   p.push(P([x,.022,z],[.8,.012,.6],'#33201f',{target}),P([x,.05,z],[.74,.04,.5],'#1d1716',{metal:true,target}));
   p.push(P([x,y,z],[.7,h,.46],body,{target}));
   // Corrugated side walls, corner posts, door lock rods, roof.
   for(let r=0;r<7;r++)for(const side of [-1,1])p.push(P([x-.27+r*.09,y,z+side*.236],[.04,h*.84,.02],rib,{target}));
   for(const dx of [-.34,.34])for(const dz of [-.22,.22])p.push(P([x+dx,y,z+dz],[.05,h+.02,.05],'#211918',{metal:true,target}));
   for(const dz of [-.1,.1])p.push(P([x+.356,y,z+dz],[.014,h*.8,.014],'#b9aaa4',{metal:true,target}));
   p.push(P([x+.354,y,z],[.01,h*.9,.012],'#211918',{target}),P([x,.07+h+.008,z],[.7,.016,.46],rib,{target}));
  });
  return p;
 },[s?.docker,live,layout]);
 return <group position={layout.centre}><Parts parts={parts}/>{(focus==='docker'||focus?.startsWith('container:'))&&<Suspense fallback={null}><DockerBadges containers={containers}/></Suspense>}</group>;
}
