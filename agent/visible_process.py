"""Stop expensive subprocess collectors when the last viewer leaves."""
import subprocess
import time


class CollectionPaused(Exception):
    pass


def visible_run(command, *, active=None, timeout=8):
    if active is None:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if not active.is_set():
        raise CollectionPaused()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    start = time.monotonic()
    try:
        while True:
            if not active.is_set():
                raise CollectionPaused()
            remaining = timeout - (time.monotonic() - start)
            if remaining <= 0:
                raise subprocess.TimeoutExpired(command, timeout)
            try:
                out, err = process.communicate(timeout=min(.2, remaining))
                return subprocess.CompletedProcess(command, process.returncode, out, err)
            except subprocess.TimeoutExpired:
                pass
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.communicate(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
