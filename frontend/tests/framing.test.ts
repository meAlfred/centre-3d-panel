import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {Vector3} from 'three';
import {cameraFrame,componentPose,focusScreenX,RAM_LIFT} from '../src/framing.ts';
import {activateLabel,isCanvasBackground} from '../src/interaction.ts';
import type {Focus,Snapshot} from '../src/types.ts';
const snapshot={memory:{slots:[{index:0,populated:true},{index:1,populated:false},{index:2,populated:true}],slots_status:'ok',total_mb:16384},disks:[{id:'sda',bay:0},{id:null,bay:1}]} as Snapshot;
test('every component projects beside its panel on desktop and to centre on mobile',()=>{
 for(const [width,height] of [[1440,900],[820,650],[390,260],[340,190]])for(const focus of ['cpu','memory','network','power','docker','container:abc','disk:sda','bay:1'] as Focus[]){
  const frame=cameraFrame(focus,snapshot,width,height),camera=new PerspectiveCamera(frame.fov,width/height,.025,100);
  camera.position.copy(frame.position);camera.lookAt(frame.lookAt);camera.updateMatrixWorld(true);
  const point=frame.target.clone().project(camera);
  assert.ok(Math.abs(point.x-focusScreenX(width))<1e-8,`${focus}: incorrect X framing`);
  assert.ok(Math.abs(point.y)<1e-8,`${focus}: incorrect Y framing`);
  assert.ok(point.z>-1&&point.z<1,`${focus}: outside clipping planes`);
 }
});
test('RAM focus follows populated physical slots and their small shared lift',()=>{
 const pose=componentPose('memory',snapshot);
 assert.equal(pose.target[0],2.48);assert.equal(pose.target[1],.78+RAM_LIFT);
 assert.equal(pose.target[2],-1.1);
});
test('portrait overview keeps motherboard, SSD and PSU exhaust inside the viewport',()=>{
 for(const [width,height] of [[390,650],[390,750],[340,680]]){
  const f=cameraFrame(null,snapshot,width,height),camera=new PerspectiveCamera(f.fov,width/height,.025,180);
  camera.position.copy(f.position);camera.lookAt(f.lookAt);camera.updateMatrixWorld();
  for(const x of [-5.6,7.5])for(const y of [-.3,2])for(const z of [-10.5,7.8]){
   const p=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.91);assert.ok(Math.abs(p.y)<.71);assert.ok(p.z<1);
  }
 }
});
test('HTML component labels stop bubbling before focus changes',()=>{
 const calls:string[]=[];activateLabel({stopPropagation(){calls.push('stop')}},'network',f=>calls.push(String(f)));
 assert.deepEqual(calls,['stop','network']);
 assert.equal(isCanvasBackground({tagName:'BUTTON'} as unknown as EventTarget),false);
 assert.equal(isCanvasBackground({tagName:'svg'} as unknown as EventTarget),false);
 assert.equal(isCanvasBackground({tagName:'CANVAS'} as unknown as EventTarget),true);
});

test('narrow desktop canvas retains the right-hand panel reservation',()=>{
 const width=738,height=650,f=cameraFrame('cpu',snapshot,width,height,true);
 const camera=new PerspectiveCamera(f.fov,width/height,.025,180);
 camera.position.copy(f.position);camera.lookAt(f.lookAt);camera.updateMatrixWorld();
 const point=f.target.clone().project(camera);
 assert.ok(Math.abs(point.x-focusScreenX(width,true))<1e-8);
 const screenX=(point.x+1)*width/2,panelLeft=width-Math.min(360,width*.32)-24;
 assert.ok(Math.abs(screenX-panelLeft/2)<1e-8);
});
