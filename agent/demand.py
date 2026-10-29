"""Bounded viewer leases: no polling loop while the dashboard is unattended."""
import asyncio
import time
import threading


class Demand:
    def __init__(self, ttl=30.0, limit=32):
        self.ttl, self.limit = ttl, limit
        self.leases = {}
        self.active = asyncio.Event()
        self.running = threading.Event()
        self.changed = asyncio.Event()
        self.generation = 0

    def expire(self):
        now = time.monotonic()
        self.leases = {key: until for key, until in self.leases.items() if until > now}
        if not self.leases:
            self.active.clear()
            self.running.clear()

    def acquire(self, key):
        self.expire()
        if key not in self.leases and len(self.leases) >= self.limit:
            return False
        if not self.leases:
            self.generation += 1
        self.leases[key] = time.monotonic() + self.ttl
        self.active.set()
        self.running.set()
        self.changed.set()
        return True

    def renew(self, key):
        self.expire()
        return key in self.leases and self.acquire(key)

    def release(self, key):
        self.leases.pop(key, None)
        self.expire()
        self.changed.set()

    async def watch(self):
        while True:
            self.expire()
            self.changed.clear()
            delay = max(0, min(self.leases.values()) - time.monotonic()) if self.leases else None
            try:
                await asyncio.wait_for(self.changed.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass
