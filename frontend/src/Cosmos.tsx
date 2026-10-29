import {useEffect,useLayoutEffect,useMemo} from 'react';
import {useThree} from '@react-three/fiber';
import {useTexture} from '@react-three/drei';
import * as THREE from 'three';
import {useStore} from './store';
/** Local sky detail: directional projections rather than one stretched panorama. */
export function Cosmos(){
 const texture=useTexture('/cosmos/nebula-sector.webp'),gl=useThree(s=>s.gl);
 useLayoutEffect(()=>{texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(8,gl.capabilities.getMaxAnisotropy());texture.needsUpdate=true},[texture,gl]);
 const material=useMemo(()=>new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,uniforms:{uSky:{value:texture}},
  vertexShader:`varying vec3 vDirection;void main(){vDirection=position;vec4 p=projectionMatrix*viewMatrix*vec4(cameraPosition+position*100.,1.);gl_Position=p.xyww;}`,
  fragmentShader:`uniform sampler2D uSky;varying vec3 vDirection;
   void main(){vec3 d=normalize(vDirection);vec3 w=pow(abs(d),vec3(12.));w/=max(.0001,w.x+w.y+w.z);
    vec3 a=texture2D(uSky,d.yz*1.25+vec2(.17,.31)).rgb;
    vec3 b=texture2D(uSky,d.zx*1.25+vec2(.63,.11)).rgb;
    vec3 c=texture2D(uSky,d.xy*1.25+vec2(.29,.73)).rgb;
    gl_FragColor=vec4((a*w.x+b*w.y+c*w.z)*.7,1.);
    #include <colorspace_fragment>
   }`,
 }),[texture]);
 useEffect(()=>()=>material.dispose(),[material]);
 return <><mesh renderOrder={-1000} frustumCulled={false} material={material} raycast={()=>null}><sphereGeometry args={[1,48,24]}/></mesh><DistantStars/></>;
}
function DistantStars(){
 const quality=useStore(s=>s.quality),dpr=useThree(s=>s.viewport.dpr);
 const geometry=useMemo(()=>{
  const count=quality==='high'?2200:1100,g=new THREE.BufferGeometry(),positions=new Float32Array(count*3),sizes=new Float32Array(count),tints=new Float32Array(count);
  let seed=92831;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<count;i++){const y=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-y*y);positions.set([Math.cos(angle)*r,y,Math.sin(angle)*r],i*3);sizes[i]=1.6+Math.pow(random(),5)*2;tints[i]=random()}
  g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));g.setAttribute('aTint',new THREE.BufferAttribute(tints,1));return g;
 },[quality]);
 const material=useMemo(()=>new THREE.ShaderMaterial({
  transparent:true,depthTest:true,depthWrite:false,depthFunc:THREE.LessEqualDepth,toneMapped:false,uniforms:{uDpr:{value:dpr}},
  vertexShader:`attribute float aSize;attribute float aTint;uniform float uDpr;varying float vTint;void main(){vTint=aTint;vec4 p=projectionMatrix*viewMatrix*vec4(cameraPosition+position*100.,1.);gl_Position=p.xyww;gl_PointSize=aSize*uDpr;}`,
  fragmentShader:`varying float vTint;void main(){float r=length(gl_PointCoord-.5);float alpha=exp(-r*r*16.)*(1.-smoothstep(.3,.5,r));vec3 tint=mix(vec3(1.,.73,.48),vec3(1.,.96,.88),vTint);gl_FragColor=vec4(tint,alpha*.85);}`,
 }),[]);
 useLayoutEffect(()=>{material.uniforms.uDpr.value=dpr},[material,dpr]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);useEffect(()=>()=>material.dispose(),[material]);
 // Far-plane depth keeps stars behind the hardware, including during zoom.
 return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-999} raycast={()=>null}/>;
}
