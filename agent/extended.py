"""Slow optional collectors, isolated from the two-second host loop."""
from pathlib import Path
import json
import subprocess
import time

from .host import read
from .visible_process import visible_run, CollectionPaused


def directory_sizes(host, active=None):
    items, errors = [], []
    roots = host.config.get('directory_roots', ['/var/lib/docker', '/home', '/var/log', '/opt', '/srv'])
    for relative in roots[:8]:
        path = Path(relative)
        if not path.is_absolute() or '..' in path.parts:
            errors.append('invalid_directory_root')
            continue
        target = host.s.root / relative.lstrip('/')
        if not target.exists():
            continue
        try:
            result = visible_run(['nice', '-n', '19', 'du', '-x', '-B1', '--max-depth=1', str(target)], active=active, timeout=8)
            if result.returncode:
                errors.append(f'unavailable:{relative}')
                continue
            for line in result.stdout.splitlines():
                size, _, directory = line.partition('\t')
                if size.isdigit() and directory:
                    shown = '/' + str(Path(directory).relative_to(host.s.root))
                    # Avoid parent/child double counting in the breakdown.
                    if Path(directory) == target:
                        items.append({'path': shown, 'size_gb': int(size) / 1e9})
        except (OSError, ValueError, subprocess.TimeoutExpired):
            errors.append(f'unavailable:{relative}')
    return {'items': sorted(items, key=lambda row: row['size_gb'], reverse=True),
            'observed_at': time.time(), 'errors': errors}


def igpu_usage(active=None):
    if active is not None and not active.is_set():
        raise CollectionPaused()
    process = subprocess.Popen(['intel_gpu_top', '-J', '-s', '1000', '-o', '-'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    start = time.monotonic()
    try:
        while True:
            if active is not None and not active.is_set():
                raise CollectionPaused()
            try:
                output, _ = process.communicate(timeout=.2)
                break
            except subprocess.TimeoutExpired:
                if time.monotonic() - start >= 2.4:
                    process.terminate()
                    try:
                        output, _ = process.communicate(timeout=1)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        output, _ = process.communicate()
                    break
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.communicate(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
    # intel_gpu_top emits a streaming JSON array, potentially not closed at exit.
    remaining = output.lstrip().removeprefix('[').lstrip()
    snapshots = []
    decoder = json.JSONDecoder()
    while remaining:
        try:
            sample, offset = decoder.raw_decode(remaining)
        except ValueError:
            break
        if isinstance(sample, dict):
            snapshots.append(sample)
        remaining = remaining[offset:].lstrip().lstrip(',').lstrip()
    valid = [s for s in snapshots if s.get('engines')]
    if not valid:
        raise RuntimeError('igpu_unavailable')
    engines = [{'name': k, 'busy_pct': v.get('busy')} for k, v in valid[-1]['engines'].items()]
    render = [e['busy_pct'] for e in engines if 'Render' in e['name'] and isinstance(e['busy_pct'], (float, int))]
    return {'busy_pct': max(render) if render else None, 'engines': engines}
