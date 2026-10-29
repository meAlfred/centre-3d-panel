import asyncio
import json
from pathlib import Path
import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from agent.app import create_app, encode_event
from agent.config import Settings
from agent.host import HostCollector
from agent.models import Snapshot


def make_host(tmp_path):
    proc, sys, root = [tmp_path / name for name in ('proc','sys','root')]
    def put(base, name, text):
        path = base / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    put(proc, 'stat', 'cpu 100 0 0 100 0 0 0 0\n' + ''.join(f'cpu{i} 10 0 0 10 0 0 0 0\n' for i in range(12)))
    put(proc, 'meminfo', 'MemTotal: 16777216 kB\nMemAvailable: 8388608 kB\nMemFree: 4194304 kB\nCached: 2097152 kB\nSwapTotal: 2097152 kB\nSwapFree: 2097152 kB\n')
    put(proc, 'cpuinfo', 'model name : Intel Core i7-8700\ncpu MHz : 3200\n')
    put(proc, 'uptime', '1234 9876')
    put(proc, 'loadavg', '0.4 0.5 0.6 1/10 44')
    put(proc, 'net/dev', 'header\nheader\nenp0s31f6: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0\n')
    for name in ('cpu','memory','io'):
        put(proc, f'pressure/{name}', 'some avg10=0 avg60=0 avg300=0 total=0')
    for i in range(12):
        put(sys, f'devices/system/cpu/cpu{i}/topology/physical_package_id','0')
        put(sys, f'devices/system/cpu/cpu{i}/topology/core_id',str(i % 6))
    put(sys,'class/block/sda/device/model','Kingston')
    put(sys,'class/block/sda/wwid','disk-a')
    put(sys,'class/block/sda/size','468862128')
    put(sys,'class/block/sda/queue/rotational','0')
    put(proc,'diskstats','8 0 sda 1 0 100 0 2 0 200 0 0 0 0')
    put(root,'etc/hostname','homelab')
    put(root,'etc/os-release','PRETTY_NAME="Debian GNU/Linux 13 (trixie)"')
    config = tmp_path/'host.json'
    config.write_text(json.dumps({'bays':[{'bay':0,'disk_identity':'disk-a'},{'bay':1,'disk_identity':None}]}))
    settings = Settings(proc=proc, sys=sys, root=root, config=config, interval=.1)
    host = HostCollector(settings)
    host.processes = lambda elapsed: ([],[])
    return settings, host


def test_host_physical_cores_empty_bay_and_warmup(tmp_path):
    settings, host = make_host(tmp_path)
    data = host.sample()
    assert data['cpu']['cores'] == 6
    assert data['cpu']['threads'] == 12
    assert data['cpu']['per_core'] == [None]*6
    assert data['cpu']['core_map'][0]['threads'] == [0,6]
    assert data['cpu']['usage_total'] is None
    assert data['memory']['used_mb'] == 8192
    assert data['memory']['swap_used_mb'] == 0
    assert data['cpu']['temp_c'] is None
    assert data['fans'] == []
    assert data['disks'][0]['kind'] == 'ssd'
    assert data['disks'][1]['kind'] == 'empty'
    host.previous_time = time.monotonic() - 2
    data = host.sample()
    assert data['disks'][0]['write_mbs'] == 0
    assert data['network'][0]['rx_mbs'] == 0
    assert data['host']['os'] == 'Debian GNU/Linux 13 (trixie)'


def test_missing_configured_disk_is_not_free_bay(tmp_path):
    _, host = make_host(tmp_path)
    host.config['bays'][0]['disk_identity'] = 'missing-disk'
    data = host.sample()
    assert next(d for d in data['disks'] if d['bay'] == 0)['kind'] == 'unavailable'
    assert data['disks'][0]['bay'] is None


def test_api_schema_partial_failure_stale_host_and_bounded_queue(tmp_path):
    settings, host = make_host(tmp_path)
    app = create_app(settings)
    t = app.state.telemetry
    t.host = host
    client = TestClient(app)
    assert client.get('/api/metrics').status_code == 503
    stamp = time.time()
    t.state['host'] = {'status':'ok','observed_at':stamp,'error':None}
    t.state['docker'] = {'status':'error','observed_at':None,'error':'docker_collection_failed'}
    queue = asyncio.Queue(maxsize=1)
    t.subscribers.add(queue)
    for i in range(3):
        t.publish(host.sample(), stamp)
    assert queue.qsize() == 1
    assert queue.get_nowait()['sequence'] == 3
    response = client.get('/api/metrics')
    assert response.status_code == 200
    data = response.json()
    Snapshot.model_validate(data)
    assert data['mock'] is False and data['docker'] == []
    assert data['sources']['docker']['status'] == 'error'
    assert client.get('/api/schema').json()['title'] == 'Snapshot'
    t.state['host']['observed_at'] = time.time() - 20
    stale = client.get('/api/metrics')
    assert stale.status_code == 503
    assert stale.json()['ts'] == stamp
    assert stale.json()['sources']['host']['status'] == 'stale'
    assert client.get('/healthz').status_code == 503


def test_sse_encoding_preserves_null_and_timestamp():
    text = encode_event('metrics', {'ts':123,'temp_c':None,'host':'serveur-café'}, 8)
    assert text.startswith('id: 8\nevent: metrics\ndata: ')
    assert text.endswith('\n\n')
    assert json.loads(text.split('data: ')[1]) == {'ts':123,'temp_c':None,'host':'serveur-café'}


def test_smart_cache_and_standby_keep_original_age(tmp_path):
    from agent.sources import SmartCollector
    _, host = make_host(tmp_path)
    collector = SmartCollector(host)
    good = type('Result', (), {'stdout':json.dumps({'smart_status':{'passed':True}}), 'returncode':0})()
    sleeping = type('Result', (), {'stdout':json.dumps({'smartctl':{'messages':[{'string':'Device is in STANDBY mode'}]}}), 'returncode':2})()
    with patch('agent.sources.subprocess.run', return_value=good) as run:
        first = collector.sample()['sda']
        collector.sample()
        assert run.call_count == 1
    collector.last_poll['sda'] -= 61
    with patch('agent.sources.subprocess.run', return_value=sleeping):
        second = collector.sample()['sda']
    assert second['status'] == 'standby'
    assert second['observed_at'] == first['observed_at']


def test_invalid_docker_data_does_not_block_host(tmp_path, caplog):
    settings, host = make_host(tmp_path)
    t = create_app(settings).state.telemetry
    invalid = {'id':'abc', 'name':12345, 'state':'running', 'cpu':None,
               'mem_mb':None, 'uptime_s':None, 'health':None, 'error':None}

    async def run_once():
        t.demand.acquire('test-viewer')
        worker = asyncio.create_task(t.worker('docker', lambda: [invalid], 60))
        try:
            for _ in range(200):
                if t.state['docker']['status'] == 'error':
                    return
                await asyncio.sleep(.005)
            raise AssertionError('worker did not reject invalid data')
        finally:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)

    asyncio.run(run_once())
    assert t.data['docker'] == []
    assert t.state['docker']['status'] == 'error'
    t.publish(host.sample(), time.time())
    assert t.latest is not None
    assert 'name' in caplog.text and 'string_type' in caplog.text
    assert '12345' not in caplog.text
