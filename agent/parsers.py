"""Pure parsers. No vendor-specific SMART guesses, no synthetic readings."""
import math
import re

from prometheus_client.parser import text_string_to_metric_families


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def pressure(text):
    result = {kind: {key: None for key in ('avg10', 'avg60', 'avg300', 'total_us')}
              for kind in ('some', 'full')}
    for line in text.splitlines():
        parts = line.split()
        if parts and parts[0] in result:
            for item in parts[1:]:
                key, _, value = item.partition('=')
                if key == 'total':
                    key = 'total_us'
                if key in result[parts[0]]:
                    result[parts[0]][key] = number(value)
    return result


def cpu_ticks(text):
    result = {}
    for line in text.splitlines():
        parts = line.split()
        if not parts or not re.fullmatch(r'cpu\d*', parts[0]):
            continue
        values = [int(x) for x in parts[1:]]
        # guest/guest_nice already included in user/nice, exclude them from sum.
        result[parts[0]] = (sum(values[:8]), sum(values[3:5]))
    return result


def cpu_usage(previous, current):
    result = {}
    for key, (total, idle) in current.items():
        old = previous.get(key)
        dt = total - old[0] if old else 0
        di = idle - old[1] if old else 0
        result[key] = round(max(0, min(100, 100 * (dt - di) / dt)), 2) if dt > 0 and di >= 0 else None
    return result


def rate(current, previous, elapsed, divisor=1):
    if previous is None or elapsed <= 0 or current < previous:
        return None
    return round((current - previous) / elapsed / divisor, 4)


def parse_dmi(text):
    slots = []
    for block in re.split(r'\n\s*\n', text):
        if not re.search(r'^\s*Memory Device\s*$', block, re.M):
            continue
        fields = {}
        for line in block.splitlines():
            key, sep, value = line.strip().partition(':')
            if sep:
                fields[key] = value.strip()
        size = fields.get('Size', '')
        match = re.fullmatch(r'(\d+) (MB|GB|kB)', size)
        populated = False if size == 'No Module Installed' else True if match else None
        size_mb = (int(match[1]) * {'GB': 1024, 'MB': 1, 'kB': 1 / 1024}[match[2]]) if match else None
        speed = fields.get('Configured Memory Speed') or fields.get('Speed', '')
        speed_match = re.match(r'(\d+) (?:MT/s|MHz)', speed)
        slots.append({
            'index': len(slots), 'locator': fields.get('Locator'),
            'populated': populated, 'size_mb': size_mb,
            'type': fields.get('Type') if populated else None,
            'speed_mts': int(speed_match[1]) if speed_match and populated else None,
        })
    return slots


MEMORY_TYPES = {0x03: 'DRAM', 0x0F: 'SDRAM', 0x12: 'DDR', 0x13: 'DDR2', 0x14: 'DDR2 FB-DIMM', 0x18: 'DDR3',
                0x1A: 'DDR4', 0x1B: 'LPDDR', 0x1C: 'LPDDR2', 0x1D: 'LPDDR3', 0x1E: 'LPDDR4', 0x1F: 'Logical non-volatile',
                0x20: 'HBM', 0x21: 'HBM2', 0x22: 'DDR5', 0x23: 'LPDDR5', 0x24: 'HBM3'}


def parse_smbios_memory(table):
    """Type 17 (Memory Device) records from a raw SMBIOS table, e.g. /sys/firmware/dmi/tables/DMI.

    Same output shape as parse_dmi(), so either source can feed the dashboard.
    """
    slots, i = [], 0
    while i + 4 <= len(table):
        kind, length = table[i], table[i + 1]
        if length < 4 or i + length > len(table):
            break
        end = i + length
        j = end
        while j + 1 < len(table) and not (table[j] == 0 and table[j + 1] == 0):
            j += 1
        strings = [s.decode('ascii', 'replace').strip() for s in table[end:j].split(b'\0')] if j > end else []
        if kind == 17 and length >= 0x15:
            record = table[i:end]
            word = lambda at: int.from_bytes(record[at:at + 2], 'little') if len(record) >= at + 2 else None
            text = lambda at: (strings[record[at] - 1] or None) if len(record) > at and 0 < record[at] <= len(strings) else None
            size = word(0x0C)
            if size == 0:
                populated, size_mb = False, None
            elif size == 0xFFFF or size is None:
                populated, size_mb = None, None
            elif size == 0x7FFF and len(record) >= 0x20:
                populated, size_mb = True, int.from_bytes(record[0x1C:0x20], 'little') & 0x7FFFFFFF
            else:
                populated, size_mb = True, (size & 0x7FFF) / 1024 if size & 0x8000 else size
            speed = word(0x20) if length >= 0x22 else None
            if not speed or speed == 0xFFFF:
                speed = word(0x15) if length >= 0x17 else None
            slots.append({
                'index': len(slots), 'locator': text(0x10), 'populated': populated, 'size_mb': size_mb,
                'type': MEMORY_TYPES.get(record[0x12]) if populated else None,
                'speed_mts': speed if populated and speed and speed != 0xFFFF else None,
            })
        if kind == 127:
            break
        i = j + 2
    return slots


