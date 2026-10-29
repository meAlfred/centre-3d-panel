import struct

from agent.host import cpu_model, cpu_temperature, hardware_model
from agent.parsers import parse_smbios_memory
from agent.sources import smart_device


def put(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def memory_device(size, locator, kind, speed, configured):
    record = bytearray(0x22)
    record[0], record[1] = 17, 0x22
    record[0x0C:0x0E] = struct.pack('<H', size)
    record[0x10], record[0x12] = locator, kind
    record[0x15:0x17] = struct.pack('<H', speed)
    record[0x20:0x22] = struct.pack('<H', configured)
    return bytes(record)


def test_raw_smbios_reports_populated_and_empty_slots():
    table = (memory_device(16384, 1, 0x22, 5600, 4800) + b'DIMM_A1\0BANK 0\0\0'
             + memory_device(0, 1, 0x02, 0, 0) + b'DIMM_A2\0\0'
             + memory_device(0x7FFF, 0, 0x1A, 3200, 0) + b'\0\0'
             + bytes([127, 4, 0, 0]) + b'\0\0')
    slots = parse_smbios_memory(table)
    assert slots[0] == {'index': 0, 'locator': 'DIMM_A1', 'populated': True, 'size_mb': 16384,
                        'type': 'DDR5', 'speed_mts': 4800}
    assert slots[1]['populated'] is False and slots[1]['locator'] == 'DIMM_A2'
    assert len(slots) == 3


def test_hardware_model_uses_friendly_names(tmp_path):
    dmi = tmp_path / 'sys/class/dmi/id'
    put(dmi / 'sys_vendor', 'LENOVO')
    put(dmi / 'product_name', '10SQS0MX00')
    put(dmi / 'product_version', 'ThinkCentre M720t')
    assert hardware_model(tmp_path / 'sys', tmp_path / 'fw') == 'Lenovo ThinkCentre M720t'
    put(dmi / 'sys_vendor', 'System manufacturer')
    put(dmi / 'product_name', 'System Product Name')
    put(dmi / 'board_vendor', 'ASUSTeK COMPUTER INC.')
    put(dmi / 'board_name', 'PRIME B450M-A')
    assert hardware_model(tmp_path / 'sys', tmp_path / 'fw') == 'ASUS PRIME B450M-A'


def test_hardware_model_falls_back_to_device_tree(tmp_path):
    put(tmp_path / 'fw/devicetree/base/model', 'Raspberry Pi 4 Model B Rev 1.4\0')
    assert hardware_model(tmp_path / 'sys', tmp_path / 'fw') == 'Raspberry Pi 4 Model B Rev 1.4'


def test_cpu_model_on_x86_and_arm():
    assert cpu_model('model name\t: AMD Ryzen 5 5600G with Radeon Graphics\n') == 'AMD Ryzen 5 5600G with Radeon Graphics'
    arm = ''.join(f'processor\t: {i}\nCPU part\t: 0xd08\n' for i in range(4))
    assert cpu_model(arm) == '4× Cortex-A72'


def test_cpu_temperature_prefers_package_sensors():
    rows = [{'name': 'acpitz', 'label': 'temp1', 'temp_c': 27.8},
            {'name': 'k10temp', 'label': 'Tctl', 'temp_c': 61.0},
            {'name': 'nvme', 'label': 'Composite', 'temp_c': 40.0}]
    assert cpu_temperature(rows)['temp_c'] == 61.0
    assert cpu_temperature([{'name': 'cpu_thermal', 'label': 'temp1', 'temp_c': 48.2}])['temp_c'] == 48.2
    assert cpu_temperature([{'name': 'nvme', 'label': 'Composite', 'temp_c': 40.0}]) is None


def test_smart_device_type_follows_bus(tmp_path):
    dev = tmp_path / 'dev'
    sata = tmp_path / 'sda'
    put(sata / 'device/vendor', 'ATA     ')
    usb = tmp_path / 'sdb'
    put(usb / 'device/vendor', 'Samsung ')
    assert smart_device(sata, dev) == [['-d', 'sat', str(dev / 'sda')]]
    assert smart_device(usb, dev)[-1] == ['-d', 'scsi', str(dev / 'sdb')]
    assert smart_device(tmp_path / 'nvme0n1', dev) == [['-d', 'nvme', str(dev / 'nvme0n1')]]
    assert smart_device(tmp_path / 'vda', dev) is None
