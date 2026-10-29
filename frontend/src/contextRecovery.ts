/** Own listeners and timeout together, so an old canvas cannot affect a new one. */
export function watchContext(canvas:EventTarget,callbacks:{lost:()=>void;restored:()=>void;failed:()=>void},timeoutMs=8000){
 let active=true,lost=false,timer:ReturnType<typeof setTimeout>|undefined;
 const onLost=(e:Event)=>{
  if(!active)return;e.preventDefault();if(lost)return;lost=true;callbacks.lost();
  timer=setTimeout(()=>{if(active&&lost)callbacks.failed()},timeoutMs);
 };
 const onRestored=()=>{if(!active||!lost)return;lost=false;clearTimeout(timer);callbacks.restored()};
 canvas.addEventListener('webglcontextlost',onLost);canvas.addEventListener('webglcontextrestored',onRestored);
 return ()=>{active=false;clearTimeout(timer);canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored)};
}
