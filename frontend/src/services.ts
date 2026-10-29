// Match infrastructure before the enclosing app name (docmost-redis != docmost).
// These are name-based visual hints, not service discovery or health claims.
export function serviceIdentity(name:string|null){
 const n=(name??'').toLowerCase();
 const rules:[RegExp,string,string][]=[
  [/redis/,'redis','Redis'],[/postgres|docmost[-_]db/,'postgresql','PostgreSQL'],
  [/adguard/,'adguard','AdGuard'],[/uptime[-_]?kuma/,'uptimekuma','Uptime Kuma'],
  [/docmost/,'docmost','Docmost'],[/dockge/,'dockge','Dockge'],[/convertx/,'convertx','ConvertX'],
  [/telegram|(?:^|[-_])bot(?:[-_]|$)/,'telegram','Bot'],[/cobalt/,'cobalt','Cobalt'],
  [/nginx/,'nginx','nginx'],[/docker[-_]proxy/,'docker','Docker proxy'],[/centre/,'centre','centre'],
 ];
 const match=rules.find(([pattern])=>pattern.test(n));
 return {icon:`/icons/${match?.[1]??'generic'}.svg`,label:match?.[2]??'Container'};
}
