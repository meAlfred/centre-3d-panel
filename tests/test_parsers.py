from types import SimpleNamespace
import pytest

from agent.config import validate_bind
from agent.parsers import cpu_ticks, cpu_usage, docker_usage, kuma_services, parse_dmi, pressure, rate, smart_summary


def test_cpu_excludes_guest_and_uses_counter_deltas():
    old = cpu_ticks('cpu 100 0 0 100 0 0 0 0 50 0\ncpu0 100 0 0 100 0 0 0 0 50 0')
    new = cpu_ticks('cpu 150 0 0 150 0 0 0 0 80 0\ncpu0 150 0 0 150 0 0 0 0 80 0')
    assert cpu_usage(old, new) == {'cpu': 50, 'cpu0': 50}
    assert cpu_usage({}, old)['cpu'] is None
    assert cpu_usage(new, old)['cpu'] is None


def test_rates_warmup_reset_and_units():
    assert rate(9_000_000, 5_000_000, 2, 1e6) == 2
    assert rate(100, None, 2) is None
    assert rate(10, 100, 2) is None
    assert rate(100, 100, 2) == 0


def test_psi_some_full_are_separate():
    data = pressure('some avg10=2.3 avg60=1.2 avg300=0.1 total=120\nfull avg10=0.4 avg60=0.2 avg300=0.1 total=30')
    assert data['some']['avg60'] == 1.2
    assert data['full']['avg10'] == .4
    assert data['full']['total_us'] == 30
    assert pressure('')['some']['avg60'] is None


@pytest.mark.parametrize('size,expected', [('16 GB',16384), ('8192 MB',8192)])
def test_dmi_does_not_assume_two_modules(size, expected):
    text = f'''Handle 0x01, DMI type 17, 40 bytes
Memory Device
    Size: {size}
    Locator: DIMM1
    Type: DDR4
    Configured Memory Speed: 2666 MT/s

Handle 0x02, DMI type 17, 40 bytes
Memory Device
    Size: No Module Installed
    Locator: DIMM2

Handle 0x03, DMI type 17, 40 bytes
Memory Device
    Size: Unknown
    Locator: DIMM3
'''
    slots = parse_dmi(text)
    assert len(slots) == 3
    assert slots[0]['size_mb'] == expected
    assert slots[0]['speed_mts'] == 2666
    assert slots[1]['populated'] is False
    assert slots[2]['populated'] is None


def test_smart_failure_is_preserved_without_ata_wear_guess():
    data = {'smart_status':{'passed':False}, 'power_on_time':{'hours':120},
            'ata_smart_attributes':{'table':[{'id':231,'name':'SSD_Life_Left','value':97,'raw':{'value':0}}]}}
    result = smart_summary(data)
    assert result['health'] == 'FAILED'
    assert result['wear_pct'] is None
    assert result['tbw'] is None
    assert result['power_on_hours'] == 120


def test_nvme_tbw_standard_units():
    result = smart_summary({'nvme_smart_health_information_log':{'data_units_written':1_000_000,'percentage_used':3}})
    assert result['tbw'] == .512
    assert result['wear_pct'] == 3


def test_docker_cpu_and_inactive_file_cache():
    old = {'cpu_stats':{'cpu_usage':{'total_usage':100},'system_cpu_usage':1000}}
    new = {'cpu_stats':{'cpu_usage':{'total_usage':200},'system_cpu_usage':2200,'online_cpus':12},
           'memory_stats':{'usage':200*2**20,'stats':{'inactive_file':50*2**20}}}
    assert docker_usage(new, old) == (100, 150)
    assert docker_usage(new, None) == (None, 150)


def test_kuma_unknown_and_maintenance_not_false_healthy():
    rows = kuma_services('''monitor_status{monitor_name="Docmost",monitor_id="1"} 1
monitor_response_time{monitor_name="Docmost",monitor_id="1"} 24
monitor_status{monitor_name="AdGuard",monitor_id="2"} 0
monitor_status{monitor_name="Backup",monitor_id="3"} 3
''')
    assert rows[0]['up'] is True and rows[0]['latency_ms'] == 24
    assert rows[0]['uptime_24h'] is None
    assert rows[1]['up'] is False
    assert rows[2]['up'] is None


def test_bind_accepts_any_valid_address_and_rejects_garbage():
    for address in ['127.0.0.1', '::1', '0.0.0.0', '192.168.1.10']:
        validate_bind(address)
    with pytest.raises(ValueError):
        validate_bind('not-an-ip')
