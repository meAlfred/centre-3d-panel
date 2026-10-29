import {test} from 'node:test';
import assert from 'node:assert/strict';
import {containerHeight,dockerLayout} from '../src/layout.ts';
import {fanDrive} from '../src/cooling.ts';
test('container dock keeps every container on its deck and clear of the motherboard',()=>{
 for(const count of [0,1,6,15,16,29,40,41,60]){
  const dock=dockerLayout(count);
  assert.ok(dock.cols*dock.rows>=count);
  assert.ok(dock.centre[2]-dock.depth/2>=4.7,'dock overlaps the board');
  const seen=new Set<string>();
  for(let i=0;i<count;i++){
   const [x,z]=dock.slot(i);
   assert.ok(Math.abs(x)+.4<=dock.width/2&&Math.abs(z)+.3<=dock.depth/2,`container ${i} of ${count} is off the deck`);
   seen.add(`${x.toFixed(3)}:${z.toFixed(3)}`);
  }
  assert.equal(seen.size,count);
 }
 assert.ok(dockerLayout(29).rows<=4);
});
test('container height is bounded and never zero',()=>{
 assert.ok(containerHeight(null)>0);assert.ok(containerHeight(0)>0);
 assert.equal(containerHeight(600),containerHeight(100000));
});
test('cooler: measured RPM wins, otherwise speed rises with CPU temperature',()=>{
 assert.equal(fanDrive(0,90).speed,0);assert.equal(fanDrive(0,90).estimated,false);
 assert.equal(fanDrive(1200,30).estimated,false);
 const cold=fanDrive(null,30),warm=fanDrive(null,60),hot=fanDrive(null,95);
 assert.ok(cold.estimated&&warm.estimated&&hot.estimated);
 assert.ok(cold.speed>0&&cold.speed<warm.speed&&warm.speed<hot.speed);
 assert.equal(hot.speed,fanDrive(null,200).speed);
 assert.equal(fanDrive(null,null).percent,null);
 assert.ok(Number.isFinite(fanDrive(undefined,Number.NaN).speed));
});

test('drives wrap into extra columns instead of running off the scene',async()=>{
 const {diskPosition,disksRight}=await import('../src/layout.ts');
 assert.deepEqual(diskPosition(0),[6,0,1]);
 assert.equal(diskPosition(3)[0],diskPosition(0)[0]+3.4);
 assert.equal(diskPosition(3)[2],diskPosition(0)[2]);
 assert.ok(disksRight(6)>disksRight(3));
});

test('RAM modules map onto the four sockets and fall back to placeholders',async()=>{
 const {ramSticks}=await import('../src/layout.ts');
 assert.deepEqual(ramSticks([{index:0,populated:true},{index:1,populated:false},{index:2,populated:true},{index:3,populated:false}],true,16384),[{socket:0,ghost:false},{socket:2,ghost:false}]);
 const eight=Array.from({length:8},(_,index)=>({index,populated:index%2===0}));
 assert.deepEqual(ramSticks(eight,true,65536).map(s=>s.socket),[0,1,2,3]);
 assert.deepEqual(ramSticks([],false,8192),[{socket:0,ghost:true},{socket:2,ghost:true}]);
 assert.deepEqual(ramSticks([],false,null),[]);
});
