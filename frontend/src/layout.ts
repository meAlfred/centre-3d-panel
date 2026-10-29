/** Shared placement of the storage bays and the container dock. Pure: no three.js. */
export type XYZ=[number,number,number];

/** Drive bays: three per column, extra columns grow away from the board. */
export const DISKS_PER_COLUMN=3;
export const diskPosition=(index:number):XYZ=>[6+Math.floor(index/DISKS_PER_COLUMN)*3.4,0,1+(index%DISKS_PER_COLUMN)*3.9];
/** Rightmost scene X used by the drives, for framing. */
export const disksRight=(count:number)=>7.5+Math.max(0,Math.ceil(count/DISKS_PER_COLUMN)-1)*3.4;

type SlotLike={index:number;populated:boolean|null};
/** The board has four DIMM sockets. Map the real slot list onto them; when the
 *  layout is unknown, show two ghost modules instead of an empty board. */
export function ramSticks(slots:SlotLike[],known:boolean,totalMb:number|null|undefined):{socket:number;ghost:boolean}[]{
 if(!known||!slots.length)return totalMb?[{socket:0,ghost:true},{socket:2,ghost:true}]:[];
 const used=slots.filter(slot=>slot.populated);
 if(slots.length<=4)return used.map(slot=>({socket:slot.index,ghost:false}));
 return used.slice(0,4).map((_,i)=>({socket:i,ghost:false}));
}
export const ramX=(socket:number)=>2+socket*.48;

/** NAND packages on the SSD board, local [x,z] inside a drive bay. */
export const SSD_NAND:[number,number][]=[[-.42,-.47],[.42,-.47],[-.42,.26],[.42,.26]];

/** Edge of the dock nearest to the motherboard. */
const DOCK_FRONT=4.75,STEP_X=.9,STEP_Z=.72;

/** The dock widens before it grows away from the board, so 30 containers stay in frame. */
export function dockerLayout(count:number){
 const cols=count<=15?5:count<=24?6:count<=40?8:10;
 const rows=Math.max(1,Math.ceil(count/cols));
 const width=cols*STEP_X+.5,depth=rows*STEP_Z+.5;
 const centre:XYZ=[-1,0,DOCK_FRONT+depth/2];
 const slot=(index:number):[number,number]=>[(index%cols-(cols-1)/2)*STEP_X,(Math.floor(index/cols)-(rows-1)/2)*STEP_Z];
 return {cols,rows,width,depth,centre,slot};
}

/** Container height follows its RAM; an idle container is still a visible box. */
export const containerHeight=(memMb:number|null|undefined)=>.22+Math.min(1,Math.max(0,memMb??0)/600)*.7;
