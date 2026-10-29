import asyncio
from contextlib import asynccontextmanager
import copy
import json
import logging
import os
import time
import re
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import ValidationError

from .config import Settings
from .demand import Demand
from .visible_process import CollectionPaused
from .host import HostCollector
from .models import Container, Service, Snapshot
from .sources import DockerCollector, SmartCollector, collect_kuma
from .extended import directory_sizes, igpu_usage

log = logging.getLogger('centre')


class Telemetry:
    def __init__(self, settings):
        self.s = settings
        self.demand = Demand()
        self.host = HostCollector(settings)
        self.docker = DockerCollector(self.demand.running, settings.docker_host)
        self.smart = SmartCollector(self.host, self.demand.running)
        self.data = {'docker': [], 'smart': {}, 'kuma': [], 'directories': None, 'igpu': None}
        self.state = {key: {'status': 'starting', 'observed_at': None, 'error': None}
                      for key in ('host', 'docker', 'smart', 'kuma', 'directories', 'igpu')}
        self.igpu_enabled = os.getenv('ENABLE_IGPU', '0') == '1'
        if not self.igpu_enabled:
            self.state['igpu']['status'] = 'disabled'
        if not settings.kuma_url:
            self.state['kuma']['status'] = 'disabled'
        socket = settings.docker_host.removeprefix('unix://')
        self.docker_enabled = not settings.docker_host.startswith('unix://') or os.path.exists(socket)
        if not self.docker_enabled:
            self.state['docker']['status'] = 'disabled'
            log.warning('Docker socket %s not found; container view disabled', socket)
        self.latest = None
        self.host_snapshot = None
        self.sequence = 0
        self.subscribers = set()
        self.tasks = []
        self.published = asyncio.Event()
        self.host_generation = -1
        self.started = False

    async def worker(self, name, collect, interval):
        generation = -1
        while True:
            await self.demand.active.wait()
            self.demand.expire()
            if not self.demand.active.is_set():
                continue
            current_generation = self.demand.generation
            if generation != current_generation:
                # Run resets in the same worker as collection, never concurrently.
                if name in ('host', 'docker'):
                    getattr(self, name).reset_rates()
                generation = current_generation
            start = time.monotonic()
            try:
                data = await asyncio.to_thread(collect)
                if not self.demand.running.is_set() or current_generation != self.demand.generation:
                    continue
                observed = time.time()
                if name == 'host':
                    previous_state = self.state[name]
                    self.state[name] = {'status': 'ok', 'observed_at': observed, 'error': None}
                    try:
                        self.publish(data, observed)
                        self.host_snapshot = data
                        self.host_generation = current_generation
                    except Exception:
                        self.state[name] = previous_state
                        raise
                else:
                    # Reject invalid integration data at its own boundary. It must
                    # never poison an otherwise valid host snapshot.
                    if name == 'docker':
                        data = [Container.model_validate(row).model_dump() for row in data]
                    elif name == 'kuma':
                        data = [Service.model_validate(row).model_dump() for row in data]
                    self.data[name] = data
                    self.state[name] = {'status': 'ok', 'observed_at': observed, 'error': None}
                    if name == 'docker' and self.host_snapshot is not None:
                        # Container transitions reach SSE without waiting for the next host tick.
                        self.publish(self.host_snapshot, self.state['host']['observed_at'])
            except CollectionPaused:
                continue
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.state[name] = {**self.state[name], 'status': 'error', 'error': f'{name}_collection_failed'}
                if isinstance(exc, ValidationError):
                    details = [{'loc': error['loc'], 'type': error['type']} for error in
                               exc.errors(include_input=False, include_url=False, include_context=False)]
                    log.warning('%s validation failed: %s', name, json.dumps(details))
                else:
                    # Third-party exception strings may contain credentials.
                    log.warning('%s collector failed (%s)', name, type(exc).__name__)
            await asyncio.sleep(max(.1, interval - (time.monotonic() - start)))

    def source_states(self):
        result = copy.deepcopy(self.state)
        now = time.time()
        limits = {'host': self.s.interval * 3, 'docker': 6, 'smart': self.s.smart_interval * 2, 'kuma': 30, 'directories': 1200, 'igpu': 20}
        for name, value in result.items():
            value['age_s'] = max(0, round(now - value['observed_at'], 2)) if value['observed_at'] is not None else None
            if value['status'] == 'ok' and value['age_s'] > limits[name]:
                value['status'] = 'stale'
        return result

    def publish(self, data, observed):
        snapshot = copy.deepcopy(data)
        snapshot.update(service_host=self.s.public_host or None, ts=observed, sequence=self.sequence + 1, sources=self.source_states(),
                        docker=copy.deepcopy(self.data['docker']), services=copy.deepcopy(self.data['kuma']))
        for disk in snapshot['disks']:
            if disk['kind'] in ('empty', 'unavailable'):
                continue
            smart = copy.deepcopy(self.data['smart'].get(disk['id'], {}))
            if smart.get('identity') != disk.get('identity'):
                smart = {}
            summary = smart.pop('data', None)
            timestamp = smart.get('observed_at')
            smart['age_s'] = max(0, round(time.time() - timestamp, 2)) if timestamp is not None else None
            smart.setdefault('status', 'starting')
            if smart['status'] == 'ok' and smart['age_s'] is not None and smart['age_s'] > self.s.smart_interval * 2:
                smart['status'] = 'stale'
            disk['smart'] = {**(summary or {'health': None, 'power_on_hours': None, 'wear_pct': None, 'tbw': None}), **smart}
            disk['temp_c'] = summary.get('temp_c') if summary and smart['status'] == 'ok' else None
        snapshot['directories'] = copy.deepcopy(self.data['directories'])
        snapshot['igpu'] = copy.deepcopy(self.data['igpu']) if snapshot['sources']['igpu']['status'] == 'ok' else None
        if snapshot['directories']:
            for disk in snapshot['disks']:
                mounts = {f['mountpoint'] for f in disk.get('filesystems', [])}
                owned = []
                for item in snapshot['directories']['items']:
                    matching = [f['mountpoint'] for f in snapshot.get('filesystems', [])
                                if item['path'] == f['mountpoint'] or item['path'].startswith(f['mountpoint'].rstrip('/') + '/')]
                    owner = max(matching, key=len) if matching else None
                    if owner in mounts:
                        owned.append(item)
                if disk.get('id'):
                    disk['directories'] = owned
        snapshot['capabilities'] = {
            'dmi': snapshot['memory']['slots_status'] == 'ok',
            'cpu_temperature': snapshot['cpu']['temp_c'] is not None,
            'fans': bool(snapshot['fans']), 'igpu': snapshot['igpu'] is not None,
            'directory_sizes': snapshot['directories'] is not None,
            'network_top_consumers': any(c.get('rx_mbs') is not None for c in snapshot['docker']),
            'raid': bool(snapshot.get('raids')),
        }
        self.latest = Snapshot.model_validate(snapshot).model_dump()
        self.sequence += 1
        self.published.set()
        for queue in tuple(self.subscribers):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(self.latest)

    async def start(self):
        await asyncio.to_thread(self.host.inventory)
        self.started = True
        self.tasks = [asyncio.create_task(self.demand.watch()), asyncio.create_task(self.worker('host', self.host.sample, self.s.interval)),
                      asyncio.create_task(self.worker('smart', self.smart.sample, self.s.smart_interval))]
        if self.docker_enabled:
            self.tasks.append(asyncio.create_task(self.worker('docker', self.docker.sample, self.s.docker_interval)))
        self.tasks.append(asyncio.create_task(self.worker('directories', lambda: directory_sizes(self.host, self.demand.running), 600)))
        if self.igpu_enabled:
            self.tasks.append(asyncio.create_task(self.worker('igpu', lambda: igpu_usage(self.demand.running), 5)))
        if self.s.kuma_url:
            self.tasks.append(asyncio.create_task(self.worker('kuma', lambda: collect_kuma(self.s), self.s.kuma_interval)))

    async def stop(self):
        self.started = False
        self.demand.running.clear()
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.docker.close()


