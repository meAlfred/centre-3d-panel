/** Rotor speed for the 3D cooler. A real RPM reading always wins; without one the
 *  speed is an explicit estimate from the CPU temperature, never written to telemetry. */
export type FanDrive={speed:number;estimated:boolean;percent:number|null};
const MAX_SPEED=24;
export function fanDrive(rpm:number|null|undefined,tempC:number|null|undefined):FanDrive{
 if(rpm!=null&&Number.isFinite(rpm)){
  const speed=Math.min(MAX_SPEED,Math.max(0,rpm)/60*Math.PI*2*.18);
  return {speed,estimated:false,percent:Math.round(speed/MAX_SPEED*100)};
 }
 if(tempC==null||!Number.isFinite(tempC))return {speed:7,estimated:true,percent:null};
 // 35 °C and below: slow idle. 85 °C and above: full speed.
 const level=Math.min(1,Math.max(0,(tempC-35)/50));
 const speed=3.5+level*(MAX_SPEED-3.5);
 return {speed,estimated:true,percent:Math.round(speed/MAX_SPEED*100)};
}
