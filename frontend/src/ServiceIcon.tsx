import {serviceIdentity} from './services';
export function ServiceIcon({name,size=22}:{name:string|null;size?:number}){
 const service=serviceIdentity(name);
 return <span className="service-icon" title={service.label}><img src={service.icon} width={size} height={size} alt=""/></span>;
}