def smart_summary(data):
    passed = data.get('smart_status', {}).get('passed')
    nvme = data.get('nvme_smart_health_information_log', {})
    attrs = data.get('ata_smart_attributes', {}).get('table', [])
    tbw = round(nvme['data_units_written'] * 512000 / 1e12, 4) if 'data_units_written' in nvme else None
    for attribute in attrs:
        # The smartctl drive database explicitly supplies the counter's units.
        raw = attribute.get('raw', {}).get('value')
        if attribute.get('id') == 241 and attribute.get('name') == 'Lifetime_Writes_GiB' and isinstance(raw, (int, float)) and raw >= 0:
            tbw = round(raw * 2**30 / 1e12, 4)
    return {
        'health': 'PASSED' if passed is True else 'FAILED' if passed is False else None,
        'power_on_hours': data.get('power_on_time', {}).get('hours', nvme.get('power_on_hours')),
        'wear_pct': nvme.get('percentage_used'),
        # NVMe data units are standardized. ATA vendor counters are not.
        'tbw': tbw,
        'temp_c': data.get('temperature', {}).get('current', nvme.get('temperature')),
        'attributes': [{'id': x.get('id'), 'name': x.get('name'), 'value': x.get('value'),
                        'raw': x.get('raw', {}).get('value')} for x in attrs],
    }


def docker_usage(stats, old):
    cpu = stats.get('cpu_stats', {})
    prev = old.get('cpu_stats', {}) if old else {}
    now_usage = cpu.get('cpu_usage', {}).get('total_usage')
    old_usage = prev.get('cpu_usage', {}).get('total_usage')
    system = cpu.get('system_cpu_usage')
    old_system = prev.get('system_cpu_usage')
    cores = cpu.get('online_cpus') or len(cpu.get('cpu_usage', {}).get('percpu_usage', []))
    pct = None
    if None not in (now_usage, old_usage, system, old_system) and system > old_system and now_usage >= old_usage and cores:
        pct = round((now_usage - old_usage) / (system - old_system) * cores * 100, 2)
    mem = stats.get('memory_stats', {})
    cache = mem.get('stats', {}).get('inactive_file', mem.get('stats', {}).get('total_inactive_file', 0))
    used = max(0, mem['usage'] - cache) / 2**20 if 'usage' in mem else None
    return pct, round(used, 2) if used is not None else None


def kuma_services(text):
    monitors = {}
    for family in text_string_to_metric_families(text):
        for sample in family.samples:
            if sample.name not in ('monitor_status', 'monitor_response_time', 'monitor_response_time_seconds', 'monitor_uptime_ratio'):
                continue
            name = sample.labels.get('monitor_name')
            if not name:
                continue
            key = sample.labels.get('monitor_id', name)
            row = monitors.setdefault(key, {'id': key, 'name': name, 'up': None, 'status': None, 'latency_ms': None, 'uptime_24h': None})
            value = number(sample.value)
            if sample.name == 'monitor_status':
                row['status'] = value
                # Pending/maintenance are not equivalent to healthy or down.
                row['up'] = True if value == 1 else False if value == 0 else None
            elif sample.name == 'monitor_response_time':
                row['latency_ms'] = value
            elif sample.name == 'monitor_response_time_seconds':
                row['latency_ms'] = value * 1000 if value is not None else None
            elif sample.labels.get('window') == '24h' and value is not None:
                row['uptime_24h'] = value * 100
    return list(monitors.values())
