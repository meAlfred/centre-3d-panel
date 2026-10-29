/** Load 0..1 at which energy pulses turn into lightning: first arcs at 35 %, full storm at 75 %. */
export const stormLevel=(load:number)=>{const x=Math.max(0,Math.min(1,(load-.35)/.4));return x*x*(3-2*x)};
/** A hot CPU sparks too: clearly visible from 80 °C, full storm at 86 °C. */
export const heatLevel=(temp:number|null|undefined)=>temp==null||!Number.isFinite(temp)?0:Math.max(0,Math.min(1,(temp-76)/10));
