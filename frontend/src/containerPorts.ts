import type {ContainerPort} from './types';
const NON_WEB=new Set([20,21,22,23,25,53,110,123,143,389,445,465,587,636,993,995,1433,1521,1883,2049,3306,5432,5672,6379,6881,853,27017]);
function hostName(raw:string){
 const value=raw.replace(/^\[|\]$/g,'');
 if(!value||/[\s/@?#%\\]/.test(value))return null;
 try{const url=new URL(`http://${value.includes(':')?'['+value+']':value}`);return url.hostname}catch{return null}
}
export function portAccess(port:ContainerPort,serverHost:string):{label:string;urls:{label:string;href:string}[]}{
 const published=port.host_port;
 if(published==null)return {label:'Docker network only',urls:[]};
 if(!Number.isInteger(published)||published<1||published>65535)return {label:'Invalid port',urls:[]};
 const ip=port.host_ip??'';
 if(/^127\./.test(ip)||/^::ffff:(127\.|7f[0-9a-f]{2}:)/i.test(ip)||['::1','0:0:0:0:0:0:0:1'].includes(ip))return {label:'Server only (localhost)',urls:[]};
 const host=hostName(['','0.0.0.0','::','0:0:0:0:0:0:0:0'].includes(ip)?serverHost:ip);
 if(!host)return {label:'Address unavailable',urls:[]};
 if(port.protocol!=='tcp'||NON_WEB.has(port.container_port))return {label:`${host}:${published} · ${port.protocol.toUpperCase()}`,urls:[]};
 const secure=[443,8443,9443].includes(port.container_port)||[443,8443,9443].includes(published);
 const schemes=secure?['https','http']:['http','https'];
 return {label:`${host}:${published}`,urls:schemes.map(scheme=>({label:scheme.toUpperCase(),href:`${scheme}://${host}:${published}/`}))};
}
