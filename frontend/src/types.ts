export type N = number | null;
export interface Source {status:'starting'|'ok'|'error'|'disabled'|'stale'; observed_at:N; age_s:N; error:string|null}
export interface Process {pid:number;name:string;cpu:N;mem_mb:N}
export interface PSI {some:{avg10:N;avg60:N;avg300:N;total_us:N};full:{avg10:N;avg60:N;avg300:N;total_us:N}}
export interface Slot {index:number;populated:boolean|null;size_mb:N;locator:string|null;type:string|null;speed_mts:N}
export interface Filesystem {device:string;source:string;mountpoint:string;type:string;size_gb:N;used_gb:N}
export interface Directory {path:string;size_gb:N}
export interface Disk {id:string|null;identity?:string;kind:'ssd'|'hdd'|'empty'|'unknown'|'unavailable';bay:number|null;model:string|null;size_gb:N;used_gb:N;temp_c:N;read_mbs:N;write_mbs:N;iops:N;filesystems?:Filesystem[];directories?:Directory[]|null;smart:{health:string|null;power_on_hours:N;wear_pct:N;tbw:N;temp_c?:N;status:string;age_s:N;observed_at:N;attributes?:{id:number;name:string;value:N;raw:N}[]}|null}
export interface Network {iface:string;rx_mbs:N;tx_mbs:N;link_mbps:N;link_up:boolean|null}
export interface ContainerPort {container_port:number;host_port:number|null;host_ip:string|null;protocol:'tcp'|'udp'|'sctp'}
export interface Container {ports?:ContainerPort[];id:string;name:string|null;state:string|null;cpu:N;mem_mb:N;uptime_s:N;health:string|null;error:string|null;rx_mbs?:N;tx_mbs?:N;network_mode?:string}
export interface Service {id:string;name:string;up:boolean|null;latency_ms:N;uptime_24h:N}
export interface Snapshot {service_host?:string|null;
 schema_version:string;ts:number;sequence:number;mock:boolean;
 host:{name:string|null;model?:string|null;os:string|null;uptime_s:N;load:N[]};
 cpu:{model:string|null;cores:N;threads:number;usage_total:N;per_core:N[];per_thread?:N[];freq_mhz:N;temp_c:N;temp_max_c:N;pressure_some_60s:N;pressure:PSI;top_processes:Process[]};
 memory:{total_mb:N;used_mb:N;cached_mb:N;available_mb:N;free_mb?:N;buffers_mb?:N;swap_total_mb:N;swap_used_mb:N;pressure_some_60s:N;pressure:PSI;slots:Slot[];slots_status:string;top_processes:Process[];inventory_source?:string;inventory_ts?:N};
 disks:Disk[];network:Network[];fans:{name:string;rpm:N}[];docker:Container[];services:Service[];sources:Record<string,Source>;warnings:string[];capabilities:Record<string,boolean>;filesystems?:Filesystem[];temperatures?:{name:string;label:string;temp_c:N;max_c:N}[];
 directories?:{items:Directory[];observed_at:N;errors:string[]}|null;
 raids?:{name:string;level:string;state:string;degraded:N;sync_action:string;sync_pct:N;members:string[]}[];
 igpu?:{busy_pct:N;engines:{name:string;busy_pct:N}[]}|null;
}
export type Focus = 'cpu'|'memory'|'network'|'docker'|'power'|`disk:${string}`|`bay:${number}`|`container:${string}`|null;
export interface HistoryPoint {ts:number;cpu:N;temp:N;memory:N;rx:N;tx:N;disks:Record<string,{read:N;write:N;iops:N}>;docker:Record<string,{cpu:N;memory:N}>}
