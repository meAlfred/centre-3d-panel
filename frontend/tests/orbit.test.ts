import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OverviewOrbit} from '../src/orbit.ts';
import {portAccess} from '../src/containerPorts.ts';
import type {ContainerPort} from '../src/types.ts';
test('drag is held for four seconds then smoothly returns',()=>{
 const o=new OverviewOrbit();o.start(1,0,0,0,false);o.move(1,180,50,800,500,100,false);o.end(1,200);
 const yaw=o.yaw;o.tick(4199,1/60,false);assert.equal(o.yaw,yaw);
 o.tick(4201,1/60,false);assert.ok(Math.abs(o.yaw)<Math.abs(yaw)&&Math.abs(o.yaw)>0);
 for(let i=0;i<180;i++)o.tick(4300+i*1000/60,1/60,false);assert.equal(o.yaw,0);assert.equal(o.pitch,0);
});
test('focusing a component cancels drag and return without changing component state',()=>{
 const o=new OverviewOrbit();o.start(1,0,0,0,false);o.move(1,100,20,800,500,100,false);
 o.tick(5000,1/60,true);assert.equal(o.yaw,0);assert.equal(o.pointer,null);
 assert.equal(o.start(2,0,0,6000,true),false);
 assert.equal(o.move(1,900,900,800,500,6500,true),false);
 o.tick(9000,1/60,false);assert.equal(o.yaw,0);
});
test('tap does not rotate; second pointer cannot take control; held drag does not time out',()=>{
 const o=new OverviewOrbit();assert.ok(o.start(1,0,0,0,false));assert.equal(o.start(2,0,0,0,false),false);
 assert.equal(o.move(1,2,2,800,500,20,false),false);assert.equal(o.end(1,30),false);
 o.start(1,0,0,50,false);o.move(1,100,100,800,500,100,false);const yaw=o.yaw;
 o.tick(10000,1/60,false);assert.equal(o.yaw,yaw);
});
const port:ContainerPort={container_port:80,host_port:8080,host_ip:'0.0.0.0',protocol:'tcp'};
test('container links use the published port on the server, including IPv6 and HTTPS',()=>{
 assert.equal(portAccess(port,'centre.example.ts.net').urls[0].href,'http://centre.example.ts.net:8080/');
 assert.equal(portAccess({...port,host_ip:'fd7a:115c:a1e0::1',container_port:443},'unused').urls[0].href,'https://[fd7a:115c:a1e0::1]:8080/');
});
test('unpublished, loopback, UDP and database ports never become website links',()=>{
 for(const value of [{...port,host_port:null},{...port,host_ip:'127.0.0.1'},{...port,host_ip:'::1'},{...port,host_ip:'::ffff:7f00:1'},{...port,protocol:'udp' as const},{...port,container_port:5432},{...port,host_port:70000}])assert.deepEqual(portAccess(value,'centre').urls,[]);
 assert.deepEqual(portAccess(port,'user@evil.example').urls,[]);
});
