import {useState} from 'react';
import {Billboard,Html,useTexture} from '@react-three/drei';
import * as THREE from 'three';
import type {Container} from './types';
import {serviceIdentity} from './services';
import {ServiceIcon} from './ServiceIcon';
import {failed,num} from './metrics';
import {activateLabel} from './interaction';
import {sceneFocus,useStore} from './store';
import {containerHeight,dockerLayout} from './layout';

function Badge({container,index,count}:{container:Container;index:number;count:number}){
 const [hover,setHover]=useState(false),focus=useStore(sceneFocus);
 const texture=useTexture(serviceIdentity(container.name).icon);
 texture.colorSpace=THREE.SRGBColorSpace;
 const [x,z]=dockerLayout(count).slot(index);
 const height=.07+containerHeight(container.mem_mb);
 const selected=focus===`container:${container.id}`;
 const open=()=>useStore.getState().setFocus(`container:${container.id}`);
 return <group position={[x,height+.3,z]}><Billboard><mesh onClick={e=>{e.stopPropagation();open()}} onPointerOver={e=>{e.stopPropagation();setHover(true);document.body.style.cursor='pointer'}} onPointerOut={()=>{setHover(false);document.body.style.cursor='auto'}}><planeGeometry args={[.32,.32]}/><meshBasicMaterial map={texture} transparent alphaTest={.04} toneMapped={false} depthWrite={false}/></mesh></Billboard>{(hover||selected)&&<Html center position={[0,.53,0]} zIndexRange={[9,8]}><button className={`service-marker ${failed(container)?'critical':''}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>activateLabel(e,`container:${container.id}`,useStore.getState().setFocus)}><ServiceIcon name={container.name}/><span><strong>{container.name??container.id}</strong><small>{num(container.cpu)}% CPU · {num(container.mem_mb,0)} MiB</small></span><i className="service-dot"/></button></Html>}</group>;
}
export function DockerBadges({containers}:{containers:Container[]}){
 return <>{containers.map((container,index)=><Badge key={container.id} container={container} index={index} count={containers.length}/>)}</>;
}
