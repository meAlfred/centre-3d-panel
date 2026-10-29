import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {Parts,P} from './Geometry';
import {useStore} from './store';
import {fanDrive} from './cooling';
export function CoolingFan({rpm,temp,live}:{rpm:number|null;temp:number|null;live:boolean}){
 const rotor=useRef<THREE.InstancedMesh>(null),reduced=useStore(s=>s.reduced);
 const blade=useMemo(()=>{const shape=new THREE.Shape();shape.moveTo(.24,-.06);shape.bezierCurveTo(.49,-.19,.76,-.24,.89,-.15);shape.bezierCurveTo(.91,-.01,.77,.19,.65,.22);shape.bezierCurveTo(.53,.09,.35,.08,.24,.06);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.032,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.012,bevelThickness:.006,curveSegments:8});g.rotateX(-Math.PI/2);return g},[]);
 const mat=useMemo(()=>new THREE.MeshStandardMaterial({color:'#181717',metalness:.28,roughness:.43,side:THREE.DoubleSide}),[]);
 const housing=useMemo(()=>{const out=[P([0,-.02,-1.01],[2.16,.24,.17],'#181515'),P([0,-.02,1.01],[2.16,.24,.17],'#181515'),P([-1.01,-.02,0],[.17,.24,1.9],'#181515'),P([1.01,-.02,0],[.17,.24,1.9],'#181515')];for(const x of [-.91,.91])for(const z of [-.91,.91])out.push(P([x,.11,z],[.18,.04,.18],'#5f5a52',{kind:'cylinder',metal:true}),P([x,.138,z],[.105,.014,.022],'#191514'));return out},[]);
 useEffect(()=>()=>blade.dispose(),[blade]);
 useEffect(()=>()=>mat.dispose(),[mat]);
 const matrix=useMemo(()=>new THREE.Object3D(),[]),angle=useRef(0),speed=useRef(0);
 useFrame((_,dt)=>{const step=Math.min(dt,.05);speed.current=THREE.MathUtils.damp(speed.current,live?fanDrive(rpm,temp).speed:0,1.6,step);if(!reduced)angle.current+=step*speed.current;if(rotor.current){for(let i=0;i<7;i++){matrix.rotation.set(0,angle.current+i*Math.PI*2/7,0);matrix.updateMatrix();rotor.current.setMatrixAt(i,matrix.matrix)}rotor.current.instanceMatrix.needsUpdate=true}});
 return <group><Parts parts={housing}/><mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.965,.065,8,48]}/><meshStandardMaterial color="#22201f" roughness={.4} metalness={.45}/></mesh><instancedMesh ref={rotor} args={[blade,mat,7]} frustumCulled={false}/><mesh position={[0,.045,0]}><cylinderGeometry args={[.265,.285,.11,32]}/><meshStandardMaterial color="#242120" metalness={.45} roughness={.38}/></mesh><mesh position={[0,.103,0]}><cylinderGeometry args={[.135,.135,.007,24]}/><meshStandardMaterial color="#941a17" metalness={.6} roughness={.35}/></mesh></group>;
}
export function Airflow({live,strength=1}:{live:boolean;strength?:number}){
 const reduced=useStore(s=>s.reduced),quality=useStore(s=>s.quality);
 const geometry=useMemo(()=>{const count=quality==='high'?36:18,segments=28,positions:number[]=[],phases:number[]=[];for(let line=0;line<count;line++){const angle=line*2.39996,radius=.16+(line%7)*.067;for(let j=0;j<segments;j++)for(const t of [j/segments,(j+1)/segments]){const spread=1+t*1.9,swirl=angle+t*3.7;positions.push(-2+Math.cos(swirl)*radius*spread,.55+Math.sin(swirl)*radius*spread,-6.77-t*4.7);phases.push(t,line/count)}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('aPhase',new THREE.Float32BufferAttribute(phases,2));return g},[quality]);
 const material=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uTime:{value:0},uLive:{value:0}},vertexShader:`attribute vec2 aPhase;varying vec2 vPhase;void main(){vPhase=aPhase;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;uniform float uLive;varying vec2 vPhase;void main(){float pulse=pow(fract(vPhase.x*2.-uTime*.75+vPhase.y),5.);float fade=sin(vPhase.x*3.14159);vec3 c=mix(vec3(.9,.65,.4),vec3(.9,.12,.07),vPhase.x);gl_FragColor=vec4(c,(.025+pulse*.6)*fade*uLive);}`}),[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useEffect(()=>()=>material.dispose(),[material]);
 useFrame((_,dt)=>{if(!reduced&&live)material.uniforms.uTime.value+=Math.min(dt,.05)*(.5+strength);material.uniforms.uLive.value=live?.45+.55*strength:0});
 return <lineSegments geometry={geometry} material={material}/>;
}
