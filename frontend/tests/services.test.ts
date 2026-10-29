import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {serviceIdentity} from '../src/services.ts';

test('infrastructure names take precedence over the parent application',()=>{
 assert.equal(serviceIdentity('docmost-redis-1').label,'Redis');
 assert.equal(serviceIdentity('docmost-db-1').label,'PostgreSQL');
 assert.equal(serviceIdentity('docmost-app-1').label,'Docmost');
 assert.equal(serviceIdentity('cobalt-bot').label,'Bot');
 assert.equal(serviceIdentity('centre-docker-proxy').label,'Docker proxy');
});
test('every known service and unknown fallback resolve to a shipped local icon',()=>{
 for(const name of [null,'','unknown-api','adguard','uptime-kuma','docmost','dockge','convertx','cobalt','cobalt-bot','postgres','redis','nginx','centre-agent','centre-docker-proxy']){
  const {icon}=serviceIdentity(name);
  assert.ok(icon.startsWith('/icons/'));
  assert.ok(existsSync(new URL('../public'+icon,import.meta.url)),`${name}: ${icon}`);
 }
 assert.equal(serviceIdentity(null).label,'Container');
 assert.equal(serviceIdentity('unrelated-service').label,'Container');
});