def encode_event(event, value, sequence=None):
    prefix = f'id: {sequence}\n' if sequence is not None else ''
    return prefix + f'event: {event}\ndata: ' + json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n\n'


def create_app(settings=None):
    settings = settings or Settings.from_env()
    telemetry = Telemetry(settings)

    @asynccontextmanager
    async def lifespan(app):
        await telemetry.start()
        yield
        await telemetry.stop()

    app = FastAPI(title='centre metrics agent', version='1.0.0', lifespan=lifespan,
                  docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None)
    app.state.telemetry = telemetry

    @app.get('/healthz')
    async def health():
        telemetry.demand.expire()
        if telemetry.started and not telemetry.demand.active.is_set():
            return JSONResponse({'status': 'ok', 'mode': 'idle', 'viewers': 0})
        state = telemetry.source_states()['host']
        healthy = telemetry.latest is not None and state['status'] == 'ok'
        return JSONResponse({'status': 'ok' if healthy else 'unavailable', 'mode': 'active', 'viewers': len(telemetry.demand.leases), 'host_source': state}, status_code=200 if healthy else 503)

    @app.get('/api/metrics', response_model=Snapshot)
    async def metrics():
        token = 'read-' + uuid.uuid4().hex
        if telemetry.started:
            if not telemetry.demand.acquire(token):
                raise HTTPException(503, 'Too many viewers')
            try:
                async with asyncio.timeout(8):
                    while telemetry.latest is None or telemetry.host_generation != telemetry.demand.generation:
                        telemetry.published.clear()
                        await telemetry.published.wait()
            except TimeoutError:
                raise HTTPException(503, 'Waiting for fresh metrics')
            finally:
                telemetry.demand.release(token)
        if telemetry.latest is None:
            raise HTTPException(503, 'The agent has not collected data yet')
        data = {**telemetry.latest, 'sources': telemetry.source_states()}
        status = 200 if data['sources']['host']['status'] == 'ok' else 503
        return JSONResponse(data, status_code=status, headers={'Cache-Control': 'no-store'})

    def viewer_id(value):
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,64}', value):
            raise HTTPException(400, 'Invalid viewer id')
        return value

    @app.post('/api/viewer/{viewer}/heartbeat', status_code=204)
    async def heartbeat(viewer: str):
        if not telemetry.demand.renew(viewer_id(viewer)):
            raise HTTPException(409, 'Viewer lease expired')

    @app.post('/api/viewer/{viewer}/leave', status_code=204)
    async def leave(viewer: str):
        telemetry.demand.release(viewer_id(viewer))

    @app.get('/api/stream')
    async def stream(request: Request, viewer: str | None = None):
        if len(telemetry.subscribers) >= 16:
            raise HTTPException(503, 'Too many SSE connections')
        token = viewer_id(viewer) if viewer else 'stream-' + uuid.uuid4().hex
        queue = asyncio.Queue(maxsize=1)

        async def events():
            if len(telemetry.subscribers) >= 16 or not telemetry.demand.acquire(token):
                return
            telemetry.subscribers.add(queue)
            try:
                yield 'retry: 2000\n\n'
                if telemetry.latest is not None:
                    latest = {**telemetry.latest, 'sources': telemetry.source_states()}
                    yield encode_event('metrics', latest, latest['sequence'])
                while not await request.is_disconnected():
                    telemetry.demand.expire()
                    if token not in telemetry.demand.leases:
                        return
                    if viewer is None:
                        telemetry.demand.renew(token)  # curl / monitoring clients use connection lifetime.
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=settings.interval)
                        yield encode_event('metrics', item, item['sequence'])
                    except asyncio.TimeoutError:
                        # A living SSE connection is not proof that readings are fresh.
                        yield encode_event('status', {'sources': telemetry.source_states(), 'last_ts': telemetry.latest['ts'] if telemetry.latest else None})
            finally:
                telemetry.subscribers.discard(queue)
                telemetry.demand.release(token)

        return StreamingResponse(events(), media_type='text/event-stream', headers={
            'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no',
        })

    @app.get('/api/schema')
    async def schema():
        return Snapshot.model_json_schema()

    return app
