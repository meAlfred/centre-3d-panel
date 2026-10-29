from dataclasses import dataclass
from pathlib import Path
import ipaddress
import logging
import os

log = logging.getLogger('centre')


@dataclass(frozen=True)
class Settings:
    proc: Path = Path('/host/proc')
    sys: Path = Path('/sys')
    root: Path = Path('/host/root')
    dev: Path = Path('/host/dev')
    firmware: Path = Path('/host/firmware')
    config: Path = Path('/config/host.json')
    interval: float = 2.0
    smart_interval: float = 60.0
    docker_interval: float = 2.0
    kuma_interval: float = 10.0
    kuma_url: str = ''
    kuma_key: str = ''
    kuma_user: str = ''
    kuma_password: str = ''
    docker_host: str = 'unix:///var/run/docker.sock'
    host_name: str = ''
    public_host: str = ''
    bind: str = '127.0.0.1'
    port: int = 9108

    @classmethod
    def from_env(cls):
        s = cls(
            proc=Path(os.getenv('HOST_PROC', '/host/proc')),
            sys=Path(os.getenv('HOST_SYS', '/sys')),
            root=Path(os.getenv('HOST_ROOT', '/host/root')),
            dev=Path(os.getenv('HOST_DEV', '/host/dev')),
            firmware=Path(os.getenv('HOST_FIRMWARE', '/host/firmware')),
            config=Path(os.getenv('HOST_CONFIG', '/config/host.json')),
            interval=max(1, float(os.getenv('SAMPLE_INTERVAL', '2'))),
            smart_interval=max(60, float(os.getenv('SMART_INTERVAL', '60'))),
            kuma_url=os.getenv('KUMA_METRICS_URL', ''),
            kuma_key=os.getenv('KUMA_API_KEY', ''),
            kuma_user=os.getenv('KUMA_USERNAME', ''),
            kuma_password=os.getenv('KUMA_PASSWORD', ''),
            docker_host=os.getenv('DOCKER_HOST', '') or 'unix:///var/run/docker.sock',
            host_name=os.getenv('HOST_NAME', ''),
            public_host=os.getenv('PUBLIC_HOST', ''),
            bind=os.getenv('BIND_ADDRESS', '127.0.0.1'),
            port=int(os.getenv('PORT', '9108')),
        )
        if not 1 <= s.port <= 65535:
            raise ValueError('PORT must be 1..65535')
        return s


def validate_bind(address: str):
    """The agent is meant to sit behind the bundled nginx on loopback.

    Any other address is allowed, but the raw API exposes process and container
    names without authentication, so say so loudly.
    """
    ip = ipaddress.ip_address(address)
    if not ip.is_loopback:
        log.warning('Agent API is bound to %s, not loopback. It has no authentication; '
                    'make sure only trusted clients can reach it.', ip)
