/** AFK camera: a loop of hand-placed shots around the machine. Pure maths, no three.js. */
import {diskPosition,dockerLayout} from './layout.ts';
import type {Snapshot} from './types.ts';

export type Vec=[number,number,number];
export type Shot={
 title:string;duration:number;
 from:Vec;to:Vec;lookFrom:Vec;lookTo:Vec;
 fov:[number,number];roll:[number,number];
 /** Arc around a point instead of a straight line: angles in radians, height is absolute Y. */
 orbit?:{center:Vec;radius:number;height:[number,number];angle:[number,number]};
 /** Shake strength and the point that causes it: only felt while the camera passes close. */
 shake:number;shakeAt?:Vec;shakeRadius?:number;
 /** Drive whose cover opens during the shot. */
 open?:string;
};
export const IDLE_MS=30000;

const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const mix=(a:Vec,b:Vec,t:number):Vec=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
const add=(a:Vec,b:Vec):Vec=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
/** Never fully stops inside a shot: part linear, part smooth. */
export const shotEase=(t:number)=>{const x=Math.max(0,Math.min(1,t));return lerp(x,x*x*(3-2*x),.45)};
const ZERO:Vec=[0,0,0];
const orbit=(title:string,duration:number,center:Vec,radius:number,height:[number,number],angle:[number,number],look:Vec,fov:[number,number],roll:[number,number]=[0,0]):Shot=>
 ({title,duration,from:ZERO,to:ZERO,lookFrom:look,lookTo:look,fov,roll,orbit:{center,radius,height,angle},shake:0});

export function cinematicShots(s:Snapshot|null):Shot[]{
 const disks=s?.disks??[];
 const hdd=disks.findIndex(d=>d.kind==='hdd'&&d.id),ssd=disks.findIndex(d=>d.id);
 const driveIndex=hdd>=0?hdd:Math.max(0,ssd),drive=disks[driveIndex];
 const bay=diskPosition(driveIndex),open=drive?.id?`disk:${drive.id}`:undefined;
 const driveTitle=drive?`Storage · ${drive.model??drive.id}`:'Storage';
 const dock=dockerLayout(s?.docker.length??0),dx=dock.centre[0],dz=dock.centre[2],front=dz-dock.depth/2;
 const cpu:Vec=[-1,1.15,-1.1];
 const shots:Shot[]=[
  {title:'Processor · cooler',duration:6.5,from:[-4.8,1.3,-3.5],to:[2.5,1.95,-3.1],lookFrom:[-1.7,1,-1.1],lookTo:[-.3,1.05,-1.1],fov:[54,46],roll:[.28,-.14],shake:.035,shakeAt:cpu,shakeRadius:3.2},
  {title:'Board traces',duration:5.5,from:[-4.4,.95,.75],to:[1,1.05,.95],lookFrom:[-1.8,.05,1.2],lookTo:[4.4,.1,1.8],fov:[58,50],roll:[-.16,-.05],shake:0},
  {title:'Memory',duration:6,from:[4.7,1.7,-3.9],to:[4.5,1.4,1.3],lookFrom:[2.6,.6,-2.2],lookTo:[2.6,.6,-.1],fov:[46,40],roll:[-.08,.12],shake:0},
  {title:driveTitle,duration:6.5,from:add(bay,[3.4,3.1,-2.4]),to:add(bay,[1.9,1.4,3]),lookFrom:add(bay,[0,.25,0]),lookTo:add(bay,[-.2,.3,-.2]),fov:[40,46],roll:[.06,-.04],shake:0,open},
  {title:'Docker',duration:6.5,from:[dx-4,8.5,dz+6.5],to:[dx+3.2,2.6,dz+3.4],lookFrom:[dx,0,dz],lookTo:[dx-.3,.3,dz-.2],fov:[44,50],roll:[0,.1],shake:0},
  orbit('Processor · from above',6,[-1,0,-1.1],1.7,[4.4,3.6],[.2,1.9],[-1,.9,-1.1],[42,46],[0,.12]),
  {title:'Airflow',duration:5.5,from:[-2.6,1,-11.5],to:[-1.6,1.55,-7.6],lookFrom:[-2,.6,-5],lookTo:[-1.4,.6,-2.5],fov:[60,50],roll:[-.12,.06],shake:0},
  {title:'Network',duration:5,from:[-7,1.4,1.4],to:[-6.3,.95,-2.9],lookFrom:[-4.65,.45,-1.1],lookTo:[-4.7,.4,-1.2],fov:[44,40],roll:[.08,-.06],shake:0},
  {title:'Memory · from above',duration:5.5,from:[2.7,3.8,-4.4],to:[2.7,2.7,1.9],lookFrom:[2.7,.5,-2.3],lookTo:[2.7,.5,.2],fov:[44,40],roll:[.1,-.05],shake:0},
  {title:'Docker · along the row',duration:6,from:[dx-dock.width/2-1.2,1.15,front-1.15],to:[dx+dock.width/2+.4,1.3,front-1.3],lookFrom:[dx-dock.width/2+.8,.45,front+.7],lookTo:[dx+dock.width/2+2,.5,front+1],fov:[50,44],roll:[-.1,.06],shake:0},
  orbit(`${driveTitle} · orbit`,6.5,[bay[0],0,bay[2]],3.7,[2.4,1.6],[-.35,1.15],add(bay,[0,.3,0]),[42,40],[.05,-.05]),
  orbit('Board · map',6,[.5,0,.5],2.2,[13.5,12],[0,.9],[.5,0,.6],[44,42]),
  {title:'Processor · front',duration:5.5,from:[-2.7,1.25,2.6],to:[-.1,1.05,1.3],lookFrom:cpu,lookTo:[-1,1,-1.1],fov:[50,40],roll:[-.14,.08],shake:.02,shakeAt:cpu,shakeRadius:2.8},
  orbit('Power supply',5.5,[-2,0,-5.6],3.7,[2.1,1.6],[-2.5,-1],[-2,.6,-5.6],[44,48],[0,-.08]),
  {title:s?.host?.name??'centre',duration:7,from:[8.5,1.6,8.5],to:[12.5,5.2,12.8],lookFrom:[.5,.3,.5],lookTo:[.3,.4,.8],fov:[46,40],roll:[-.05,0],shake:0},
 ];
 return shots.map(shot=>({...shot,open:shot.open??(shot.title.startsWith(driveTitle)?open:undefined)}));
}

