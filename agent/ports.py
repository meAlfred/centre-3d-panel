"""Docker inspect port mappings; EXPOSE alone never becomes a public address."""
import ipaddress


def container_ports(attrs):
    exposed = (attrs.get('Config') or {}).get('ExposedPorts') or {}
    published = (attrs.get('NetworkSettings') or {}).get('Ports') or {}
    result = []
    for key in sorted(set(exposed) | set(published)):
        try:
            number, protocol = key.split('/')
            number = int(number)
            if not 1 <= number <= 65535 or protocol not in ('tcp', 'udp', 'sctp'):
                continue
        except (ValueError, AttributeError):
            continue
        bindings = published.get(key) or []
        rows = []
        for binding in bindings:
            try:
                port = int(binding.get('HostPort', ''))
                address = str(ipaddress.ip_address(binding.get('HostIp') or '0.0.0.0'))
                if not 1 <= port <= 65535:
                    continue
            except (ValueError, TypeError, AttributeError):
                continue
            rows.append({'container_port': number, 'protocol': protocol, 'host_ip': address, 'host_port': port})
        result.extend(rows or [{'container_port': number, 'protocol': protocol, 'host_ip': None, 'host_port': None}])
    return result
