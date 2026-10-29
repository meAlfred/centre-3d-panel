from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import subprocess
import time

import docker
import httpx

from .parsers import docker_usage, kuma_services, smart_summary
from .parsers import rate
from .ports import container_ports
from .visible_process import visible_run, CollectionPaused


class DockerCollector:
    def __init__(self, active=None, base_url='unix:///var/run/docker.sock'):
        self.active = active
        self.base_url = base_url
        self.client = None
        self.previous = {}
        self.network_previous = {}

    def sample(self):
        if self.client is None:
            self.client = docker.DockerClient(base_url=self.base_url, timeout=2)
        containers = self.client.containers.list(all=True, sparse=True)
        def actual_name(container):
            # Sparse Docker list returns Names[], while inspect returns Name.
            name = container.name
            if isinstance(name, str) and name.strip('/'):
                return name.lstrip('/')
            names = container.attrs.get('Names', [])
            if isinstance(names, list):
                return next((value.lstrip('/') for value in names
                             if isinstance(value, str) and value.strip('/')), None)
            return None

        def collect(container):
            if self.active is not None and not self.active.is_set():
                raise CollectionPaused()
            row = {'id': container.id[:12], 'name': actual_name(container), 'state': None,
                   'cpu': None, 'mem_mb': None, 'uptime_s': None, 'health': None, 'error': None,
                   'rx_mbs': None, 'tx_mbs': None, 'network_mode': None, 'ports': []}
            try:
                container.reload()
                row['name'] = actual_name(container) or row['name']
                state = container.attrs.get('State', {})
                row.update(state=state.get('Status'), health=state.get('Health', {}).get('Status'))
                row['network_mode'] = container.attrs.get('HostConfig', {}).get('NetworkMode')
                row['ports'] = container_ports(container.attrs)
                if self.active is not None and not self.active.is_set():
                    raise CollectionPaused()
                if row['state'] == 'running':
                    started = state.get('StartedAt')
                    if started:
                        dt = datetime.fromisoformat(started.replace('Z', '+00:00'))
                        row['uptime_s'] = max(0, (datetime.now(timezone.utc) - dt).total_seconds())
                    # One non-streaming counter sample; do not wait for two Docker samples.
                    stats = container.stats(stream=False, one_shot=True)
                    row['cpu'], row['mem_mb'] = docker_usage(stats, self.previous.get(container.id))
                    self.previous[container.id] = stats
                    if row['network_mode'] != 'host' and stats.get('networks'):
                        stamp = time.monotonic()
                        current = (sum(n.get('rx_bytes', 0) for n in stats['networks'].values()),
                                   sum(n.get('tx_bytes', 0) for n in stats['networks'].values()), stamp)
                        previous = self.network_previous.get(container.id)
                        if previous:
                            row['rx_mbs'] = rate(current[0], previous[0], stamp - previous[2], 1e6)
                            row['tx_mbs'] = rate(current[1], previous[1], stamp - previous[2], 1e6)
                        self.network_previous[container.id] = current
                else:
                    self.previous.pop(container.id, None)
                    self.network_previous.pop(container.id, None)
            except (docker.errors.DockerException, ValueError, KeyError, OSError):
                row['error'] = 'container_read_failed'
            return row
        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(collect, containers))
        live = {c.id for c in containers}
        self.previous = {k: v for k, v in self.previous.items() if k in live}
        self.network_previous = {k: v for k, v in self.network_previous.items() if k in live}
        return rows

    def reset_rates(self):
        self.previous.clear()
        self.network_previous.clear()

    def close(self):
        if self.client:
            self.client.close()


def smart_device(disk_path, dev_root):
    """smartctl arguments for one block device, or None when the bus has no SMART.

    Devices live under a mounted copy of /dev, so smartctl can't guess the
    transport from the path and gets it explicitly."""
    from .host import read
    name, node = disk_path.name, str(dev_root / disk_path.name)
    if name.startswith('nvme'):
        return [['-d', 'nvme', node]]
    if name.startswith('hd'):
        return [['-d', 'ata', node]]
    if name.startswith('sd'):
        vendor = read(disk_path / 'device/vendor').strip().upper()
        return [['-d', 'sat', node]] if vendor == 'ATA' else [['-d', 'sat', node], ['-d', 'scsi', node]]
    return None  # virtio, Xen, SD/eMMC


class SmartCollector:
    def __init__(self, host, active=None):
        self.active = active
        self.host = host
        self.cache = {}
        self.last_poll = {}

    def sample(self):
        live = set()
        for disk in self.host.disks():
            live.add(disk.name)
            previous = self.cache.get(disk.name, {})
            # Identify replacements at the same /dev name before reusing a reading.
            from .host import disk_identity
            identity = disk_identity(disk)
            if previous.get('identity') != identity:
                previous = {}
                self.last_poll.pop(disk.name, None)
            now = time.monotonic()
            if now - self.last_poll.get(disk.name, -float('inf')) < self.host.s.smart_interval:
                continue
            self.last_poll[disk.name] = now
            item = {**previous, 'identity': identity, 'checked_at': time.time()}
            attempts = smart_device(disk, self.host.s.dev)
            if attempts is None:
                item.update(status='unsupported', error=None)
                self.cache[disk.name] = item
                continue
            try:
                for args in attempts:
                    result = visible_run(['smartctl', '-j', '-a', '-n', 'standby,2', *args], active=self.active, timeout=8)
                    data = json.loads(result.stdout)
                    summary = smart_summary(data)
                    has_reading = summary['health'] is not None or summary['power_on_hours'] is not None or bool(summary['attributes'])
                    if has_reading:
                        break
                if has_reading:
                    item.update(data=summary, observed_at=time.time(), status='ok', error=None)
                else:
                    messages = ' '.join(x.get('string', '') for x in data.get('smartctl', {}).get('messages', []))
                    standby = any(word in messages.upper() for word in ('STANDBY', 'SLEEP'))
                    item.update(status='standby' if standby else 'unavailable', error=None if standby else 'smart_unavailable')
                item['exit_status'] = result.returncode
            except CollectionPaused:
                self.last_poll.pop(disk.name, None)
                raise
            except (OSError, ValueError, subprocess.TimeoutExpired):
                item.update(status='unavailable', error='smart_unavailable')
            self.cache[disk.name] = item
        self.cache = {k: v for k, v in self.cache.items() if k in live}
        self.last_poll = {k: v for k, v in self.last_poll.items() if k in live}
        return dict(self.cache)


def collect_kuma(settings):
    if not settings.kuma_url:
        return []
    # Credentials never go into snapshots, logs, frontend, or exception strings.
    auth = ('', settings.kuma_key) if settings.kuma_key else (settings.kuma_user, settings.kuma_password)
    with httpx.Client(timeout=4, follow_redirects=False, trust_env=False) as client:
        response = client.get(settings.kuma_url, auth=auth)
        response.raise_for_status()
        return kuma_services(response.text)
