import {useEffect} from 'react';
import {mockMode,useStore} from './store';
import type {Snapshot} from './types';
export function useConnection(){useEffect(()=>{
 let source:EventSource|null=null,timer:ReturnType<typeof setInterval>|undefined,heartbeatAbort:AbortController|null=null,sequence=0,disposed=false,epoch=0,viewer:string|null=null;
 const accept=(s:Snapshot)=>{if(!s||s.schema_version!=='1.0'||!s.sources?.host||!s.cpu||!Array.isArray(s.disks)||(!mockMode&&s.mock))throw Error('Invalid API contract');useStore.getState().receive(s)};
 const stop=()=>{
  epoch++;source?.close();source=null;heartbeatAbort?.abort();if(timer)clearInterval(timer);timer=undefined;
  if(viewer){const url=`/api/viewer/${viewer}/leave`;if(!navigator.sendBeacon?.(url))void fetch(url,{method:'POST',keepalive:true}).catch(()=>{});viewer=null}
 };
 const start=async()=>{
  stop();if(document.hidden||disposed)return;
  const current=epoch,isCurrent=()=>!disposed&&!document.hidden&&current===epoch;
  if(mockMode){const {mockSnapshot}=await import('./mock');if(!isCurrent())return;accept(mockSnapshot(++sequence));timer=setInterval(()=>{if(isCurrent())accept(mockSnapshot(++sequence))},2000);return}
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');viewer=id;
  source=new EventSource(`/api/stream?viewer=${id}`);
  const beat=async()=>{
   if(!isCurrent()||heartbeatAbort)return;
   const controller=new AbortController();heartbeatAbort=controller;
   const timeout=setTimeout(()=>controller.abort(),5000);
   try{const response=await fetch(`/api/viewer/${id}/heartbeat`,{method:'POST',signal:controller.signal});if(response.status===409&&isCurrent())void start()}
   catch{/* The lease expires by itself if connectivity disappears. */}
   finally{clearTimeout(timeout);if(heartbeatAbort===controller)heartbeatAbort=null}
  };
  source.onopen=()=>{if(isCurrent()){if(timer)clearInterval(timer);timer=setInterval(()=>void beat(),12000)}};
  source.addEventListener('metrics',e=>{if(!isCurrent())return;try{accept(JSON.parse((e as MessageEvent).data))}catch{useStore.getState().setConnected(false)}});
  source.addEventListener('status',e=>{if(!isCurrent())return;try{const v=JSON.parse((e as MessageEvent).data);if(v.sources?.host?.status!=='ok')useStore.getState().setConnected(false)}catch{useStore.getState().setConnected(false)}});
  source.onerror=()=>{if(isCurrent())useStore.getState().setConnected(false)};
  // SSE supplies the first fresh snapshot; no duplicate polling request.
 };
 const visibility=()=>{useStore.getState().setVisible(!document.hidden);if(document.hidden){stop();useStore.getState().setConnected(false)}else void start()};
 const hide=()=>{useStore.getState().setVisible(false);stop();useStore.getState().setConnected(false)};
 const show=()=>{if(!document.hidden){useStore.getState().setVisible(true);void start()}};
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);void start();
 return()=>{disposed=true;stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show)};
},[])}
