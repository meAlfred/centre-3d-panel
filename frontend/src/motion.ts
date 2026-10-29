/** Frame-rate independent, bounded filtering for mouse and orientation sensors. */
export function smoothInput(current:number,target:number,dt:number){
 const time=Math.min(.05,Math.max(0,dt));
 const safe=Number.isFinite(target)?Math.max(-1,Math.min(1,target)):0;
 const quiet=Math.abs(safe)<.025?0:Math.sign(safe)*(Math.abs(safe)-.025)/.975;
 const step=(quiet-current)*(1-Math.exp(-time*6));
 return current+Math.max(-time*1.8,Math.min(time*1.8,step));
}
export function focusEase(t:number){const x=Math.max(0,Math.min(1,t));return x*x*x*(x*(x*6-15)+10)}
export function pointerPosition(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}){
 return {x:Math.max(-1,Math.min(1,(clientX-rect.left)/Math.max(1,rect.width)*2-1)),y:Math.max(-1,Math.min(1,1-(clientY-rect.top)/Math.max(1,rect.height)*2))};
}
