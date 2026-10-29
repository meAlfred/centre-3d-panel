import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {advanceFlow,advanceLift} from '../src/flow.ts';
import {cameraFrame} from '../src/framing.ts';
const circularDistance=(a:number,b:number)=>Math.abs(((a-b+1.5)%1)-.5);
test('telemetry changes cannot teleport a long-running packet',()=>{
 const state={phase:.91,load:.01,step:0};for(let i=0;i<36000;i++)advanceFlow(state,.01,1/60);
 const before=state.phase;advanceFlow(state,1,0);assert.equal(state.phase,before);
 advanceFlow(state,1,1/60);assert.ok(circularDistance(before,state.phase)<.034);assert.ok(state.load<.2);
});
test('phase is bounded, reverse wraps continuously, reduced motion freezes position',()=>{
 const f={phase:.001,load:1,step:0};advanceFlow(f,1,1/60,true,true);assert.ok(f.phase>.96&&f.phase<1);
 const before=f.phase;advanceFlow(f,0,1/60,false);assert.equal(f.phase,before);
 for(let i=0;i<20000;i++)advanceFlow(f,i%2,1/30);assert.ok(f.phase>=0&&f.phase<1);
});
test('flow remains close at 30 and 120 FPS through changing load',()=>{
 function simulate(fps:number){const s={phase:0,load:0,step:0};for(let i=0;i<fps*6;i++)advanceFlow(s,i<fps*2?0:i<fps*4?1:.2,1/fps);return s}
 assert.ok(circularDistance(simulate(30).phase,simulate(120).phase)<.01);
});
test('cooler rises, reverses without teleporting, and settles back into the socket',()=>{
 const s={value:0,velocity:0};for(let i=0;i<42;i++)advanceLift(s,true,1/60);assert.ok(s.value>.995);
 const before=s.value;advanceLift(s,false,1/60);assert.ok(Math.abs(s.value-before)<.05);
 for(let i=0;i<100;i++){advanceLift(s,i<30&&i%10<5,1/60);assert.ok(s.value>=0&&s.value<=1)}
 for(let i=0;i<60;i++)advanceLift(s,false,1/60);assert.ok(s.value<.0001);
 advanceLift(s,true,1/60,true);assert.equal(s.value,1);
});
test('CPU socket and raised fan fit beside desktop details and in the mobile viewport',()=>{
 for(const [width,height] of [[1440,900],[820,650],[390,260],[340,190]]){
  const f=cameraFrame('cpu',null,width,height),cam=new PerspectiveCamera(f.fov,width/height,.025,180);
  cam.position.copy(f.position);cam.lookAt(f.lookAt);cam.updateMatrixWorld();
  const rightEdge=width>800?1-2*(Math.min(360,width*.32)+24)/width:1;
  for(const x of [-2.12,.12])for(const y of [.05,3.2])for(const z of [-2.22,.02]){
   const p=new Vector3(x,y,z).project(cam);assert.ok(p.x>-.98&&p.x<rightEdge,`${width}: horizontal clipping`);assert.ok(Math.abs(p.y)<.98,`${width}: vertical clipping`);
  }
 }
});
