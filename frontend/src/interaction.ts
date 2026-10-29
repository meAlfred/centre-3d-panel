import type {Focus} from './types';

// HTML labels share the Canvas event parent. Stop both phases so a DOM click
// cannot subsequently become a raycast miss and immediately clear the focus.
export function activateLabel(event:{stopPropagation:()=>void},focus:Focus,select:(focus:Focus)=>void){
 event.stopPropagation();select(focus);
}
export function isCanvasBackground(target:EventTarget|null){
 return (target as {tagName?:string}|null)?.tagName==='CANVAS';
}
