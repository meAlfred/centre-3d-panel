/** Overview-only drag state. No timers can outlive or change a component focus. */
export class OverviewOrbit {
 yaw=0;pitch=0;pointer:number|null=null;dragged=false;lastInput=0;
 private origin={x:0,y:0,yaw:0,pitch:0};
 reset(){this.yaw=0;this.pitch=0;this.pointer=null;this.dragged=false;this.lastInput=0}
 start(pointer:number,x:number,y:number,now:number,focused:boolean){
  if(focused||this.pointer!==null)return false;
  this.pointer=pointer;this.dragged=false;this.lastInput=now;this.origin={x,y,yaw:this.yaw,pitch:this.pitch};return true;
 }
 move(pointer:number,x:number,y:number,width:number,height:number,now:number,focused:boolean){
  if(focused){this.reset();return false}if(this.pointer!==pointer)return false;
  const dx=x-this.origin.x,dy=y-this.origin.y;
  if(!this.dragged&&Math.hypot(dx,dy)<6)return false;
  this.dragged=true;this.lastInput=now;
  this.yaw=Math.max(-1.05,Math.min(1.05,this.origin.yaw-dx/Math.max(200,width)*2.4));
  this.pitch=Math.max(-.32,Math.min(.38,this.origin.pitch-dy/Math.max(180,height)*1.1));return true;
 }
 end(pointer:number,now:number){if(this.pointer!==pointer)return false;this.pointer=null;this.lastInput=now;return this.dragged}
 tick(now:number,dt:number,focused:boolean,reduced=false){
  if(focused){this.reset();return}
  if(this.pointer!==null||now-this.lastInput<4000)return;
  const factor=reduced?0:Math.exp(-Math.min(.05,Math.max(0,dt))*5);
  this.yaw*=factor;this.pitch*=factor;
  if(Math.abs(this.yaw)<.0001)this.yaw=0;if(Math.abs(this.pitch)<.0001)this.pitch=0;
 }
}
