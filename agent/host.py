from pathlib import Path
import json
import os
import re
import subprocess
import time

import psutil

from .parsers import cpu_ticks, cpu_usage, number, parse_dmi, parse_smbios_memory, pressure, rate


def read(path, default=''):
    try:
        return Path(path).read_text().strip()
    except (OSError, UnicodeError):
        return default


def disk_identity(path):
    return read(path / 'wwid') or read(path / 'device/wwid') or path.name


DISK_NAME = re.compile(r'(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)')

# Values firmware vendors leave in DMI fields when nobody filled them in.
DMI_JUNK = re.compile(r'^(to be filled.*|system product name|system version|system manufacturer|default string|'
                      r'not applicable|not specified|none|n/a|o\.?e\.?m\.?|oem|x\.x|0+|1234567890|0123456789|'
                      r'type1.*|base board.*|unknown|invalid|\W*)$', re.I)
VENDORS = {'asustek computer inc.': 'ASUS', 'micro-star international co., ltd.': 'MSI', 'micro-star international co., ltd': 'MSI',
           'gigabyte technology co., ltd.': 'Gigabyte', 'dell inc.': 'Dell', 'hewlett-packard': 'HP', 'hp': 'HP',
           'lenovo': 'Lenovo', 'asrock': 'ASRock', 'supermicro': 'Supermicro', 'intel corporation': 'Intel',
           'intel(r) client systems': 'Intel', 'fujitsu': 'Fujitsu', 'acer': 'Acer', 'apple inc.': 'Apple',
           'qemu': 'QEMU', 'innotek gmbh': 'VirtualBox', 'microsoft corporation': 'Microsoft', 'vmware, inc.': 'VMware'}
ARM_PARTS = {'0xd03': 'Cortex-A53', '0xd04': 'Cortex-A35', '0xd05': 'Cortex-A55', '0xd07': 'Cortex-A57',
             '0xd08': 'Cortex-A72', '0xd09': 'Cortex-A73', '0xd0a': 'Cortex-A75', '0xd0b': 'Cortex-A76',
             '0xd0c': 'Neoverse-N1', '0xd0d': 'Cortex-A77', '0xd40': 'Neoverse-V1', '0xd41': 'Cortex-A78',
             '0xd44': 'Cortex-X1', '0xd46': 'Cortex-A510', '0xd47': 'Cortex-A710', '0xd48': 'Cortex-X2',
             '0xd49': 'Neoverse-N2', '0xd4b': 'Cortex-A78C', '0xd4f': 'Neoverse-V2'}


def hardware_model(sys_path, firmware):
    """Human name of the machine: DMI on x86, the device tree on ARM boards."""
    dmi = sys_path / 'class/dmi/id'

    def clean(name):
        value = ' '.join(read(dmi / name).split())
        return '' if DMI_JUNK.match(value) else value

    vendor, product, version = clean('sys_vendor'), clean('product_name'), clean('product_version')
    # Lenovo keeps the machine-type code in product_name and the marketing name in product_version.
    if vendor.lower() == 'lenovo' and ' ' in version:
        product = version
    if not product:
        vendor, product = clean('board_vendor'), clean('board_name')
    if product:
        short = VENDORS.get(vendor.lower(), vendor)
        return product if not short or product.lower().startswith(short.lower()) else f'{short} {product}'
    tree = read(firmware / 'devicetree/base/model').strip('\x00').strip()
    return tree or None


def cpu_model(cpuinfo):
    for key in ('model name', 'Processor', 'cpu model', 'Hardware'):
        match = re.search(rf'^{key}\s*:\s*(.+)$', cpuinfo, re.M)
        if match and match[1].strip():
            return ' '.join(match[1].split())
    parts = re.findall(r'^CPU part\s*:\s*(0x[0-9a-f]+)$', cpuinfo, re.M | re.I)
    names = [ARM_PARTS.get(p.lower(), f'ARM {p}') for p in parts]
    if names:
        groups = {name: names.count(name) for name in dict.fromkeys(names)}
        return ' + '.join(f'{n}× {name}' for name, n in groups.items())
    return None


# Sensor preference: Intel package, AMD die, then common ARM / ACPI zones.
CPU_SENSORS = [('coretemp', lambda label: label.startswith('Package')), ('k10temp', lambda label: label == 'Tdie'),
               ('k10temp', lambda label: label == 'Tctl'), ('zenpower', lambda label: label in ('Tdie', 'Tctl')),
               ('coretemp', lambda label: label.startswith('Core')), ('cpu_thermal', None), ('cpu-thermal', None),
               ('soc_thermal', None), ('cpu0_thermal', None), ('acpitz', None)]


