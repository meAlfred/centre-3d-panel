import asyncio
import sys
import threading
from unittest.mock import Mock, patch

import httpx
from agent.app import create_app
from agent.demand import Demand
from agent.ports import container_ports
from agent.visible_process import visible_run, CollectionPaused
from test_host_and_api import make_host


def test_port_mapping_expose_is_not_published_and_malformed_bindings_are_ignored():
    result = container_ports({'Config': {'ExposedPorts': {'5432/tcp': {}}}, 'NetworkSettings': {'Ports': {
        '80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '8080'}, {'HostIp': '::', 'HostPort': '8080'}],
        '53/udp': [{'HostIp': '127.0.0.1', 'HostPort': '53'}],
        'invalid': [], '443/tcp': [{'HostIp': 'bad@host', 'HostPort': '443'}],
    }}})
    assert {'container_port': 5432, 'protocol': 'tcp', 'host_ip': None, 'host_port': None} in result
    assert len([p for p in result if p['container_port'] == 80 and p['host_port'] == 8080]) == 2
    assert not any(p['host_ip'] == 'bad@host' for p in result)
    assert next(p for p in result if p['container_port'] == 53)['host_ip'] == '127.0.0.1'


def test_leases_expire_and_multiple_viewers_keep_collectors_awake():
    async def run():
        d = Demand(ttl=.05)
        watcher = asyncio.create_task(d.watch())
        try:
            d.acquire('one');d.acquire('two');generation = d.generation
            d.release('one');assert d.active.is_set()
            assert d.renew('two');assert d.generation == generation
            await asyncio.sleep(.08)
            assert not d.active.is_set() and not d.running.is_set()
            assert not d.renew('two')
            d.acquire('new');assert d.generation == generation + 1
        finally:
            watcher.cancel();await asyncio.gather(watcher, return_exceptions=True)
    asyncio.run(run())


def test_idle_health_does_not_collect_metrics_reads_wake_and_stream_cleanup_sleeps(tmp_path):
    settings, host = make_host(tmp_path)
    app = create_app(settings);t = app.state.telemetry;t.host = host
    sample = Mock(wraps=host.sample);host.sample = sample;host.inventory = Mock()
    t.docker.sample = Mock(return_value=[]);t.smart.sample = Mock(return_value={})
    async def run():
        with patch('agent.app.directory_sizes', return_value=None):
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                    for _ in range(3):
                        response = await client.get('/healthz')
                        assert response.status_code == 200 and response.json()['mode'] == 'idle'
                    await asyncio.sleep(.04)
                    assert sample.call_count == 0 and t.docker.sample.call_count == 0
                    response = await client.get('/api/metrics')
                    assert response.status_code == 200
                    assert response.json()['cpu']['usage_total'] is None
                    count = sample.call_count
                    await asyncio.sleep(.15)
                    assert sample.call_count == count and not t.demand.active.is_set()
                    stream = next(route.endpoint for route in app.routes if route.path == '/api/stream')
                    class Request:
                        async def is_disconnected(self): return False
                    one = await stream(Request(), 'viewer-one-1234567')
                    two = await stream(Request(), 'viewer-two-1234567')
                    await anext(one.body_iterator);await anext(two.body_iterator)
                    assert len(t.subscribers) == 2
                    assert (await client.post('/api/viewer/viewer-one-1234567/heartbeat')).status_code == 204
                    await one.body_iterator.aclose();assert t.demand.active.is_set()
                    await two.body_iterator.aclose();assert not t.demand.active.is_set()
                    assert (await client.post('/api/viewer/viewer-two-1234567/heartbeat')).status_code == 409
                    await asyncio.sleep(.15);count = sample.call_count
                    await asyncio.sleep(.15);assert sample.call_count == count
                    response = await client.get('/api/metrics')
                    assert response.status_code == 200 and response.json()['cpu']['usage_total'] is None
    asyncio.run(run())


def test_expensive_subprocess_is_terminated_when_viewer_leaves():
    active = threading.Event();active.set()
    timer = threading.Timer(.1, active.clear);timer.start()
    try:
        try:
            visible_run([sys.executable, '-c', 'import time; time.sleep(10)'], active=active, timeout=3)
        except CollectionPaused:
            pass
        else:
            raise AssertionError('collector did not stop')
    finally:
        timer.cancel()