/** Camera state at time t (seconds) inside a shot; closeness 0..1 drives the shake. */
export function shotPose(shot:Shot,t:number){
 const k=shotEase(t/shot.duration);
 let position=mix(shot.from,shot.to,k);
 if(shot.orbit){
  const o=shot.orbit,a=lerp(o.angle[0],o.angle[1],k);
  position=[o.center[0]+Math.cos(a)*o.radius,lerp(o.height[0],o.height[1],k),o.center[2]+Math.sin(a)*o.radius];
 }
 const look=mix(shot.lookFrom,shot.lookTo,k);
 let closeness=0;
 if(shot.shakeAt&&shot.shake>0){
  const d=Math.hypot(position[0]-shot.shakeAt[0],position[1]-shot.shakeAt[1],position[2]-shot.shakeAt[2]);
  closeness=Math.max(0,1-d/(shot.shakeRadius??2.5))**2;
 }
 return {position,look,fov:lerp(shot.fov[0],shot.fov[1],k),roll:lerp(shot.roll[0],shot.roll[1],k),closeness};
}

/** Smooth rumble, -1..1 per axis (low frequencies: a buffet of air, not a vibrating phone). */
export function shakeNoise(time:number):Vec{
 return [
  Math.sin(time*5.1)*.55+Math.sin(time*8.7+1.3)*.3+Math.sin(time*13.1+2.1)*.15,
  Math.sin(time*4.3+.7)*.55+Math.sin(time*9.9+2.9)*.3+Math.sin(time*12.7+.4)*.15,
  Math.sin(time*3.7+1.9)*.65+Math.sin(time*7.3+.2)*.35,
 ];
}

/** Black fade between cuts: 1 at a cut, 0 mid-shot. */
export function cutFade(t:number,duration:number){
 const inFade=Math.max(0,1-t/.4),outFade=Math.max(0,1-(duration-t)/.28);
 return Math.min(1,Math.max(inFade,outFade));
}
