export type GyroStatus='off'|'waiting'|'on'|'insecure'|'denied'|'unavailable';
export const gyroVector={x:0,y:0};
let dispose:(()=>void)|null=null;
export function stopGyroscope(){dispose?.();dispose=null;gyroVector.x=gyroVector.y=0}
export async function startGyroscope(report:(status:GyroStatus)=>void){
 stopGyroscope();
 if(!window.isSecureContext){report('insecure');return}
 if(typeof DeviceOrientationEvent==='undefined'){report('unavailable');return}
 const Orientation=DeviceOrientationEvent as typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};
 try{if(Orientation.requestPermission&&await Orientation.requestPermission()!=='granted'){report('denied');return}}catch{report('denied');return}
 report('waiting');let baseline:{beta:number;gamma:number;angle:number}|null=null,seen=false;
 const timer=window.setTimeout(()=>{if(!seen){stopGyroscope();report('unavailable')}},4000);
 const handler=(event:DeviceOrientationEvent)=>{
  if(event.beta==null||event.gamma==null||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
  const angle=screen.orientation?.angle??0;
  if(!baseline||baseline.angle!==angle)baseline={beta:event.beta,gamma:event.gamma,angle};
  const dx=((event.gamma-baseline.gamma+540)%360-180)/24,dy=((event.beta-baseline.beta+540)%360-180)/24;
  const radians=angle*Math.PI/180;
  gyroVector.x=Math.max(-1,Math.min(1,dx*Math.cos(radians)+dy*Math.sin(radians)));
  gyroVector.y=Math.max(-1,Math.min(1,dy*Math.cos(radians)-dx*Math.sin(radians)));
  if(!seen){seen=true;window.clearTimeout(timer);report('on')}
 };
 const visibility=()=>{if(document.hidden){stopGyroscope();report('off')}};
 window.addEventListener('deviceorientation',handler,{passive:true});
 document.addEventListener('visibilitychange',visibility);
 dispose=()=>{window.clearTimeout(timer);window.removeEventListener('deviceorientation',handler);document.removeEventListener('visibilitychange',visibility)};
}
export const gyroMessages:Record<GyroStatus,string>={off:'Enable gyroscope',waiting:'Waiting for sensors…',on:'Gyroscope on · turn off',insecure:'Motion sensors need HTTPS. Open the dashboard through an HTTPS address.',denied:'Motion access is blocked in the browser settings.',unavailable:'No sensor data arrived. Try Chrome or Safari.'};