def cpu_temperature(temperatures):
    for chip, accept in CPU_SENSORS:
        rows = [x for x in temperatures if x['name'] == chip and x['temp_c'] is not None
                and (accept is None or accept(x['label']))]
        if rows:
            return max(rows, key=lambda x: x['temp_c'])
    return None


class HostCollector:
    def __init__(self, settings):
        self.s = settings
        psutil.PROCFS_PATH = str(settings.proc)
        self.previous_cpu = {}
        self.previous_disk = {}
        self.previous_network = {}
        self.previous_process = {}
        self.previous_time = None
        self.config = json.loads(read(settings.config, '{}'))
        self.slots = []
        self.dmi_error = None
        self.inventory_source = None
        self.inventory_ts = None
        self.model = None

    def reset_rates(self):
        self.previous_cpu.clear()
        self.previous_disk.clear()
        self.previous_network.clear()
        self.previous_process.clear()
        self.previous_time = None

    def inventory(self):
        self.model = self.config.get('model') or hardware_model(self.s.sys, self.s.firmware)
        try:
            result = subprocess.run(['dmidecode', '--type', '17'], capture_output=True, text=True, timeout=8)
            self.slots = parse_dmi(result.stdout)
            if result.returncode or not self.slots:
                self.dmi_error = 'DMI unavailable; DIMM layout is unknown'
            else:
                self.inventory_source = 'dmidecode'
                self.inventory_ts = time.time()
        except (OSError, subprocess.TimeoutExpired):
            self.dmi_error = 'dmidecode unavailable or timed out'
        if self.dmi_error:
            # Docker's default AppArmor profile hides /sys/firmware, so the compose file
            # mounts it elsewhere and we decode the raw SMBIOS table ourselves.
            try:
                slots = parse_smbios_memory((self.s.firmware / 'dmi/tables/DMI').read_bytes())
            except OSError:
                slots = []
            if slots:
                self.slots, self.dmi_error = slots, None
                self.inventory_source = 'smbios'
                self.inventory_ts = time.time()
        if self.dmi_error:
            exported = self.s.config.parent / 'dmi.txt'
            slots = parse_dmi(read(exported))
            if slots:
                self.slots, self.dmi_error = slots, None
                self.inventory_source = 'host-export'
                self.inventory_ts = exported.stat().st_mtime

    def disks(self):
        result = []
        for path in sorted((self.s.sys / 'class/block').glob('*')):
            if (path / 'partition').exists() or not (path / 'device').exists():
                continue
            if not DISK_NAME.fullmatch(path.name):
                continue
            result.append(path)
        return result

    def sensors(self):
        temperatures, fans = [], []
        for hw in sorted((self.s.sys / 'class/hwmon').glob('hwmon*')):
            chip = read(hw / 'name') or hw.name
            for path in hw.glob('temp*_input'):
                stem = path.name.removesuffix('_input')
                value = number(read(path))
                maximum = number(read(hw / (stem + '_crit')))
                if maximum is None:
                    maximum = number(read(hw / (stem + '_max')))
                temperatures.append({'name': chip, 'label': read(hw / (stem + '_label')) or stem,
                                     'temp_c': value / 1000 if value is not None else None,
                                     'max_c': maximum / 1000 if maximum is not None else None})
            for path in hw.glob('fan*_input'):
                stem = path.name.removesuffix('_input')
                fans.append({'name': f'{chip}:{read(hw / (stem + "_label")) or stem}', 'rpm': number(read(path))})
        return temperatures, fans

    def processes(self, elapsed):
        rows, current = [], {}
        for p in psutil.process_iter():
            try:
                with p.oneshot():
                    key = (p.pid, p.create_time())
                    ticks = p.cpu_times()
                    total = ticks.user + ticks.system
                    pct = rate(total, self.previous_process.get(key), elapsed, .01)
                    current[key] = total
                    rows.append({'pid': p.pid, 'name': p.name(), 'cpu': pct,
                                 'mem_mb': round(p.memory_info().rss / 2**20, 2)})
            except (psutil.Error, OSError):
                continue
        self.previous_process = current
        return (sorted(rows, key=lambda x: x['cpu'] if x['cpu'] is not None else -1, reverse=True)[:5],
                sorted(rows, key=lambda x: x['mem_mb'], reverse=True)[:5])

    def filesystems(self):
        result = []
        seen = set()
        # Host PID 1 mount namespace, not the agent container's mountinfo.
        for line in read(self.s.proc / '1/mountinfo').splitlines():
            left, sep, right = line.partition(' - ')
            fields, other = left.split(), right.split()
            if not sep or len(fields) < 5 or len(other) < 2:
                continue
            dev = fields[2]
            # Only block-backed mounts, deduplicated by device for bind mounts.
            if not (self.s.sys / 'dev/block' / dev).exists() or dev in seen:
                continue
            mount = re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), fields[4])
            if '..' in Path(mount).parts:
                continue
            target = self.s.root / mount.lstrip('/')
            try:
                stat = os.statvfs(target)
                total = stat.f_blocks * stat.f_frsize
                used = (stat.f_blocks - stat.f_bfree) * stat.f_frsize
            except OSError:
                total = used = None
            seen.add(dev)
            result.append({'device': dev, 'source': other[1], 'mountpoint': mount, 'type': other[0],
                           'size_gb': total / 1e9 if total is not None else None,
                           'used_gb': used / 1e9 if used is not None else None})
        return result

    def sample(self):
        now = time.monotonic()
        elapsed = now - self.previous_time if self.previous_time is not None else 0
        errors = []
        stat_text = read(self.s.proc / 'stat')
        mem_text = read(self.s.proc / 'meminfo')
        if not stat_text or not mem_text:
            raise RuntimeError('Host /proc is unavailable')
        ticks = cpu_ticks(stat_text)
        usage = cpu_usage(self.previous_cpu, ticks)
        logical_ids = sorted([int(k[3:]) for k in ticks if k != 'cpu'])
        topology = {}
        for index in logical_ids:
            base = self.s.sys / f'devices/system/cpu/cpu{index}/topology'
            package, core = read(base / 'physical_package_id'), read(base / 'core_id')
            if package and core:
                topology.setdefault((package, core), []).append(index)
        topology_known = sum(map(len, topology.values())) == len(logical_ids) and bool(logical_ids)
        groups = sorted(topology.items(), key=lambda x: tuple(int(v) for v in x[0])) if topology_known else []
        per_core = []
        for _, indices in groups:
            values = [usage.get(f'cpu{i}') for i in indices]
            per_core.append(round(sum(values) / len(values), 2) if all(v is not None for v in values) else None)
        if not topology_known:
            errors.append('cpu_topology_unavailable')
        cpuinfo = read(self.s.proc / 'cpuinfo')
        model = cpu_model(cpuinfo)
        frequencies = [float(x) for x in re.findall(r'^cpu MHz\s*:\s*([\d.]+)$', cpuinfo, re.M)]
        temperatures, fans = self.sensors()
        cpu_sensor = cpu_temperature(temperatures)
        psi = {kind: pressure(read(self.s.proc / 'pressure' / kind)) for kind in ('cpu', 'memory', 'io')}
        for kind, values in psi.items():
            if values['some']['avg60'] is None:
                errors.append(f'psi_{kind}_unavailable')
        memory_kb = {m[1]: int(m[2]) for m in re.finditer(r'^(\w+):\s+(\d+)', mem_text, re.M)}
        def mb(key):
            return memory_kb[key] / 1024 if key in memory_kb else None
        available, total = mb('MemAvailable'), mb('MemTotal')
        cached = ((memory_kb['Cached'] + memory_kb.get('SReclaimable', 0) - memory_kb.get('Shmem', 0)) / 1024
                  if 'Cached' in memory_kb else None)
        top_cpu, top_memory = self.processes(elapsed)
        disk_counters = {}
        for line in read(self.s.proc / 'diskstats').splitlines():
            f = line.split()
            if len(f) >= 14:
                disk_counters[f[2]] = (int(f[5]) * 512, int(f[9]) * 512, int(f[3]) + int(f[7]))
        filesystems = self.filesystems()
        disks = []
        bays = self.config.get('bays', [])
        present_keys = set()
        for path in self.disks():
            ident = disk_identity(path)
            present_keys.add(ident)
            bay = next((b['bay'] for b in bays if b.get('disk_identity') == ident), None)
            counters = disk_counters.get(path.name)
            previous = self.previous_disk.get(path.name)
            rates = [rate(counters[i], previous[i] if previous else None, elapsed, 1e6 if i < 2 else 1)
                     if counters else None for i in range(3)]
            devs = {read(path / 'dev')} | {read(p / 'dev') for p in path.glob(path.name + '*') if (p / 'partition').exists()}
            mounts = [f for f in filesystems if f['device'] in devs]
            rotational = read(path / 'queue/rotational')
            size = number(read(path / 'size'))
            disks.append({'id': path.name, 'identity': ident, 'kind': 'hdd' if rotational == '1' else 'ssd' if rotational == '0' else 'unknown',
                          'model': read(path / 'device/model') or None, 'bay': bay,
                          'size_gb': size * 512 / 1e9 if size is not None else None,
                          'used_gb': sum(f['used_gb'] for f in mounts) if mounts and all(f['used_gb'] is not None for f in mounts) else None,
                          'filesystems': mounts, 'temp_c': None, 'read_mbs': rates[0], 'write_mbs': rates[1], 'iops': rates[2],
                          'smart': None, 'directories': None})
        for bay in bays:
            ident = bay.get('disk_identity')
            if ident is None:
                disks.append({'id': None, 'kind': 'empty', 'bay': bay['bay']})
            elif ident not in present_keys:
                disks.append({'id': None, 'identity': ident, 'kind': 'unavailable', 'bay': bay['bay']})
                errors.append(f'configured_disk_missing_bay_{bay["bay"]}')
        network, net_counters = [], {}
        for line in read(self.s.proc / 'net/dev').splitlines()[2:]:
            iface, _, values = line.partition(':')
            iface, f = iface.strip(), values.split()
            if len(f) < 16 or iface == 'lo':
                continue
            current = (int(f[0]), int(f[8]))
            net_counters[iface] = current
            prev = self.previous_network.get(iface)
            link = number(read(self.s.sys / 'class/net' / iface / 'speed'))
            network.append({'iface': iface, 'rx_mbs': rate(current[0], prev[0] if prev else None, elapsed, 1e6),
                            'tx_mbs': rate(current[1], prev[1] if prev else None, elapsed, 1e6),
                            'link_mbps': link if link is not None and link > 0 else None,
                            'link_up': {'1': True, '0': False}.get(read(self.s.sys / 'class/net' / iface / 'carrier'))})
        os_release = read(self.s.root / 'etc/os-release')
        os_name = re.search(r'^PRETTY_NAME="?(.*?)"?$', os_release, re.M)
        loads = read(self.s.proc / 'loadavg').split()[:3]
        uptime_text = read(self.s.proc / 'uptime').split()
        if self.dmi_error:
            errors.append('dmi_unavailable')
        if not cpu_sensor:
            errors.append('cpu_temperature_unavailable')
        if not fans:
            errors.append('fan_rpm_unavailable')
        result = {
            'host': {'name': self.config.get('hostname') or self.s.host_name or read(self.s.root / 'etc/hostname') or None,
                     'model': self.model,
                     'os': os_name[1] if os_name else None, 'uptime_s': number(uptime_text[0]) if uptime_text else None,
                     'load': [number(x) for x in loads]},
            'cpu': {'model': model, 'cores': len(groups) if topology_known else None,
                    'threads': len(logical_ids), 'usage_total': usage.get('cpu'), 'per_core': per_core,
                    'core_map': [{'package': int(k[0]), 'core': int(k[1]), 'threads': ids} for k, ids in groups],
                    'per_thread': [usage.get(f'cpu{i}') for i in logical_ids],
                    'freq_mhz': round(sum(frequencies) / len(frequencies), 1) if frequencies else None,
                    'temp_c': cpu_sensor['temp_c'] if cpu_sensor else None, 'temp_max_c': cpu_sensor['max_c'] if cpu_sensor else None,
                    'pressure_some_60s': psi['cpu']['some']['avg60'], 'pressure': psi['cpu'], 'top_processes': top_cpu},
            'memory': {'total_mb': total, 'available_mb': available, 'used_mb': total - available if None not in (total, available) else None,
                       'cached_mb': cached, 'free_mb': mb('MemFree'), 'buffers_mb': mb('Buffers'),
                       'swap_total_mb': mb('SwapTotal'),
                       'swap_used_mb': mb('SwapTotal') - mb('SwapFree') if None not in (mb('SwapTotal'), mb('SwapFree')) else None,
                       'pressure_some_60s': psi['memory']['some']['avg60'], 'pressure': psi['memory'],
                       'slots': self.slots, 'slots_status': 'unavailable' if self.dmi_error else 'ok', 'top_processes': top_memory},
            'disks': disks, 'filesystems': filesystems, 'network': network, 'fans': fans,
            'temperatures': temperatures, 'io_pressure': psi['io'], 'warnings': errors,
        }
        result['memory'].update(inventory_source=self.inventory_source, inventory_ts=self.inventory_ts)
        raids = []
        for md in sorted((self.s.sys / 'class/block').glob('md*')):
            if not (md / 'md').exists():
                continue
            progress = read(md / 'md/sync_completed').split('/')
            done = number(progress[0]) if len(progress) == 2 else None
            total_sync = number(progress[1]) if len(progress) == 2 else None
            raids.append({'name': md.name, 'level': read(md / 'md/level'), 'state': read(md / 'md/array_state'),
                          'degraded': number(read(md / 'md/degraded')), 'sync_action': read(md / 'md/sync_action'),
                          'sync_pct': round(done / total_sync * 100, 2) if done is not None and total_sync else None,
                          'members': [p.name for p in (md / 'slaves').glob('*')]})
        result['raids'] = raids
        self.previous_cpu, self.previous_disk, self.previous_network = ticks, disk_counters, net_counters
        self.previous_time = now
        return result
