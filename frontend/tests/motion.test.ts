import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smoothInput,focusEase,pointerPosition} from '../src/motion.ts';
import {watchContext} from '../src/contextRecovery.ts';
test('parallax clamps jumps, rejects invalid readings and ignores sensor noise',()=>{
 assert.equal(smoothInput(0,.02,1/60),0);assert.equal(smoothInput(0,NaN,1/60),0);
 assert.ok(Math.abs(smoothInput(0,100,1/60))<=1.8/60);
 assert.ok(Math.abs(smoothInput(.4,-1,1/60)-.4)<=1.8/60+.000001);
 let value=0;for(let i=0;i<240;i++)value=smoothInput(value,1,1/60);assert.ok(value>.99&&value<=1);
});
test('parallax converges consistently at 30 and 120 fps',()=>{
 function simulate(fps:number){let x=0;for(let i=0;i<fps*2;i++)x=smoothInput(x,.4,1/fps);return x}
 assert.ok(Math.abs(simulate(30)-simulate(120))<.002);
});
test('pointer uses the scene rectangle regardless of HTML event target',()=>{
 assert.deepEqual(pointerPosition(550,350,{left:50,top:100,width:1000,height:500}),{x:0,y:0});
 assert.deepEqual(pointerPosition(-100,1000,{left:50,top:100,width:1000,height:500}),{x:-1,y:-1});
});
test('focus easing has continuous endpoints and never overshoots',()=>{
 assert.equal(focusEase(0),0);assert.equal(focusEase(1),1);
 let last=0;for(let i=1;i<=100;i++){const next=focusEase(i/100);assert.ok(next>=last&&next<=1);last=next}
 assert.ok(focusEase(.001)<1e-7);assert.ok(1-focusEase(.999)<1e-7);
});
test('context can recover without falling back to 2D',async()=>{
 const canvas=new EventTarget(),calls:string[]=[];
 const stop=watchContext(canvas,{lost:()=>calls.push('lost'),restored:()=>calls.push('restored'),failed:()=>calls.push('failed')},15);
 const event=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 canvas.dispatchEvent(new Event('webglcontextrestored'));
 await new Promise(r=>setTimeout(r,25));stop();assert.deepEqual(calls,['lost','restored']);
});
test('unmount removes old listeners and cancels pending fallback',async()=>{
 const canvas=new EventTarget(),calls:string[]=[];
 const stop=watchContext(canvas,{lost:()=>calls.push('lost'),restored:()=>calls.push('restored'),failed:()=>calls.push('failed')},15);
 canvas.dispatchEvent(new Event('webglcontextlost'));stop();
 canvas.dispatchEvent(new Event('webglcontextlost'));canvas.dispatchEvent(new Event('webglcontextrestored'));
 await new Promise(r=>setTimeout(r,25));assert.deepEqual(calls,['lost']);
});
test('unrecoverable loss falls back once, duplicate loss events are ignored',async()=>{
 const canvas=new EventTarget(),calls:string[]=[];
 const stop=watchContext(canvas,{lost:()=>calls.push('lost'),restored:()=>calls.push('restored'),failed:()=>calls.push('failed')},10);
 canvas.dispatchEvent(new Event('webglcontextlost'));canvas.dispatchEvent(new Event('webglcontextlost'));
 await new Promise(r=>setTimeout(r,20));stop();assert.deepEqual(calls,['lost','failed']);
});
