import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failed,historyPoint,mainNetwork,overall,pct,sourceFresh,validFocus} from '../src/metrics.ts';
import type {Snapshot,Container} from '../src/types.ts';

const container=(patch:Partial<Container>={}):Container=>({id:'test',name:'docmost',state:'running',cpu:1,mem_mb:200,health:null,uptime_s:100,error:null,...patch});
function snapshot():Snapshot {return {ts:Date.now()/1000,cpu:{usage_total:3,temp_c:36,temp_max_c:100},memory:{used_mb:2000,total_mb:16000,pressure_some_60s:0},docker:[container()],disks:[],services:[],network:[{iface:'docker0',rx_mbs:10,tx_mbs:10},{iface:'eno1',rx_mbs:1,tx_mbs:2},{iface:'tailscale0',rx_mbs:.1,tx_mbs:.1}],sources:{host:{status:'ok',observed_at:Date.now()/1000},docker:{status:'ok',observed_at:Date.now()/1000}}} as Snapshot}
test('unknown values stay unknown; zero is a real reading',()=>{assert.equal(pct(null,100),null);assert.equal(pct(0,100),0);assert.equal(pct(25,100),25);assert.equal(pct(10,0),null)});
test('physical interface excludes bridge double counting',()=>{assert.equal(mainNetwork(snapshot())?.iface,'eno1')});
test('hash rejects invalid escapes and unrelated paths',()=>{assert.equal(validFocus('#cpu'),'cpu');assert.equal(validFocus('#disk%3Asda'),'disk:sda');assert.equal(validFocus('#%zz'),null);assert.equal(validFocus('#../../etc/passwd'),null)});
test('restarting and unhealthy containers are visible in overall status',()=>{const s=snapshot();s.docker=[container({state:'restarting'})];assert.equal(failed(s.docker[0]),true);assert.equal(overall(s,true).tone,'critical');s.docker=[container({health:'unhealthy'})];assert.equal(overall(s,true).tone,'critical')});
test('disconnect overrides cached healthy data',()=>{assert.equal(overall(snapshot(),false).tone,'unknown');const s=snapshot();s.sources.docker.observed_at=s.ts-20;assert.equal(sourceFresh(s,'docker'),false)});
test('stale Docker values create history gaps, not fresh flat lines',()=>{const s=snapshot();s.sources.docker.status='error';const point=historyPoint(s);assert.equal(point.docker.test.cpu,null);assert.equal(point.docker.test.memory,null);assert.equal(point.cpu,3)});
