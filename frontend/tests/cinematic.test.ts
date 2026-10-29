import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cinematicShots,cutFade,shakeNoise,shotPose} from '../src/cinematic.ts';
import {heatLevel,stormLevel} from '../src/stormLevel.ts';
import type {Snapshot} from '../src/types.ts';
const snapshots=[null,{disks:[{id:'sda',kind:'ssd',bay:0},{id:null,kind:'empty',bay:1}],docker:Array.from({length:6},(_,i)=>({id:String(i)}))},
 {disks:[{id:'sda',kind:'ssd',bay:0},{id:'sdb',kind:'hdd',bay:1}],docker:Array.from({length:29},(_,i)=>({id:String(i)}))}] as (Snapshot|null)[];
test('every shot keeps the camera above the board and looking at something',()=>{
 for(const s of snapshots)for(const shot of cinematicShots(s)){
  assert.ok(shot.duration>=4);
  for(let t=0;t<=shot.duration;t+=.1){
   const p=shotPose(shot,t);
   for(const n of [...p.position,...p.look,p.fov,p.roll,p.closeness])assert.ok(Number.isFinite(n));
   assert.ok(p.position[1]>=.38,`${shot.title}: camera dips into the board`);
   assert.ok(Math.hypot(p.position[0]-p.look[0],p.position[1]-p.look[1],p.position[2]-p.look[2])>.8,`${shot.title}: looks at its own position`);
   assert.ok(p.fov>=35&&p.fov<=65&&Math.abs(p.roll)<.4&&p.closeness>=0&&p.closeness<=1);
  }
 }
});
test('the drive shot opens the hard disk when there is one',()=>{
 assert.equal(cinematicShots(snapshots[2]).find(s=>s.open)?.open,'disk:sdb');
 assert.equal(cinematicShots(snapshots[1]).find(s=>s.open)?.open,'disk:sda');
});
test('shots cut through black and the shake is bounded',()=>{
 assert.equal(cutFade(0,6),1);assert.equal(cutFade(3,6),0);assert.equal(cutFade(6,6),1);
 for(let t=0;t<30;t+=.013)for(const n of shakeNoise(t))assert.ok(Math.abs(n)<=1);
});
test('lightning appears only under heavy load',()=>{
 assert.equal(stormLevel(.2),0);assert.equal(stormLevel(.35),0);assert.equal(stormLevel(.75),1);
 assert.ok(stormLevel(.53)>0&&stormLevel(.53)<1);
 assert.equal(heatLevel(75),0);assert.equal(heatLevel(null),0);assert.ok(heatLevel(80)>=.4);assert.ok(heatLevel(85)>.85);assert.equal(heatLevel(95),1);
});

type Box=[number,number,number,number,number,number];
function obstacles(s:Snapshot|null):Box[]{
 const boxes:Box[]=[
  [-2.1,0,-1,1.45,-2.2,0],      // CPU cooler
  [1.75,3.65,-1,1.15,-2.8,.65], // RAM slots and sticks
  [-3.7,-.3,-1,1.3,-6.7,-4.5],  // PSU
  [-5.1,-4.2,-1,.85,-1.6,-.7],  // network port
  [-5.5,5.5,-1,.6,-4.4,4.4],    // board with all low parts
 ];
 (s?.disks??[]).forEach((_,i)=>boxes.push([4.5,7.5,-1,.75,1+i*3.9-1.8,1+i*3.9+1.8]));
 const n=s?.docker.length??0,cols=n<=15?5:n<=24?6:n<=40?8:10,rows=Math.max(1,Math.ceil(n/cols)),w=cols*.9+.5,d=rows*.72+.5;
 boxes.push([-1-w/2,-1+w/2,-1,1.05,4.75,4.75+d]);
 return boxes;
}
test('the camera never enters a component (with 35 cm to spare)',()=>{
 for(const s of snapshots)for(const shot of cinematicShots(s))for(let t=0;t<=shot.duration;t+=.05){
  const [x,y,z]=shotPose(shot,t).position;
  for(const [x0,x1,y0,y1,z0,z1] of obstacles(s)){
   const m=.35,inside=x>x0-m&&x<x1+m&&y>y0-m&&y<y1+m&&z>z0-m&&z<z1+m;
   assert.ok(!inside,`${shot.title} at ${t.toFixed(2)} s: camera at ${[x,y,z].map(v=>v.toFixed(2))} inside [${[x0,x1,y0,y1,z0,z1]}]`);
  }
 }
});
test('only processor shots shake',()=>{
 for(const s of snapshots)for(const shot of cinematicShots(s))if(!shot.title.startsWith('Processor'))assert.equal(shot.shake,0,shot.title);
});
