import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gyroVector,startGyroscope,stopGyroscope} from '../src/gyro.ts';
test('gyroscope requires HTTPS and confirms real sensor events before success',async()=>{
 const w=Object.assign(new EventTarget(),{isSecureContext:false,setTimeout,clearTimeout});
 Object.assign(globalThis,{window:w,document:Object.assign(new EventTarget(),{hidden:false}),screen:{orientation:{angle:0}},DeviceOrientationEvent:class {static requestPermission(){return Promise.resolve('granted')}}});
 const status:string[]=[];
 await startGyroscope(s=>status.push(s));assert.deepEqual(status,['insecure']);
 w.isSecureContext=true;status.length=0;await startGyroscope(s=>status.push(s));assert.deepEqual(status,['waiting']);
 const event=(beta:number,gamma:number)=>Object.assign(new Event('deviceorientation'),{beta,gamma});
 w.dispatchEvent(event(60,3));assert.deepEqual(status,['waiting','on']);assert.deepEqual(gyroVector,{x:0,y:0});
 w.dispatchEvent(event(72,15));assert.equal(gyroVector.x,.5);assert.equal(gyroVector.y,.5);
 stopGyroscope();assert.deepEqual(gyroVector,{x:0,y:0});w.dispatchEvent(event(80,20));assert.deepEqual(gyroVector,{x:0,y:0});
});
