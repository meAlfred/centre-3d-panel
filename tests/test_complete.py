import json
import subprocess
from unittest.mock import patch

from agent.extended import directory_sizes
from agent.parsers import smart_summary
from test_host_and_api import make_host


def test_host_dmi_export_is_used_when_container_dmi_is_unavailable(tmp_path):
    _, host = make_host(tmp_path)
    (tmp_path/'dmi.txt').write_text('Memory Device\n    Size: 16 GB\n    Locator: DIMM1\n    Type: DDR4\n    Configured Memory Speed: 2666 MT/s\n')
    with patch('agent.host.subprocess.run', side_effect=FileNotFoundError):
        host.inventory()
    data = host.sample()
    assert data['memory']['slots_status'] == 'ok'
    assert data['memory']['slots'][0]['size_mb'] == 16384
    assert data['memory']['inventory_source'] == 'host-export'
    assert data['memory']['inventory_ts'] is not None


def test_named_gib_smart_counter_has_explicit_units():
    result = smart_summary({'ata_smart_attributes':{'table':[{'id':241,'name':'Lifetime_Writes_GiB','raw':{'value':139}}]}})
    assert result['tbw'] == round(139 * 2**30 / 1e12,4)
    unknown = smart_summary({'ata_smart_attributes':{'table':[{'id':241,'name':'Unknown_Attribute','raw':{'value':139}}]}})
    assert unknown['tbw'] is None


def test_directory_scan_timeout_does_not_invent_zero(tmp_path):
    _, host = make_host(tmp_path)
    (host.s.root/'home').mkdir()
    host.config['directory_roots'] = ['/home']
    with patch('agent.extended.subprocess.run', side_effect=subprocess.TimeoutExpired('du',8)):
        data = directory_sizes(host)
    assert data['items'] == []
    assert data['errors'] == ['unavailable:/home']


def test_mdraid_reports_only_present_arrays(tmp_path):
    _, host = make_host(tmp_path)
    assert host.sample()['raids'] == []
    base = host.s.sys/'class/block/md0/md'
    base.mkdir(parents=True)
    for name,value in {'level':'raid1','array_state':'clean','degraded':'0','sync_action':'resync','sync_completed':'50 / 100'}.items():
        (base/name).write_text(value)
    result=host.sample()['raids'][0]
    assert result['level']=='raid1' and result['sync_pct']==50 and result['degraded']==0
