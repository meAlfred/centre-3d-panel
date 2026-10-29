from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class Record(BaseModel):
    model_config = ConfigDict(extra='allow', allow_inf_nan=False)


class Source(Record):
    status: Literal['starting', 'ok', 'error', 'disabled', 'stale']
    observed_at: float | None = None
    age_s: float | None = None
    error: str | None = None


class Host(Record):
    name: str | None
    model: str | None = None
    os: str | None
    uptime_s: float | None
    load: list[float | None]


class Process(Record):
    pid: int
    name: str
    cpu: float | None
    mem_mb: float | None


class CPU(Record):
    model: str | None
    cores: int | None
    threads: int
    usage_total: float | None
    per_core: list[float | None]
    per_thread: list[float | None]
    core_map: list[dict[str, Any]]
    freq_mhz: float | None
    temp_c: float | None
    temp_max_c: float | None
    pressure_some_60s: float | None
    pressure: dict[str, dict[str, float | None]]
    top_processes: list[Process]


class Slot(Record):
    index: int
    populated: bool | None
    size_mb: float | None
    locator: str | None
    type: str | None
    speed_mts: int | None


class Memory(Record):
    total_mb: float | None
    used_mb: float | None
    cached_mb: float | None
    available_mb: float | None
    swap_total_mb: float | None
    swap_used_mb: float | None
    pressure_some_60s: float | None
    pressure: dict[str, dict[str, float | None]]
    slots: list[Slot]
    slots_status: Literal['ok', 'unavailable']
    top_processes: list[Process]


class Disk(Record):
    id: str | None
    kind: Literal['ssd', 'hdd', 'empty', 'unknown', 'unavailable']
    bay: int | None
    model: str | None = None
    size_gb: float | None = None
    used_gb: float | None = None
    temp_c: float | None = None
    read_mbs: float | None = None
    write_mbs: float | None = None
    iops: float | None = None
    smart: dict[str, Any] | None = None


class Network(Record):
    iface: str
    rx_mbs: float | None
    tx_mbs: float | None
    link_mbps: float | None
    link_up: bool | None


class ContainerPort(Record):
    container_port: int = Field(ge=1, le=65535)
    protocol: Literal['tcp', 'udp', 'sctp']
    host_ip: str | None = None
    host_port: int | None = Field(default=None, ge=1, le=65535)


class Container(Record):
    ports: list[ContainerPort] = Field(default_factory=list)
    id: str
    name: str | None
    state: str | None
    cpu: float | None
    mem_mb: float | None
    uptime_s: float | None
    health: str | None
    error: str | None


class Service(Record):
    id: str
    name: str
    up: bool | None
    latency_ms: float | None
    uptime_24h: float | None


class Snapshot(Record):
    service_host: str | None = None
    schema_version: Literal['1.0'] = '1.0'
    ts: float
    sequence: int = Field(ge=1)
    mock: Literal[False] = False
    host: Host
    cpu: CPU
    memory: Memory
    disks: list[Disk]
    network: list[Network]
    fans: list[dict[str, Any]]
    docker: list[Container]
    services: list[Service]
    sources: dict[str, Source]
    warnings: list[str]
    capabilities: dict[str, bool]
    directories: dict[str, Any] | None = None
    raids: list[dict[str, Any]] = Field(default_factory=list)
    igpu: dict[str, Any] | None = None
